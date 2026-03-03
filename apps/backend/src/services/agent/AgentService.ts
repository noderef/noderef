/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AgentMention } from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import { AgentRepository } from '../../repositories/agentRepository.js';
import type { ServerService } from '../serverService.js';
import { AgentRunEngine } from './AgentRunEngine.js';
import { AGENT_MANIFEST_VERSION } from './agentManifest.js';
import {
  buildPaginatedResponse,
  cleanText,
  createExecutionContext,
  emitRunEvent,
  extractErrorMessage,
  isRecord,
  nowIso,
  parseMentions,
  resolveAiRuntime,
} from './agentUtils.js';
import { searchMentions } from './searchMentions.js';
import { getToolByName, resolveToolName } from './tools/registry.js';
import type { AgentExecutionContext } from './types.js';

const log = createLogger('agent.service');

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i;
const MAX_PROPERTIES_JSON_CHARS = 20_000;

interface SendMessageInput {
  chatId: number;
  content: string;
  mentions?: AgentMention[];
  aiProvider?: string;
  aiModel?: string;
  appLanguage?: string;
  autoApproveConfirmations?: boolean;
}

interface ConfirmStepInput {
  runId: number;
  stepId: number;
  confirmationToken: string;
  approved: boolean;
  confirmationText?: string;
}

function normalizeAppLanguage(input: string | undefined): string | undefined {
  const trimmed = input?.trim();
  if (!trimmed || !LANGUAGE_CODE_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed.toLowerCase().replace('_', '-');
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1)}…`;
}

function inlineCode(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function buildNodeBrowserMarkdownLink(nodeId: string, nodeName?: string): string {
  const normalizedId = nodeId.trim();
  const normalizedName = typeof nodeName === 'string' ? nodeName.trim() : '';
  const label = normalizedName || normalizedId;
  if (!normalizedId) {
    return inlineCode(label || 'unknown');
  }

  const params = new URLSearchParams();
  if (normalizedName) {
    params.set('name', normalizedName);
  }
  const href = `nodebrowser://node/${encodeURIComponent(normalizedId)}${
    params.toString() ? `?${params.toString()}` : ''
  }`;

  return `[${escapeMarkdownLinkLabel(label)}](<${href}>)`;
}

function humanizeOperation(operation: string): string {
  return operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function getConfirmationActionLabel(step: { summary: string | null; operation: string }): string {
  const summary = step.summary ? cleanText(step.summary) : '';
  if (summary) {
    return truncateText(summary, 180);
  }
  return `the ${humanizeOperation(resolveToolName(step.operation))} action`;
}

function formatValueForInline(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? truncateText(trimmed, 120) : '""';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return truncateText(JSON.stringify(value), 120);
  } catch {
    return truncateText(String(value), 120);
  }
}

function stringifyJsonTruncated(value: unknown, maxChars = MAX_PROPERTIES_JSON_CHARS): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized.length <= maxChars) {
      return serialized;
    }
    return `${serialized.slice(0, maxChars)}\n... [truncated ${serialized.length - maxChars} chars]`;
  } catch {
    return String(value);
  }
}

function appendPropertiesSection(
  lines: string[],
  properties: Record<string, unknown> | null
): void {
  if (!properties) {
    return;
  }

  const keys = Object.keys(properties);
  if (!keys.length) {
    return;
  }

  const ordered: Record<string, unknown> = {};
  for (const key of keys.sort((a, b) => a.localeCompare(b))) {
    ordered[key] = properties[key];
  }

  lines.push(`- **Properties returned:** ${keys.length}`);
  lines.push('');
  lines.push('#### All properties');
  lines.push('```json');
  lines.push(stringifyJsonTruncated(ordered));
  lines.push('```');
}

