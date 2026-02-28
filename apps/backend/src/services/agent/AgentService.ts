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

interface SendMessageInput {
  chatId: number;
  content: string;
  mentions?: AgentMention[];
  aiProvider?: string;
  aiModel?: string;
  appLanguage?: string;
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

    setImmediate(() => {
      void this.executeRun(userId, run.id, aiSelection, preferredLanguage).catch(error => {
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

    if (
      resolveToolName(step.operation) === 'node_delete' &&
      payload.approved &&
      payload.confirmationText !== 'DELETE'
    ) {
      return AppErrors.validationError('Delete confirmation requires typing DELETE');
    }

    const confirmationMessage = await this.repository.createMessage({
      chatId: run.chatId,
      userId,
      role: 'user',
      content: payload.approved
        ? `Confirmation approved for step ${step.ordinal}: ${payload.confirmationText || 'OK'}`
        : `Confirmation rejected for step ${step.ordinal}`,
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
      content: `Operation "${step.operation}" cancelled by user confirmation.`,
      mentions: [],
    });

    return { success: true, runStatus: 'cancelled' };
  }

  private async approveStep(
    userId: number,
    run: { id: number; chatId: number; serverId: number },
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
        status: 'completed',
        finishedAt: new Date(),
        error: null,
      });

      await this.repository.createRunEvent({
        runId: run.id,
        type: 'run.completed',
        level: 'info',
        payload: { finishedAt: nowIso(), progressMessage: 'Run completed' },
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
        content: this.buildConfirmedOperationMessage(canonicalOperation, output),
        mentions: [],
      });

      return { success: true, runStatus: 'completed' };
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
    if (operation === 'node_move') {
      const id = (output.moved as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    if (operation === 'node_copy') {
      const id = (output.copied as { id?: unknown } | undefined)?.id;
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    }
    return null;
  }

  private parseStructuredError(
    rawMessage: string
  ): {
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
      node_move: { title: 'Move node failed', action: 'move the node' },
      node_copy: { title: 'Copy node failed', action: 'copy the node' },
      node_delete: { title: 'Delete node failed', action: 'delete the node' },
      node_get: { title: 'Read node failed', action: 'read the node' },
      node_list_children: { title: 'List children failed', action: 'list child nodes' },
      search: { title: 'Search failed', action: 'run the search' },
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

  private buildConfirmedOperationMessage(operation: string, output: Record<string, unknown>): string {
    const operationLabelMap: Record<string, string> = {
      node_create: 'Node created',
      node_update: 'Node updated',
      node_move: 'Node moved',
      node_copy: 'Node copied',
      node_delete: 'Node deleted',
      node_get: 'Node retrieved',
      node_list_children: 'Children listed',
      search: 'Search completed',
      script_execute: 'Script executed',
    };
    const verification = output.postActionVerification as Record<string, unknown> | undefined;
    const verifiedNode = verification?.node as Record<string, unknown> | undefined;

    if (operation === 'node_delete') {
      const totalDeleted =
        typeof output.totalDeleted === 'number' ? output.totalDeleted : Array.isArray(output.deleted) ? output.deleted.length : null;
      if (totalDeleted !== null) {
        return [
          '### Node deleted',
          '',
          `Deleted **${totalDeleted}** node${totalDeleted === 1 ? '' : 's'} successfully.`,
        ].join('\n');
      }
      return ['### Node deleted', '', 'The delete operation completed successfully.'].join('\n');
    }

    if (verifiedNode) {
      const name = typeof verifiedNode.name === 'string' ? verifiedNode.name : 'unknown';
      const id = typeof verifiedNode.id === 'string' ? verifiedNode.id : 'unknown';
      const path = typeof verifiedNode.path === 'string' ? verifiedNode.path.trim() : '';
      const lines = [
        `### ${operationLabelMap[operation] ?? 'Operation completed'}`,
        '',
        'The operation completed successfully.',
        '',
        '- **Name:** ' + inlineCode(name),
        '- **Node ID:** ' + inlineCode(id),
      ];
      if (path) {
        lines.push('- **Location:** ' + inlineCode(path));
      }
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

  private async executeRun(
    userId: number,
    runId: number,
    preferredModel?: { provider?: string; model?: string },
    preferredLanguage?: string
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

      const content = runRow.triggerMessage.content;
      const mentions = parseMentions(runRow.triggerMessage.mentionsJson);

      await this.repository.updateRun(userId, runId, {
        status: 'running',
        startedAt: new Date(),
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

      if (!cancelled) log.error({ err: error, runId }, 'Agent run failed');
    } finally {
      AgentService.runControllers.delete(runId);
    }
  }
}