function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPreferredModelFromPlan(
  plan: Record<string, unknown> | null | undefined
): { provider?: string; model?: string } | undefined {
  if (!plan) {
    return undefined;
  }
  const provider = typeof plan.provider === 'string' ? plan.provider.trim().toLowerCase() : '';
  const model = typeof plan.model === 'string' ? plan.model.trim() : '';
  if (!provider && !model) {
    return undefined;
  }
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

function getNodeIdFromOutput(output: Record<string, unknown> | undefined): string | null {
  if (!output) {
    return null;
  }

  const directCandidates = [
    output.nodeId,
    (output.created as Record<string, unknown> | undefined)?.id,
    (output.updated as Record<string, unknown> | undefined)?.id,
    (output.moved as Record<string, unknown> | undefined)?.id,
    (output.copied as Record<string, unknown> | undefined)?.id,
    (
      (output.postActionVerification as Record<string, unknown> | undefined)?.node as
        | Record<string, unknown>
        | undefined
    )?.id,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function getNodeNameFromOutput(output: Record<string, unknown> | undefined): string | null {
  if (!output) {
    return null;
  }

  const directCandidates = [
    output.name,
    (output.created as Record<string, unknown> | undefined)?.name,
    (output.updated as Record<string, unknown> | undefined)?.name,
    (output.moved as Record<string, unknown> | undefined)?.name,
    (output.copied as Record<string, unknown> | undefined)?.name,
    (
      (output.postActionVerification as Record<string, unknown> | undefined)?.node as
        | Record<string, unknown>
        | undefined
    )?.name,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function buildRemainingTasksHint(
  originalRequest: string,
  completedOutput?: Record<string, unknown>
): string[] {
  const normalized = originalRequest.toLowerCase();
  const nodeId = getNodeIdFromOutput(completedOutput);
  const wantsDelete = /\b(delete|remove|verwijder|verwijderen|supprimer|löschen)\b/.test(
    normalized
  );
  const wantsMetadata =
    /\b(metadata|properties|property|eigenschappen|propriét|eigenschaft)\b/.test(normalized);

  const tasks: string[] = [];
  if (wantsMetadata) {
    tasks.push(
      nodeId
        ? `Fetch full node metadata/properties for node ${nodeId} and include the full properties map in the response before any delete step.`
        : 'Fetch full node metadata/properties for the created/updated target node and include the full properties map in the response before any delete step.'
    );
  }
  if (wantsDelete) {
    tasks.push(
      nodeId
        ? `Delete node ${nodeId} (this should trigger confirmation again if required).`
        : 'Delete the created/updated target node (this should trigger confirmation again if required).'
    );
  }
  return tasks;
}

export class AgentService {
  private repository: AgentRepository;
  private static runControllers = new Map<number, AbortController>();

  constructor(
    private prisma: PrismaClient,
    private serverService: ServerService
  ) {
    this.repository = new AgentRepository(prisma);
  }

  getManifest() {
    // Returns the action catalog for API consumers (used by the frontend tool list)
    return { version: AGENT_MANIFEST_VERSION };
  }

  async listChats(
    userId: number,
    params: { serverId?: number; skipCount?: number; maxItems?: number } = {}
  ) {
    const page = await this.repository.listChats(userId, params);
    return buildPaginatedResponse(page.items, page.totalItems, params);
  }

  async searchChats(
    userId: number,
    params: { query: string; serverId?: number; maxItems?: number }
  ) {
    return this.repository.searchChats(userId, params);
  }

  async createChat(userId: number, serverId: number, title?: string) {
    const server = await this.serverService.findById(userId, serverId);
    if (!server) {
      return AppErrors.notFound('Server', serverId);
    }

    const normalizedTitle = cleanText(title || '') || 'New chat';
    return this.repository.createChat(userId, serverId, normalizedTitle);
  }

  async deleteChat(userId: number, chatId: number) {
    const chat = await this.repository.findChatById(userId, chatId);
    if (!chat) {
      return { success: false };
    }

    const runs = await this.prisma.agentRun.findMany({
      where: {
        chatId,
        userId,
        status: { in: ['queued', 'running', 'waiting_confirmation'] },
      },
      select: { id: true },
    });

    for (const run of runs) {
      AgentService.runControllers.get(run.id)?.abort();
      AgentService.runControllers.delete(run.id);
    }

    const success = await this.repository.deleteChat(userId, chatId);
    return { success };
  }

  async listMessages(
    userId: number,
    chatId: number,
    params: { beforeId?: number; maxItems?: number } = {}
  ) {
    return this.repository.listMessages(userId, chatId, params);
  }

  async listRuns(
    userId: number,
    chatId: number,
    params: { skipCount?: number; maxItems?: number } = {}
  ) {
    const page = await this.repository.listRuns(userId, chatId, params);
    return buildPaginatedResponse(page.items, page.totalItems, params);
  }

  async listRunEvents(
    userId: number,
    runId: number,
    params: { afterId?: number; maxItems?: number } = {}
  ) {
    return this.repository.listRunEvents(userId, runId, params);
  }

  async sendMessage(userId: number, payload: SendMessageInput) {
    const content = payload.content?.trim();
    if (!content) {
      return AppErrors.validationError('Message content is required');
    }

    const chat = await this.repository.findChatById(userId, payload.chatId);
    if (!chat) {
      return AppErrors.notFound('Chat', payload.chatId);
    }

    const mentions = (payload.mentions || []).slice(0, 30);

    const message = await this.repository.createMessage({
      chatId: chat.id,
      userId,
      role: 'user',
      content,
      mentions,
    });

    const run = await this.repository.createRun({
      chatId: chat.id,
      userId,
      serverId: chat.serverId,
      triggerMessageId: message.id,
      manifestVersion: AGENT_MANIFEST_VERSION,
    });

    await this.emitEvent(run.id, 'run.queued', 'info', { messageId: message.id });

    const aiSelection = {
      provider:
        typeof payload.aiProvider === 'string'
          ? payload.aiProvider.trim().toLowerCase()
          : undefined,
      model: typeof payload.aiModel === 'string' ? payload.aiModel.trim() : undefined,
    };
    const preferredLanguage = normalizeAppLanguage(payload.appLanguage);
    const autoApproveConfirmations = Boolean(payload.autoApproveConfirmations);

    setImmediate(() => {
      void this.executeRun(
        userId,
        run.id,
        aiSelection,
        preferredLanguage,
        autoApproveConfirmations
      ).catch(error => {
        log.error({ err: error, runId: run.id }, 'Background run execution crashed');
      });
    });

    return { message, run };
  }

  async cancelRun(userId: number, runId: number) {
    const run = await this.repository.findRunById(userId, runId);
    if (!run) {
      return AppErrors.notFound('Run', runId);
    }

    if (!ACTIVE_RUN_STATUSES.has(run.status)) {
      return { success: false, reason: 'Run is not active' };
    }

    AgentService.runControllers.get(run.id)?.abort();
    AgentService.runControllers.delete(run.id);

    await this.repository.updateRun(userId, run.id, {
      status: 'cancelled',
      finishedAt: new Date(),
      error: null,
    });

    await this.repository.createRunEvent({
      runId: run.id,
      type: 'run.cancelled',
      level: 'warn',
      payload: { cancelledAt: nowIso() },
    });

    await this.repository.createMessage({
      chatId: run.chatId,
      userId,
      role: 'assistant',
      content: 'Run cancelled.',
      mentions: [],
    });

    return { success: true };
  }

  async confirmStep(userId: number, payload: ConfirmStepInput) {
    const run = await this.repository.findRunById(userId, payload.runId);
    if (!run) {
      return AppErrors.notFound('Run', payload.runId);
    }

    const step = await this.repository.findRunStep(userId, payload.runId, payload.stepId);
    if (!step) {
      return AppErrors.notFound('Run step', payload.stepId);
    }

    if (step.status !== 'waiting_confirmation') {
      return AppErrors.validationError('Step is not waiting for confirmation');
    }

    if (step.confirmationToken !== payload.confirmationToken) {
      return AppErrors.forbidden('Invalid confirmation token');
    }

    const confirmationMessage = await this.repository.createMessage({
      chatId: run.chatId,
      userId,
      role: 'user',
      content: payload.approved
        ? `Approved: ${getConfirmationActionLabel(step)}.`
        : `Rejected: ${getConfirmationActionLabel(step)}.`,
      mentions: [],
    });

    if (!payload.approved) {
      return this.rejectStep(userId, run, step, confirmationMessage);
    }

    return this.approveStep(userId, run, step, confirmationMessage);
  }

  async searchMentions(
    userId: number,
    payload: {
      serverId: number;
      query: string;
      types?: Array<'node' | 'person' | 'group'>;
      skipCount?: number;
      maxItems?: number;
    }
  ) {
    const ctx = await createExecutionContext(
      this.prisma,
      this.serverService,
      userId,
      payload.serverId
    );
    return searchMentions(ctx, payload);
  }

  // ── Private ──

  private async rejectStep(
    userId: number,
    run: { id: number; chatId: number; serverId: number },
    step: { id: number; ordinal: number; operation: string; summary: string | null },
    confirmationMessage: { id: number }
  ) {
    await this.repository.updateRunStep(userId, run.id, step.id, {
      status: 'cancelled',
      confirmedAt: new Date(),
      completedAt: new Date(),
      output: { approved: false, reason: 'User rejected destructive operation' },
    });

    await this.repository.updateRun(userId, run.id, {
      status: 'cancelled',
      finishedAt: new Date(),
      error: null,
    });

    await this.repository.createRunEvent({
      runId: run.id,
      stepId: step.id,
      type: 'step.rejected',
      level: 'warn',
      payload: {
        stepId: step.id,
        confirmedAt: nowIso(),
        confirmationMessageId: confirmationMessage.id,
      },
    });

    await this.repository.createOperationAudit({
      runId: run.id,
      stepId: step.id,
      userId,
      serverId: run.serverId,
      operation: step.operation,
      action: 'rejected',
      targetSummary: step.summary,
      confirmationMessageId: confirmationMessage.id,
    });

    await this.repository.createMessage({
      chatId: run.chatId,
      userId,
      role: 'assistant',
      content: `Understood. I did not execute ${getConfirmationActionLabel(step)}.`,
      mentions: [],
    });

    return { success: true, runStatus: 'cancelled' };
  }

  private async approveStep(
    userId: number,
    run: {
      id: number;
      chatId: number;
      serverId: number;
      plan: Record<string, unknown> | null;
    },
    step: {
      id: number;
      ordinal: number;
      operation: string;
      summary: string | null;
      input: Record<string, unknown> | null;
    },
    confirmationMessage: { id: number }
  ) {
    const execCtx = await createExecutionContext(
      this.prisma,
      this.serverService,
      userId,
      run.serverId
    );

    await this.repository.updateRun(userId, run.id, { status: 'running', error: null });

    await this.repository.updateRunStep(userId, run.id, step.id, {
      status: 'running',
      confirmedAt: new Date(),
      startedAt: new Date(),
    });

    await this.repository.createRunEvent({
      runId: run.id,
      stepId: step.id,
      type: 'step.confirmed',
      level: 'info',
      payload: { stepId: step.id, confirmationMessageId: confirmationMessage.id },
    });

    const executionStartedAt = Date.now();

    try {
      const canonicalOperation = resolveToolName(step.operation);
      const stepInput = (step.input && isRecord(step.input) ? step.input : {}) as Record<
        string,
        unknown
      >;

      const tool = getToolByName(canonicalOperation);
      if (!tool) {
        throw new Error(`Unknown tool in confirmed step: ${canonicalOperation}`);
      }

      const toolResult = await tool.execute(execCtx, stepInput);
      if (!toolResult.ok) {
        throw new Error(toolResult.error);
      }
      let output = toolResult.data;

      await this.repository.updateRunStep(userId, run.id, step.id, {
        status: 'completed',
        output,
        completedAt: new Date(),
      });

      await this.repository.createRunEvent({
        runId: run.id,
        stepId: step.id,
        type: 'step.completed',
        level: 'info',
        payload: {
          stepId: step.id,
          operation: canonicalOperation,
          status: 'completed',
          durationMs: Date.now() - executionStartedAt,
          output,
          progressMessage: `${step.summary || canonicalOperation} completed`,
        },
      });

      let verificationOutput: Record<string, unknown> | null = null;
      try {
        verificationOutput = await this.runPostActionVerification(
          userId,
          run.id,
          step,
          canonicalOperation,
          output,
          execCtx
        );
      } catch (verificationError) {
        const verificationMessage = extractErrorMessage(verificationError);
        log.warn(
          { runId: run.id, stepId: step.id, err: verificationError },
          'Post-action verification failed unexpectedly'
        );
        verificationOutput = { error: verificationMessage };
      }

      if (verificationOutput) {
        output = {
          ...output,
          postActionVerification: verificationOutput,
        };

        await this.repository.updateRunStep(userId, run.id, step.id, {
          output,
        });
      }

      await this.repository.updateRun(userId, run.id, {
        status: 'running',
        error: null,
      });

      await this.repository.createOperationAudit({
        runId: run.id,
        stepId: step.id,
        userId,
        serverId: run.serverId,
        operation: canonicalOperation,
        action: 'confirmed',
        targetSummary: step.summary,
        confirmationMessageId: confirmationMessage.id,
        metadata: { output },
      });

      await this.repository.createMessage({
        chatId: run.chatId,
        userId,
        role: 'assistant',
        content: this.buildConfirmedOperationMessage(canonicalOperation, output, stepInput),
        mentions: [],
      });

      const completedAction = getConfirmationActionLabel(step);
      const preferredModel = getPreferredModelFromPlan(run.plan);
      const preferredLanguage = normalizeAppLanguage(
        typeof run.plan?.appLanguage === 'string' ? run.plan.appLanguage : undefined
      );

      setImmediate(() => {
        void this.executeRun(userId, run.id, preferredModel, preferredLanguage, false, {
          completedAction,
          completedOutput: output,
        }).catch(error => {
          log.error(
            { err: error, runId: run.id, stepId: step.id },
            'Continuation after confirmation failed'
          );
        });
      });

      return { success: true, runStatus: 'running' };
    } catch (error) {
      const message = extractErrorMessage(error);

      await this.repository.updateRunStep(userId, run.id, step.id, {
        status: 'failed',
        completedAt: new Date(),
        output: { error: message },
      });

      await this.repository.updateRun(userId, run.id, {
        status: 'failed',
        finishedAt: new Date(),
        error: message,
      });

      await this.repository.createRunEvent({
        runId: run.id,
        stepId: step.id,
        type: 'step.failed',
        level: 'error',
        payload: {
          operation: resolveToolName(step.operation),
          status: 'failed',
          durationMs: Date.now() - executionStartedAt,
          output: { error: message },
          error: message,
        },
      });

      await this.repository.createMessage({
        chatId: run.chatId,
        userId,
        role: 'assistant',
        content: this.buildOperationFailureMessage(resolveToolName(step.operation), message),
        mentions: [],
      });

      log.warn(
        { runId: run.id, stepId: step.id, operation: resolveToolName(step.operation), err: error },
        'Confirmed operation failed; returning failed run status without throwing'
      );
      return { success: true, runStatus: 'failed' as const };
    }
  }

  private extractPrimaryNodeIdFromOutput(
    operation: string,
    output: Record<string, unknown>
  ): string | null {
    if (operation === 'node_create') {
      const id = (output.created as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'node_update') {
      const id = (output.updated as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'node_update_content') {
      const id = (output.updated as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'node_move') {
      const id = (output.moved as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'node_copy') {
      const id = (output.copied as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'search_export_text') {
      const id = (output.created as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'text_write_commit') {
      const updatedId = (output.updated as { id?: unknown } | undefined)?.id;
      if (typeof updatedId === 'string' && updatedId.trim()) {
        return updatedId.trim();
      }
      const createdId = (output.created as { id?: unknown } | undefined)?.id;
      return typeof createdId === 'string' && createdId.trim() ? createdId.trim() : null;
    }
    return null;
  }

  private parseStructuredError(rawMessage: string): {
    statusCode?: number;
    errorKey?: string;
    briefSummary?: string;
    message?: string;
    descriptionURL?: string;
  } | null {
    const parseObject = (value: unknown) => {
      if (!isRecord(value)) return null;
      const root = value as Record<string, unknown>;
      const source = isRecord(root.error) ? (root.error as Record<string, unknown>) : root;
      const statusCode = typeof source.statusCode === 'number' ? source.statusCode : undefined;
      const errorKey = typeof source.errorKey === 'string' ? source.errorKey : undefined;
      const briefSummary =
        typeof source.briefSummary === 'string' ? source.briefSummary : undefined;
      const message = typeof source.message === 'string' ? source.message : undefined;
      const descriptionURL =
        typeof source.descriptionURL === 'string' ? source.descriptionURL : undefined;
      if (!statusCode && !errorKey && !briefSummary && !message && !descriptionURL) {
        return null;
      }
      return { statusCode, errorKey, briefSummary, message, descriptionURL };
    };

    const trimmed = rawMessage.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      const structured = parseObject(parsed);
      if (structured) return structured;
    } catch {
      // noop
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        return parseObject(parsed);
      } catch {
        // noop
      }
    }

    return null;
  }

  private buildOperationFailureMessage(operation: string, rawMessage: string): string {
    const operationLabelMap: Record<string, { title: string; action: string }> = {
      node_create: { title: 'Create node failed', action: 'create the node' },
      node_update: { title: 'Update node failed', action: 'update the node' },
      node_update_content: { title: 'Update node content failed', action: 'update node content' },
      node_move: { title: 'Move node failed', action: 'move the node' },
      node_copy: { title: 'Copy node failed', action: 'copy the node' },
      node_delete: { title: 'Delete node failed', action: 'delete the node' },
      node_get: { title: 'Read node failed', action: 'read the node' },
      node_list_children: { title: 'List children failed', action: 'list child nodes' },
      search: { title: 'Search failed', action: 'run the search' },
      search_export_text: { title: 'Text export failed', action: 'export the text report' },
      text_write_begin: {
        title: 'Text write begin failed',
        action: 'start the text write session',
      },
      text_write_append: {
        title: 'Text write append failed',
        action: 'append text to the session',
      },
      text_write_status: { title: 'Text write status failed', action: 'read write session status' },
      text_write_abort: {
        title: 'Text write abort failed',
        action: 'abort the text write session',
      },
      text_write_commit: { title: 'Text write commit failed', action: 'commit text to Alfresco' },
      script_execute: { title: 'Script execution failed', action: 'execute the script' },
    };
    const operationLabel = operationLabelMap[operation] ?? {
      title: 'Operation failed',
      action: 'complete the requested operation',
    };

    const parsed = this.parseStructuredError(rawMessage);
    const detailRaw =
      parsed?.briefSummary?.trim() ||
      parsed?.errorKey?.trim() ||
      parsed?.message?.trim() ||
      rawMessage.trim() ||
      'Unknown error';
    const detail = truncateText(detailRaw.replace(/^\d+\s+/, ''), 320);

    const duplicateMatch = detail.match(/duplicate child name not allowed:\s*["']?([^"']+)["']?/i);
    if (operation === 'node_create' && /duplicate child name not allowed/i.test(detail)) {
      const duplicateName = duplicateMatch?.[1]?.trim();
      return [
        '### Create node failed',
        '',
        duplicateName
          ? `A node named **${inlineCode(duplicateName)}** already exists in that target folder.`
          : 'A node with the same name already exists in that target folder.',
        '',
        'Try one of these:',
        '- Use a different node name',
        '- Ask me to update or reuse the existing node',
      ].join('\n');
    }

    const lines = [
      `### ${operationLabel.title}`,
      '',
      `I couldn't ${operationLabel.action}.`,
      '',
      `- **Reason:** ${detail}`,
    ];

    if (parsed?.statusCode) {
      lines.push(`- **HTTP status:** ${parsed.statusCode}`);
    }
    if (parsed?.descriptionURL) {
      lines.push(`- **Reference:** ${parsed.descriptionURL}`);
    }
    return lines.join('\n');
  }

  private buildConfirmedOperationMessage(
    operation: string,
    output: Record<string, unknown>,
    stepInput: Record<string, unknown> = {}
  ): string {
    const operationLabelMap: Record<string, string> = {
      node_create: 'Node created',
      node_update: 'Node updated',
      node_update_content: 'Node content updated',
      node_move: 'Node moved',
      node_copy: 'Node copied',
      node_delete: 'Node deleted',
      node_get: 'Node retrieved',
      node_list_children: 'Children listed',
      search: 'Search completed',
      search_export_text: 'Text export completed',
      text_write_begin: 'Text write session started',
      text_write_append: 'Text chunk appended',
      text_write_status: 'Text write status retrieved',
      text_write_abort: 'Text write session aborted',
      text_write_commit: 'Text write committed',
      script_execute: 'Script executed',
    };
    const verification = isRecord(output.postActionVerification)
      ? output.postActionVerification
      : null;
    const verifiedNode = isRecord(verification?.node)
      ? (verification.node as Record<string, unknown>)
      : null;
    const createdNode = isRecord(output.created) ? output.created : null;
    const updatedNode = isRecord(output.updated) ? output.updated : null;
    const movedNode = isRecord(output.moved) ? output.moved : null;
    const copiedNode = isRecord(output.copied) ? output.copied : null;
    const directNodeLike =
      typeof output.id === 'string' ||
      typeof output.name === 'string' ||
      isRecord(output.properties)
        ? output
        : null;

    if (operation === 'node_update') {
      const resultNode = verifiedNode || updatedNode;
      const updatedName =
        typeof resultNode?.name === 'string'
          ? resultNode.name
          : typeof stepInput.name === 'string'
            ? stepInput.name
            : 'unknown';
      const nodeId =
        typeof resultNode?.id === 'string'
          ? resultNode.id
          : typeof output.nodeId === 'string'
            ? output.nodeId
            : '';
      const nodePath = typeof resultNode?.path === 'string' ? resultNode.path.trim() : '';
      const nodeType = typeof resultNode?.nodeType === 'string' ? resultNode.nodeType : '';
      const isFolder = typeof resultNode?.isFolder === 'boolean' ? resultNode.isFolder : null;
      const isFile = typeof resultNode?.isFile === 'boolean' ? resultNode.isFile : null;
      const mimeType = typeof resultNode?.mimeType === 'string' ? resultNode.mimeType : '';
      const modifiedAt = typeof resultNode?.modifiedAt === 'string' ? resultNode.modifiedAt : '';
      const modifiedBy = typeof resultNode?.modifiedBy === 'string' ? resultNode.modifiedBy : '';

      const lines = [
        '### Node updated',
        '',
        'The node update completed successfully.',
        '',
        '- **Node:** ' + buildNodeBrowserMarkdownLink(nodeId, updatedName),
      ];

      if (nodePath) {
        lines.push('- **Location:** ' + inlineCode(nodePath));
      }
      if (nodeType) {
        lines.push('- **Type:** ' + inlineCode(nodeType));
      }
      if (isFolder !== null || isFile !== null) {
        lines.push('- **Kind:** ' + inlineCode(isFolder ? 'folder' : isFile ? 'file' : 'node'));
      }
      if (mimeType) {
        lines.push('- **MIME type:** ' + inlineCode(mimeType));
      }

      const requestedName = typeof stepInput.name === 'string' ? stepInput.name.trim() : '';
      if (requestedName) {
        lines.push('- **Requested name:** ' + inlineCode(requestedName));
      }

      const requestedProperties = isRecord(stepInput.properties) ? stepInput.properties : null;
      const returnedProperties = isRecord(resultNode?.properties)
        ? (resultNode.properties as Record<string, unknown>)
        : null;
      if (requestedProperties) {
        const propertyEntries = Object.keys(requestedProperties).slice(0, 8);
        if (propertyEntries.length > 0) {
          const propertyChanges = propertyEntries
            .map(key => {
              const finalValue = returnedProperties?.[key] ?? requestedProperties[key];
              return `${key}=${formatValueForInline(finalValue)}`;
            })
            .map(item => inlineCode(item));
          const suffix =
            Object.keys(requestedProperties).length > propertyEntries.length
              ? ` (+${Object.keys(requestedProperties).length - propertyEntries.length} more)`
              : '';
          lines.push(`- **Property changes:** ${propertyChanges.join(', ')}${suffix}`);
        }
      }
      if (modifiedAt || modifiedBy) {
        const modifiedDetails = [modifiedAt, modifiedBy ? `by ${modifiedBy}` : '']
          .filter(Boolean)
          .join(' ');
        lines.push('- **Last modified:** ' + inlineCode(modifiedDetails));
      }
      appendPropertiesSection(lines, returnedProperties);

      return lines.join('\n');
    }

    if (operation === 'node_delete') {
      const totalDeleted =
        typeof output.totalDeleted === 'number'
          ? output.totalDeleted
          : Array.isArray(output.deleted)
            ? output.deleted.length
            : null;
      if (totalDeleted !== null) {
        return [
          '### Node deleted',
          '',
          `Deleted **${totalDeleted}** node${totalDeleted === 1 ? '' : 's'} successfully.`,
        ].join('\n');
      }
      return ['### Node deleted', '', 'The delete operation completed successfully.'].join('\n');
    }

    if (operation === 'search_export_text') {
      const created = isRecord(output.created) ? output.created : null;
      const exportInfo = isRecord(output.export) ? output.export : null;
      const nodeId = typeof created?.id === 'string' ? created.id : '';
      const nodeName = typeof created?.name === 'string' ? created.name : 'report.txt';
      const nodePath = typeof created?.path === 'string' ? created.path.trim() : '';
      const format = typeof exportInfo?.format === 'string' ? exportInfo.format : null;
      const totalRows =
        typeof exportInfo?.totalRows === 'number' && Number.isFinite(exportInfo.totalRows)
          ? exportInfo.totalRows
          : null;
      const repositoryTotal =
        typeof exportInfo?.repositoryTotal === 'number' &&
        Number.isFinite(exportInfo.repositoryTotal)
          ? exportInfo.repositoryTotal
          : null;
      const pagesFetched =
        typeof exportInfo?.pagesFetched === 'number' && Number.isFinite(exportInfo.pagesFetched)
          ? exportInfo.pagesFetched
          : null;
      const hitLimit = exportInfo?.hitLimit === true;

      const lines = [
        '### Text export completed',
        '',
        '- **File:** ' + buildNodeBrowserMarkdownLink(nodeId, nodeName),
      ];
      if (nodePath) {
        lines.push('- **Location:** ' + inlineCode(nodePath));
      }
      if (format) {
        lines.push(`- **Format:** ${inlineCode(format)}`);
      }
      if (totalRows !== null) {
        lines.push(`- **Rows exported:** **${totalRows}**`);
      }
      if (repositoryTotal !== null) {
        lines.push(`- **Repository matches:** **${repositoryTotal}**`);
      }
      if (pagesFetched !== null) {
        lines.push(`- **Pages fetched:** ${pagesFetched}`);
      }
      if (hitLimit) {
        lines.push('- **Note:** Export reached the configured maximum row limit.');
      }
      return lines.join('\n');
    }

    if (operation === 'text_write_commit') {
      const node = isRecord(output.updated)
        ? output.updated
        : isRecord(output.created)
          ? output.created
          : null;
      const write = isRecord(output.write) ? output.write : null;
      const nodeId = typeof node?.id === 'string' ? node.id : '';
      const nodeName = typeof node?.name === 'string' ? node.name : 'text-file';
      const nodePath = typeof node?.path === 'string' ? node.path.trim() : '';
      const totalBytes =
        typeof write?.totalBytes === 'number' && Number.isFinite(write.totalBytes)
          ? write.totalBytes
          : null;
      const chunksReceived =
        typeof write?.chunksReceived === 'number' && Number.isFinite(write.chunksReceived)
          ? write.chunksReceived
          : null;
      const sessionId = typeof write?.sessionId === 'string' ? write.sessionId : '';

      const lines = [
        '### Text write committed',
        '',
        '- **File:** ' + buildNodeBrowserMarkdownLink(nodeId, nodeName),
      ];
      if (nodePath) {
        lines.push('- **Location:** ' + inlineCode(nodePath));
      }
      if (chunksReceived !== null) {
        lines.push(`- **Chunks received:** ${chunksReceived}`);
      }
      if (totalBytes !== null) {
        lines.push(`- **Total bytes:** ${totalBytes}`);
      }
      if (sessionId) {
        lines.push(`- **Session ID:** ${inlineCode(sessionId)}`);
      }
      return lines.join('\n');
    }

    const resultNode =
      verifiedNode || createdNode || updatedNode || movedNode || copiedNode || directNodeLike;
    if (resultNode) {
      const name = typeof resultNode.name === 'string' ? resultNode.name : 'unknown';
      const id = typeof resultNode.id === 'string' ? resultNode.id : '';
      const path = typeof resultNode.path === 'string' ? resultNode.path.trim() : '';
      const nodeType = typeof resultNode.nodeType === 'string' ? resultNode.nodeType : '';
      const mimeType = typeof resultNode.mimeType === 'string' ? resultNode.mimeType : '';
      const createdAt = typeof resultNode.createdAt === 'string' ? resultNode.createdAt : '';
      const createdBy = typeof resultNode.createdBy === 'string' ? resultNode.createdBy : '';
      const modifiedAt = typeof resultNode.modifiedAt === 'string' ? resultNode.modifiedAt : '';
      const modifiedBy = typeof resultNode.modifiedBy === 'string' ? resultNode.modifiedBy : '';
      const isFolder = typeof resultNode.isFolder === 'boolean' ? resultNode.isFolder : null;
      const isFile = typeof resultNode.isFile === 'boolean' ? resultNode.isFile : null;
      const properties = isRecord(resultNode.properties)
        ? (resultNode.properties as Record<string, unknown>)
        : null;
      const lines = [
        `### ${operationLabelMap[operation] ?? 'Operation completed'}`,
        '',
        'The operation completed successfully.',
        '',
        '- **Node:** ' + buildNodeBrowserMarkdownLink(id, name),
      ];
      if (path) {
        lines.push('- **Location:** ' + inlineCode(path));
      }
      if (nodeType) {
        lines.push('- **Type:** ' + inlineCode(nodeType));
      }
      if (isFolder !== null || isFile !== null) {
        lines.push('- **Kind:** ' + inlineCode(isFolder ? 'folder' : isFile ? 'file' : 'node'));
      }
      if (mimeType) {
        lines.push('- **MIME type:** ' + inlineCode(mimeType));
      }
      if (createdAt || createdBy) {
        const createdDetails = [createdAt, createdBy ? `by ${createdBy}` : '']
          .filter(Boolean)
          .join(' ');
        lines.push('- **Created:** ' + inlineCode(createdDetails));
      }
      if (modifiedAt || modifiedBy) {
        const modifiedDetails = [modifiedAt, modifiedBy ? `by ${modifiedBy}` : '']
          .filter(Boolean)
          .join(' ');
        lines.push('- **Last modified:** ' + inlineCode(modifiedDetails));
      }
      appendPropertiesSection(lines, properties);
      return lines.join('\n');
    }

    return [
      `### ${operationLabelMap[operation] ?? 'Operation completed'}`,
      '',
      'The operation completed successfully.',
    ].join('\n');
  }

  private async runPostActionVerification(
    userId: number,
    runId: number,
    step: { id: number; ordinal: number; operation: string },
    operation: string,
    output: Record<string, unknown>,
    execCtx: AgentExecutionContext
  ): Promise<Record<string, unknown> | null> {
    const nodeId = this.extractPrimaryNodeIdFromOutput(operation, output);
    if (!nodeId) {
      return null;
    }

    const verificationTool = getToolByName('node_get');
    if (!verificationTool) {
      return { nodeId, error: 'node_get tool unavailable for post-action verification' };
    }

    const currentMaxOrdinal = await this.prisma.agentRunStep.findFirst({
      where: { runId },
      orderBy: { ordinal: 'desc' },
      select: { ordinal: true },
    });

    const verificationStep = await this.repository.createRunStep({
      runId,
      ordinal: (currentMaxOrdinal?.ordinal ?? step.ordinal) + 1,
      operation: 'node_get',
      status: 'running',
      summary: 'Post-action verification',
      input: { nodeId },
      startedAt: new Date(),
    });

    const verificationStartedAt = Date.now();
    const verificationResult = await verificationTool.execute(execCtx, { nodeId });
    if (!verificationResult.ok) {
      await this.repository.updateRunStep(userId, runId, verificationStep.id, {
        status: 'failed',
        completedAt: new Date(),
        output: { error: verificationResult.error, nodeId },
      });

      await this.repository.createRunEvent({
        runId,
        stepId: verificationStep.id,
        type: 'step.failed',
        level: 'warn',
        payload: {
          operation: 'node_get',
          status: 'failed',
          durationMs: Date.now() - verificationStartedAt,
          output: { error: verificationResult.error, nodeId },
          error: verificationResult.error,
        },
      });

      return { nodeId, error: verificationResult.error };
    }

    await this.repository.updateRunStep(userId, runId, verificationStep.id, {
      status: 'completed',
      completedAt: new Date(),
      output: verificationResult.data,
    });

    await this.repository.createRunEvent({
      runId,
      stepId: verificationStep.id,
      type: 'step.completed',
      level: 'info',
      payload: {
        operation: 'node_get',
        status: 'completed',
        durationMs: Date.now() - verificationStartedAt,
        output: verificationResult.data,
        progressMessage: 'Post-action verification completed',
      },
    });

    return {
      nodeId,
      node: verificationResult.data,
    };
  }

  private async emitEvent(
    runId: number,
    type: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    extra?: Record<string, unknown>
  ): Promise<void> {
    await emitRunEvent(this.repository, runId, type, level, extra);
  }

  private async buildRunFailureMessage(runId: number, rawError: string): Promise<string> {
    const steps = await this.prisma.agentRunStep.findMany({
      where: { runId },
      orderBy: { ordinal: 'asc' },
      select: {
        ordinal: true,
        operation: true,
        status: true,
        summary: true,
        outputJson: true,
      },
    });

    const normalizedError = rawError.trim();
    const isTimeout = /timed out/i.test(normalizedError);
    const completedSteps = steps.filter(step => step.status === 'completed');
    const failedSteps = steps.filter(step => step.status === 'failed');

    let lastKnownTotalCount: number | null = null;
    for (let index = completedSteps.length - 1; index >= 0; index -= 1) {
      const output = parseJsonRecord(completedSteps[index].outputJson);
      if (!output) {
        continue;
      }
      const pagination = isRecord(output.pagination)
        ? (output.pagination as Record<string, unknown>)
        : null;
      const totalCount = pagination?.totalCount;
      if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
        lastKnownTotalCount = totalCount;
        break;
      }
    }

    const lines: string[] = [];
    lines.push(
      isTimeout
        ? "I couldn't finish the final response because the model timed out."
        : "I couldn't finish the response because the run failed."
    );
    lines.push(
      `- **Reason:** ${inlineCode(truncateText(normalizedError || 'Unknown error', 300))}`
    );

    if (completedSteps.length > 0) {
      lines.push(`- **Completed steps before failure:** ${completedSteps.length}`);
    }
    if (failedSteps.length > 0) {
      lines.push(`- **Failed steps:** ${failedSteps.length}`);
    }
    if (lastKnownTotalCount !== null) {
      lines.push(`- **Last known total count:** **${lastKnownTotalCount}**`);
    }

    if (completedSteps.length > 0) {
      lines.push('');
      lines.push('Completed actions:');
      for (const step of completedSteps.slice(-6)) {
        const label =
          (step.summary && cleanText(step.summary)) ||
          humanizeOperation(resolveToolName(step.operation || 'operation'));
        lines.push(`- ${label}`);
      }
    }

    lines.push('');
    lines.push(
      'If you want, ask me to continue from these completed results with a smaller scope (for example a subfolder or max item limit).'
    );

    return lines.join('\n');
  }

  private buildContinuationContent(
    originalRequest: string,
    completedAction: string,
    completedOutput?: Record<string, unknown>
  ): string {
    const nodeId = getNodeIdFromOutput(completedOutput);
    const nodeName = getNodeNameFromOutput(completedOutput);
    const remainingTaskHints = buildRemainingTasksHint(originalRequest, completedOutput);
    const outputPreview = completedOutput
      ? truncateText(
          (() => {
            try {
              return JSON.stringify(completedOutput);
            } catch {
              return String(completedOutput);
            }
          })(),
          2000
        )
      : '';

    return [
      'Continue the same user request from where you paused.',
      '',
      `Original user request: ${originalRequest}`,
      `Already completed and confirmed: ${completedAction}.`,
      ...(nodeId ? [`Target node id (if applicable): ${nodeId}`] : []),
      ...(nodeName ? [`Target node name (if applicable): ${nodeName}`] : []),
      'You are not done by default after the confirmed step.',
      'Do not repeat completed actions.',
      'Execute remaining requested tasks in order. If more actions remain, call tools now.',
      'When referring to nodes in user-facing text, prefer node name links like [Name](nodebrowser://node/<nodeId>) instead of raw UUID-only references.',
      ...(remainingTaskHints.length
        ? ['', 'Remaining tasks to complete now:', ...remainingTaskHints.map(task => `- ${task}`)]
        : []),
      ...(outputPreview ? ['', `Result from completed action (JSON): ${outputPreview}`] : []),
    ].join('\n');
  }

  private async executeRun(
    userId: number,
    runId: number,
    preferredModel?: { provider?: string; model?: string },
    preferredLanguage?: string,
    autoApproveConfirmations = false,
    continuation?: {
      completedAction: string;
      completedOutput?: Record<string, unknown>;
    }
  ): Promise<void> {
    const runRow = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId },
      include: {
        triggerMessage: true,
        chat: { select: { id: true, title: true } },
      },
    });

    if (!runRow?.triggerMessage || !runRow.chat) return;

    const controller = new AbortController();
    AgentService.runControllers.set(runId, controller);

    try {
      const runtime = await resolveAiRuntime(userId, preferredModel);
      if (!runtime) throw new Error('No AI provider configured.');

      const content = continuation
        ? this.buildContinuationContent(
            runRow.triggerMessage.content,
            continuation.completedAction,
            continuation.completedOutput
          )
        : runRow.triggerMessage.content;
      const mentions = parseMentions(runRow.triggerMessage.mentionsJson);

      await this.repository.updateRun(userId, runId, {
        status: 'running',
        ...(continuation ? {} : { startedAt: new Date() }),
        error: null,
        plan: {
          version: AGENT_MANIFEST_VERSION,
          provider: runtime.provider,
          model: runtime.model,
          ...(preferredLanguage ? { appLanguage: preferredLanguage } : {}),
        },
      });

      const baseCtx = await createExecutionContext(
        this.prisma,
        this.serverService,
        userId,
        runRow.serverId
      );
      const execCtx: AgentExecutionContext = { ...baseCtx, signal: controller.signal };

      const engine = new AgentRunEngine(this.repository, runtime, execCtx, controller.signal);

      await engine.execute({
        runId,
        chatId: runRow.chatId,
        serverId: runRow.serverId,
        userId,
        content,
        mentions,
        chatTitle: runRow.chat.title,
        triggerMessageId: runRow.triggerMessage.id,
        preferredLanguage,
        autoApproveConfirmations,
      });

      // Only mark as completed if the engine didn't pause for confirmation
      const currentRun = await this.prisma.agentRun.findFirst({ where: { id: runId } });
      if (currentRun && currentRun.status !== 'waiting_confirmation') {
        await this.repository.updateRun(userId, runId, {
          status: 'completed',
          finishedAt: new Date(),
          error: null,
        });

        await this.emitEvent(runId, 'run.completed', 'info');
      }
    } catch (error) {
      const message = extractErrorMessage(error);
      const cancelled = controller.signal.aborted || message.toLowerCase().includes('cancel');

      await this.repository.updateRun(userId, runId, {
        status: cancelled ? 'cancelled' : 'failed',
        finishedAt: new Date(),
        error: cancelled ? null : message,
      });

      await this.emitEvent(
        runId,
        cancelled ? 'run.cancelled' : 'run.failed',
        cancelled ? 'warn' : 'error',
        {
          error: message,
        }
      );

      if (cancelled) {
        await this.repository.createMessage({
          chatId: runRow.chatId,
          userId,
          role: 'assistant',
          content: 'Run cancelled.',
          mentions: [],
        });
      }

      if (!cancelled) {
        const failureContent = await this.buildRunFailureMessage(runId, message).catch(
          () =>
            `I couldn't complete the request.\n- **Reason:** ${inlineCode(truncateText(message, 300))}`
        );
        await this.repository
          .createMessage({
            chatId: runRow.chatId,
            userId,
            role: 'assistant',
            content: failureContent,
            mentions: [],
          })
          .catch(messageError => {
            log.warn(
              { err: messageError, runId },
              'Failed to write assistant failure message after run error'
            );
          });
        log.error({ err: error, runId }, 'Agent run failed');
      }
    } finally {
      AgentService.runControllers.delete(runId);
    }
  }
}
