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

import { GroupsApi, PeopleApi, SearchApi } from '@alfresco/js-api';
import type { PrismaClient } from '@prisma/client';
import type { AgentMention } from '@app/contracts';
import { randomUUID } from 'crypto';
import { getAuthenticatedClientWithRefresh } from './alfresco/authenticationHelper.js';
import { callAnthropic } from '../ai/anthropic.js';
import { loadLibs } from '../ai/loadLibs.js';
import { getAiProvider } from '../ai/providers.js';
import { createLogger } from '../lib/logger.js';
import { AppErrors } from '../lib/errors.js';
import { AgentRepository, type AgentMessage, type AgentRun, type AgentRunStep } from '../repositories/agentRepository.js';
import type { ServerService } from './serverService.js';
import { AGENT_MANIFEST_VERSION, agentManifest } from './agentManifest.js';
import { executeOperation, type AgentExecutionContext, type AgentPlannedStep } from './agentOperationRegistry.js';
import { resolveUserAiConfig, resolveUserAiConfigForProvider } from './ai/userSettingsService.js';
import { getAiAssistantEnabled } from './userSettings.js';

const log = createLogger('agent.service');

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);
const PLANNER_TIMEOUT_MS = 12000;
const TITLE_TIMEOUT_MS = 6000;
const SCRIPT_TIMEOUT_MS = 18000;
const SUMMARY_TIMEOUT_MS = 10000;
const MAX_LOOP_TRIES = 5;
const MAX_HISTORY_ITEMS = 20;
const MAX_LIB_CHARS = 3500;
const AGENT_OPERATION_NAMES: AgentPlannedStep['operation'][] = [
  'search',
  'move',
  'copy',
  'delete',
  'executeScript',
];

const parseMentions = (raw: string | null): AgentMention[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const typed = item as Partial<AgentMention>;
        if (!typed.id || !typed.type || !typed.label) {
          return null;
        }
        if (!['node', 'person', 'group', 'server'].includes(typed.type)) {
          return null;
        }
        return {
          id: String(typed.id),
          type: typed.type,
          label: String(typed.label),
          path: typed.path ?? null,
        } as AgentMention;
      })
      .filter((item): item is AgentMention => Boolean(item));
  } catch {
    return [];
  }
};

const cleanText = (value: string): string => value.trim().replace(/\s+/g, ' ');

const nowIso = () => new Date().toISOString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isAgentOperation = (value: string): value is AgentPlannedStep['operation'] =>
  AGENT_OPERATION_NAMES.includes(value as AgentPlannedStep['operation']);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

interface SendMessageInput {
  chatId: number;
  content: string;
  mentions?: AgentMention[];
  aiProvider?: string;
  aiModel?: string;
}

interface AgentRuntimeSelection {
  provider?: string;
  model?: string;
}

interface ResolvedAiRuntime {
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
  temperature: number;
}

interface AgentPlannerDecision {
  done: boolean;
  operation?: AgentPlannedStep['operation'];
  activity?: string;
  input?: Record<string, unknown>;
  requiresConfirmation?: boolean;
  reason?: string;
}

interface AgentScriptInstruction {
  activity: string;
  script: string;
  expected?: string | null;
}

interface AgentLoopHistoryItem {
  attempt: number;
  operation: AgentPlannedStep['operation'];
  activity: string;
  input: Record<string, unknown>;
  scriptPreview: string;
  output?: Record<string, unknown> | null;
  error?: string;
}

interface ConfirmStepInput {
  runId: number;
  stepId: number;
  confirmationToken: string;
  approved: boolean;
  confirmationText?: string;
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
    return agentManifest;
  }

  async listChats(
    userId: number,
    params: { serverId?: number; skipCount?: number; maxItems?: number } = {}
  ) {
    const page = await this.repository.listChats(userId, params);

    return {
      items: page.items,
      pagination: {
        totalItems: page.totalItems,
        skipCount: Math.max(0, params.skipCount ?? 0),
        maxItems: Math.max(1, Math.min(params.maxItems ?? 50, 100)),
        hasMoreItems: (params.skipCount ?? 0) + page.items.length < page.totalItems,
      },
    };
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
    return {
      items: page.items,
      pagination: {
        totalItems: page.totalItems,
        skipCount: Math.max(0, params.skipCount ?? 0),
        maxItems: Math.max(1, Math.min(params.maxItems ?? 50, 100)),
        hasMoreItems: (params.skipCount ?? 0) + page.items.length < page.totalItems,
      },
    };
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

    await this.repository.createRunEvent({
      runId: run.id,
      type: 'run.queued',
      level: 'info',
      payload: {
        messageId: message.id,
        queuedAt: nowIso(),
        progressMessage: 'Queued',
      },
    });

    const aiSelection = {
      provider: typeof payload.aiProvider === 'string' ? payload.aiProvider.trim().toLowerCase() : undefined,
      model: typeof payload.aiModel === 'string' ? payload.aiModel.trim() : undefined,
    };

    // Fire-and-forget execution for independent concurrent runs.
    setImmediate(() => {
      void this.executeRun(userId, run.id, aiSelection).catch(error => {
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

    if (step.operation === 'delete' && payload.approved && payload.confirmationText !== 'DELETE') {
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
      await this.repository.updateRunStep(userId, run.id, step.id, {
        status: 'cancelled',
        confirmedAt: new Date(),
        completedAt: new Date(),
        output: {
          approved: false,
          reason: 'User rejected destructive operation',
        },
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
        content: 'Deletion request cancelled by user confirmation.',
        mentions: [],
      });

      return { success: true, runStatus: 'cancelled' };
    }

    const execCtx = await this.createExecutionContext(userId, run.serverId);

    await this.repository.updateRun(userId, run.id, {
      status: 'running',
      error: null,
    });

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
      payload: {
        stepId: step.id,
        confirmationMessageId: confirmationMessage.id,
      },
    });

    try {
      const stepInput = (step.input && isRecord(step.input) ? step.input : {}) as Record<string, unknown>;
      const generatedScript =
        typeof stepInput.generatedScript === 'string'
          ? this.normalizeScript(stepInput.generatedScript)
          : typeof stepInput.script === 'string'
            ? this.normalizeScript(stepInput.script)
            : '';

      const executionOutput = generatedScript
        ? await executeOperation('executeScript', execCtx, { script: generatedScript })
        : await executeOperation(step.operation as AgentPlannedStep['operation'], execCtx, stepInput);

      const statusCode = typeof executionOutput.status === 'number' ? executionOutput.status : 0;
      const outputError =
        typeof executionOutput.error === 'string' && executionOutput.error.trim()
          ? executionOutput.error.trim()
          : null;
      if (outputError || statusCode >= 400) {
        throw new Error(outputError || `Script execution failed with status ${statusCode}`);
      }

      const output = generatedScript
        ? {
            operation:
              typeof stepInput.plannedOperation === 'string' && isAgentOperation(stepInput.plannedOperation)
                ? stepInput.plannedOperation
                : step.operation,
            activity: step.summary || 'Confirmed operation',
            expected: typeof stepInput.expected === 'string' ? stepInput.expected : null,
            output: executionOutput,
          }
        : executionOutput;

      await this.repository.updateRunStep(userId, run.id, step.id, {
        status: 'completed',
        output,
        completedAt: new Date(),
      });

      await this.repository.updateRun(userId, run.id, {
        status: 'completed',
        finishedAt: new Date(),
        error: null,
      });

      await this.repository.createRunEvent({
        runId: run.id,
        stepId: step.id,
        type: 'step.completed',
        level: 'info',
        payload: {
          stepId: step.id,
          output,
          progressMessage: `${step.summary || step.operation} completed`,
        },
      });

      await this.repository.createRunEvent({
        runId: run.id,
        type: 'run.completed',
        level: 'info',
        payload: {
          finishedAt: nowIso(),
          progressMessage: 'Run completed',
        },
      });

      await this.repository.createOperationAudit({
        runId: run.id,
        stepId: step.id,
        userId,
        serverId: run.serverId,
        operation: step.operation,
        action: 'confirmed',
        targetSummary: step.summary,
        confirmationMessageId: confirmationMessage.id,
        metadata: { output },
      });

      await this.repository.createMessage({
        chatId: run.chatId,
        userId,
        role: 'assistant',
        content: `Confirmed. Operation "${step.operation}" completed successfully.`,
        mentions: [],
      });

      return { success: true, runStatus: 'completed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.repository.updateRunStep(userId, run.id, step.id, {
        status: 'failed',
        completedAt: new Date(),
        output: {
          error: message,
        },
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
        payload: { error: message },
      });

      await this.repository.createMessage({
        chatId: run.chatId,
        userId,
        role: 'assistant',
        content: `Confirmation accepted, but operation failed: ${message}`,
        mentions: [],
      });

      throw error;
    }
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
    const query = payload.query.trim();
    if (!query) {
      return {
        items: [],
        pagination: {
          totalItems: 0,
          skipCount: 0,
          maxItems: 0,
          hasMoreItems: false,
        },
      };
    }

    const maxItems = Math.max(1, Math.min(payload.maxItems ?? 20, 50));
    const skipCount = Math.max(0, payload.skipCount ?? 0);
    const types = payload.types && payload.types.length ? new Set(payload.types) : null;

    const ctx = await this.createExecutionContext(userId, payload.serverId);

    const searchApi = new SearchApi(ctx.api);
    const peopleApi = new PeopleApi(ctx.api);
    const groupsApi = new GroupsApi(ctx.api);

    const lowered = query.toLowerCase();
    const items: Array<{ id: string; type: 'node' | 'person' | 'group'; label: string; path?: string | null; subtitle?: string | null }> = [];

    if (!types || types.has('node')) {
      const escaped = query.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
      const nodeResult = await searchApi.search({
        query: {
          query: `(cm:name:"*${escaped}*" OR TEXT:"${escaped}*") AND (TYPE:"cm:content" OR TYPE:"cm:folder")`,
          language: 'afts',
        },
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content'],
        include: ['path'],
        paging: {
          maxItems: 30,
          skipCount: 0,
        },
      } as any);

      for (const entry of nodeResult.list?.entries || []) {
        const node = entry.entry;
        if (!node?.id || !node?.name) {
          continue;
        }
        items.push({
          id: node.id,
          type: 'node',
          label: node.name,
          path: node.path?.name || null,
          subtitle: node.nodeType || null,
        });
      }
    }

    if (!types || types.has('person')) {
      const people = await peopleApi.listPeople({
        maxItems: 100,
        skipCount: 0,
        fields: ['id', 'firstName', 'lastName', 'email'],
      });

      for (const entry of people.list?.entries || []) {
        const person = entry.entry;
        const label = [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.id;
        const haystack = `${person.id || ''} ${label} ${person.email || ''}`.toLowerCase();
        if (!haystack.includes(lowered)) {
          continue;
        }
        items.push({
          id: person.id,
          type: 'person',
          label,
          subtitle: person.email || null,
        });
      }
    }

    if (!types || types.has('group')) {
      const groups = await groupsApi.listGroups({
        maxItems: 100,
        skipCount: 0,
        fields: ['id', 'displayName'],
      });

      for (const entry of groups.list?.entries || []) {
        const group = entry.entry;
        if (!group?.id) {
          continue;
        }

        const label = (group.displayName || group.id || '').trim();
        if (!label) {
          continue;
        }

        const haystack = `${group.id || ''} ${label}`.toLowerCase();
        if (!haystack.includes(lowered)) {
          continue;
        }
        items.push({
          id: group.id,
          type: 'group',
          label,
          subtitle: group.id,
        });
      }
    }

    const ranked = items
      .map(item => {
        const lowerLabel = item.label.toLowerCase();
        const lowerSubtitle = (item.subtitle || '').toLowerCase();

        let score = 3;
        if (lowerLabel.startsWith(lowered)) {
          score = 0;
        } else if (lowerSubtitle.startsWith(lowered)) {
          score = 1;
        } else if (lowerLabel.includes(lowered)) {
          score = 2;
        }

        return { ...item, score };
      })
      .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.label.localeCompare(b.label)));

    const page = ranked.slice(skipCount, skipCount + maxItems).map(({ score: _score, ...rest }) => rest);

    return {
      items: page,
      pagination: {
        totalItems: ranked.length,
        skipCount,
        maxItems,
        hasMoreItems: skipCount + page.length < ranked.length,
      },
    };
  }

  private async createExecutionContext(userId: number, serverId: number): Promise<AgentExecutionContext> {
    const server = await this.serverService.findById(userId, serverId);
    if (!server) {
      return AppErrors.notFound('Server', serverId);
    }

    const credentials = await this.serverService.getCredentialsForBackend(userId, serverId);
    if (!credentials?.token || (credentials.authType === 'basic' && !credentials.username)) {
      return AppErrors.unauthorized('No stored credentials found for server');
    }

    const api = await getAuthenticatedClientWithRefresh(userId, serverId, server.baseUrl, this.prisma);
    if (!api) {
      return AppErrors.unauthorized('Failed to authenticate against server');
    }

    // signal is replaced for each run, this placeholder avoids undefined checks.
    const noopController = new AbortController();

    return {
      api,
      serverBaseUrl: server.baseUrl,
      jsconsoleEndpoint: server.jsconsoleEndpoint ?? null,
      authType: credentials.authType,
      username: credentials.username,
      token: credentials.token,
      signal: noopController.signal,
    };
  }

  private formatAssistantSummary(history: AgentLoopHistoryItem[], doneReason?: string): string {
    if (!history.length) {
      return doneReason ? `Run completed.\n\n${doneReason}` : 'Run completed.';
    }

    const lines = ['Run completed.'];
    if (doneReason?.trim()) {
      lines.push('', cleanText(doneReason));
    }

    for (const item of history.slice(-MAX_HISTORY_ITEMS)) {
      const status = item.error ? `failed: ${item.error}` : 'completed';
      lines.push('', `- ${item.activity} (${item.operation}): ${status}`);
    }

    const lastWithOutput = [...history].reverse().find(item => item.output);
    if (lastWithOutput?.output) {
      try {
        const rendered = JSON.stringify(lastWithOutput.output, null, 2);
        lines.push('', rendered.length > 1200 ? `${rendered.slice(0, 1200)}\n...` : rendered);
      } catch {
        // ignore serialization errors
      }
    }

    return lines.join('\n');
  }

  private truncate(value: string, max = 300): string {
    const normalized = value.trim();
    if (normalized.length <= max) {
      return normalized;
    }
    return `${normalized.slice(0, max)}...`;
  }

  private extractJsonObject(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch?.[1]) {
        return fenceMatch[1].trim();
      }
    }

    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return trimmed.slice(first, last + 1);
    }

    return trimmed;
  }

  private parseJsonObject(raw: string): unknown {
    return JSON.parse(this.extractJsonObject(raw));
  }

  private normalizeScript(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      const fenceMatch = trimmed.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
      if (fenceMatch?.[1]) {
        return fenceMatch[1].trim();
      }
    }
    return trimmed;
  }

  private async resolveAiRuntime(
    userId: number,
    preferredModel?: AgentRuntimeSelection
  ): Promise<ResolvedAiRuntime | null> {
    const requestedProvider = preferredModel?.provider?.trim().toLowerCase() || undefined;
    const requestedModel = preferredModel?.model?.trim() || undefined;

    const [assistantEnabled, aiConfig] = await Promise.all([
      getAiAssistantEnabled(userId),
      requestedProvider ? resolveUserAiConfigForProvider(userId, requestedProvider) : resolveUserAiConfig(userId),
    ]);

    if (!assistantEnabled || !aiConfig) {
      return null;
    }

    const provider = getAiProvider(aiConfig.provider);
    if (!provider) {
      return null;
    }

    return {
      provider: provider.id,
      model: requestedModel || aiConfig.model || provider.defaultModel,
      apiKey: aiConfig.apiKey,
      baseURL: provider.baseURL,
      temperature: provider.defaultTemperature ?? 0,
    };
  }

  private async callModel(
    runtime: ResolvedAiRuntime,
    prompt: string,
    options: { maxTokens: number; timeoutMs: number; label: string }
  ): Promise<string> {
    return withTimeout(
      callAnthropic({
        apiKey: runtime.apiKey,
        model: runtime.model,
        prompt,
        maxTokens: options.maxTokens,
        temperature: runtime.temperature,
        baseURL: runtime.baseURL,
      }),
      options.timeoutMs,
      options.label
    );
  }

  private buildFallbackPlannerDecision(
    content: string,
    mentions: AgentMention[],
    attempt: number
  ): AgentPlannerDecision {
    if (attempt > 1) {
      return {
        done: true,
        reason: 'No additional steps were planned.',
      };
    }

    const primaryNode = mentions.find(item => item.type === 'node');
    return {
      done: false,
      operation: 'search',
      activity: 'Collecting repository context',
      requiresConfirmation: false,
      input: {
        query: content,
        nodeId: primaryNode?.id ?? null,
      },
    };
  }

  private buildPlannerPrompt(
    content: string,
    mentions: AgentMention[],
    history: AgentLoopHistoryItem[],
    attempt: number
  ): string {
    const compactMentions = mentions.map(item => ({
      id: item.id,
      type: item.type,
      label: item.label,
      path: item.path ?? null,
    }));

    const compactHistory = history.slice(-MAX_HISTORY_ITEMS).map(item => ({
      attempt: item.attempt,
      operation: item.operation,
      activity: item.activity,
      output: item.output ?? null,
      error: item.error ?? null,
    }));

    const manifestSummary = agentManifest.operations.map(operation => ({
      name: operation.name,
      aliases: operation.aliases,
      description: operation.description,
      alwaysFirst: Boolean(operation.alwaysFirst),
      requiresConfirmation: Boolean(operation.requiresConfirmation),
      destructive: Boolean(operation.destructive),
    }));

    return [
      'You are NodeRef planner.',
      'Decide the next operation for ONE iteration.',
      'Output ONLY valid JSON.',
      '',
      'Return JSON:',
      '{"done":false,"operation":"search","activity":"...","input":{},"requiresConfirmation":false}',
      'OR',
      '{"done":true,"reason":"..."}',
      '',
      `Allowed operations: ${AGENT_OPERATION_NAMES.join(', ')}`,
      'Rules:',
      '- On attempt 1, operation must be search.',
      '- Keep activity short and user-facing.',
      '- Destructive operations require explicit user intent and requiresConfirmation=true.',
      '- Prefer minimal input.',
      '',
      `Attempt: ${attempt}/${MAX_LOOP_TRIES}`,
      `Manifest: ${JSON.stringify(manifestSummary)}`,
      `Mentions: ${JSON.stringify(compactMentions)}`,
      `History: ${JSON.stringify(compactHistory)}`,
      `User message: ${JSON.stringify(content)}`,
    ].join('\n');
  }

  private parsePlannerDecision(
    raw: string,
    fallback: AgentPlannerDecision,
    attempt: number
  ): AgentPlannerDecision {
    let parsed: unknown;
    try {
      parsed = this.parseJsonObject(raw);
    } catch {
      return fallback;
    }

    if (!isRecord(parsed)) {
      return fallback;
    }

    const done = Boolean(parsed.done);
    if (done) {
      return {
        done: true,
        reason: typeof parsed.reason === 'string' ? this.truncate(parsed.reason, 240) : 'Planner marked run as done.',
      };
    }

    const operationRaw = typeof parsed.operation === 'string' ? parsed.operation.trim() : '';
    if (!operationRaw || !isAgentOperation(operationRaw)) {
      return fallback;
    }

    const input = isRecord(parsed.input) ? parsed.input : {};
    const activity =
      typeof parsed.activity === 'string' && parsed.activity.trim()
        ? cleanText(parsed.activity)
        : `${operationRaw} step`;

    const normalizedOperation =
      attempt === 1 && operationRaw !== 'search' ? ('search' as AgentPlannedStep['operation']) : operationRaw;
    const requiresConfirmation =
      normalizedOperation === 'delete' || (normalizedOperation === operationRaw && Boolean(parsed.requiresConfirmation));

    return {
      done: false,
      operation: normalizedOperation,
      activity: normalizedOperation === 'search' && attempt === 1 ? 'Collecting repository context' : activity,
      input,
      requiresConfirmation,
    };
  }

  private buildLibContext(operation: AgentPlannedStep['operation']): string {
    const loaded = loadLibs();
    const preferredByOperation: Record<AgentPlannedStep['operation'], string[]> = {
      search: ['search', 'logger', 'utils'],
      move: ['node', 'actions', 'logger', 'utils'],
      copy: ['node', 'actions', 'logger', 'utils'],
      delete: ['node', 'actions', 'logger', 'utils'],
      executeScript: ['search', 'node', 'actions', 'logger', 'utils'],
    };

    const availableNames = new Set(Object.keys(loaded.manifest));
    const selectedNames = preferredByOperation[operation].filter(name => availableNames.has(name));

    let usedChars = 0;
    const sections: string[] = [];
    for (const name of selectedNames) {
      if (usedChars >= MAX_LIB_CHARS) {
        break;
      }

      const manifestEntry = loaded.manifest[name];
      const source = loaded.libs[name]?.text || '';
      const budget = Math.max(0, Math.min(MAX_LIB_CHARS - usedChars, 1100));
      const snippet = source.slice(0, budget);
      usedChars += snippet.length;

      sections.push(
        [
          `LIB ${name}:`,
          `description=${manifestEntry?.description ?? ''}`,
          `tags=${JSON.stringify(manifestEntry?.tags ?? [])}`,
          snippet,
        ].join('\n')
      );
    }

    return sections.join('\n\n');
  }

  private buildScriptPrompt(params: {
    content: string;
    mentions: AgentMention[];
    history: AgentLoopHistoryItem[];
    decision: AgentPlannerDecision;
    attempt: number;
  }): string {
    const { content, mentions, history, decision, attempt } = params;
    const operation = decision.operation || 'executeScript';
    const compactMentions = mentions.map(item => ({
      id: item.id,
      type: item.type,
      label: item.label,
      path: item.path ?? null,
    }));
    const compactHistory = history.slice(-8).map(item => ({
      attempt: item.attempt,
      operation: item.operation,
      activity: item.activity,
      output: item.output ?? null,
      error: item.error ?? null,
    }));

    return [
      `You are NodeRef script generator for operation "${operation}".`,
      'Write ONE executable Alfresco JS Console script.',
      'Output ONLY valid JSON: {"activity":"...","script":"...","expected":"..."}',
      'Rules:',
      '- Script must be complete and executable in JS Console.',
      '- Add logger.log progress lines (start, important checkpoints, final result).',
      '- No markdown fences in JSON values.',
      '- Use read-only behavior unless operation is explicitly destructive (move/copy/delete).',
      '- If operation is delete, script must only run when target IDs are explicit.',
      '',
      `Attempt: ${attempt}/${MAX_LOOP_TRIES}`,
      `User message: ${JSON.stringify(content)}`,
      `Planner decision: ${JSON.stringify(decision)}`,
      `Mentions: ${JSON.stringify(compactMentions)}`,
      `History: ${JSON.stringify(compactHistory)}`,
      '',
      'Available libs/context:',
      this.buildLibContext(operation),
    ].join('\n');
  }

  private parseScriptInstruction(raw: string, fallbackActivity: string): AgentScriptInstruction {
    const parsed = this.parseJsonObject(raw);
    if (!isRecord(parsed)) {
      throw new Error('Script generator did not return a JSON object.');
    }

    const scriptRaw = typeof parsed.script === 'string' ? this.normalizeScript(parsed.script) : '';
    if (!scriptRaw.trim()) {
      throw new Error('Script generator returned empty script.');
    }

    return {
      activity:
        typeof parsed.activity === 'string' && parsed.activity.trim()
          ? cleanText(parsed.activity)
          : fallbackActivity,
      script: scriptRaw,
      expected:
        typeof parsed.expected === 'string' && parsed.expected.trim() ? this.truncate(parsed.expected, 280) : null,
    };
  }

  private buildSummaryPrompt(
    question: string,
    history: AgentLoopHistoryItem[],
    doneReason: string | null
  ): string {
    const steps = history.slice(-MAX_HISTORY_ITEMS).map(item => ({
      attempt: item.attempt,
      operation: item.operation,
      activity: item.activity,
      output: item.output ?? null,
      error: item.error ?? null,
    }));

    return [
      'You are NodeRef assistant.',
      'Provide the final answer for the user.',
      'Use the same language as the user message.',
      'Keep it concise and factual.',
      '',
      `User message: ${JSON.stringify(question)}`,
      `Done reason: ${JSON.stringify(doneReason)}`,
      `Executed steps: ${JSON.stringify(steps)}`,
    ].join('\n');
  }

  private buildTitlePrompt(firstMessage: string): string {
    return [
      'You generate concise chat titles for NodeRef.',
      'Return ONLY JSON: {"title":"..."}',
      'Rules:',
      '- Max 7 words',
      '- Same language as user',
      '- No punctuation at the end',
      '- Focus on intent, not implementation details',
      '',
      `User message: ${JSON.stringify(firstMessage)}`,
    ].join('\n');
  }

  private async maybeGenerateChatTitle(
    userId: number,
    runId: number,
    chatId: number,
    currentTitle: string,
    firstMessage: string,
    runtime: ResolvedAiRuntime
  ): Promise<void> {
    if (currentTitle.trim().toLowerCase() !== 'new chat') {
      return;
    }

    try {
      const raw = await this.callModel(runtime, this.buildTitlePrompt(firstMessage), {
        maxTokens: 120,
        timeoutMs: TITLE_TIMEOUT_MS,
        label: 'Agent title generation',
      });
      const parsed = this.parseJsonObject(raw);
      if (!isRecord(parsed)) {
        return;
      }

      const titleRaw = typeof parsed.title === 'string' ? cleanText(parsed.title) : '';
      const title = this.truncate(titleRaw.replace(/[.!?]+$/g, ''), 80);
      if (!title || title.toLowerCase() === 'new chat') {
        return;
      }

      await this.repository.updateChatTitle(userId, chatId, title);
      await this.repository.createRunEvent({
        runId,
        type: 'chat.title.updated',
        level: 'debug',
        payload: {
          title,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.debug({ runId, error: message }, 'Chat title generation skipped');
    }
  }

  private async decideNextStep(
    runtime: ResolvedAiRuntime,
    content: string,
    mentions: AgentMention[],
    history: AgentLoopHistoryItem[],
    attempt: number
  ): Promise<AgentPlannerDecision> {
    const fallback = this.buildFallbackPlannerDecision(content, mentions, attempt);

    try {
      const raw = await this.callModel(runtime, this.buildPlannerPrompt(content, mentions, history, attempt), {
        maxTokens: 500,
        timeoutMs: PLANNER_TIMEOUT_MS,
        label: 'Agent planner',
      });
      return this.parsePlannerDecision(raw, fallback, attempt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn({ attempt, error: message }, 'Planner decision failed, using fallback');
      return fallback;
    }
  }

  private async generateScriptInstruction(
    runtime: ResolvedAiRuntime,
    content: string,
    mentions: AgentMention[],
    history: AgentLoopHistoryItem[],
    decision: AgentPlannerDecision,
    attempt: number
  ): Promise<AgentScriptInstruction> {
    const fallbackActivity = decision.activity || `${decision.operation || 'executeScript'} step`;
    const raw = await this.callModel(
      runtime,
      this.buildScriptPrompt({
        content,
        mentions,
        history,
        decision,
        attempt,
      }),
      {
        maxTokens: 1800,
        timeoutMs: SCRIPT_TIMEOUT_MS,
        label: 'Agent script generation',
      }
    );

    return this.parseScriptInstruction(raw, fallbackActivity);
  }

  private async generateFinalSummary(
    runtime: ResolvedAiRuntime,
    question: string,
    history: AgentLoopHistoryItem[],
    doneReason: string | null
  ): Promise<string> {
    try {
      const raw = await this.callModel(runtime, this.buildSummaryPrompt(question, history, doneReason), {
        maxTokens: 600,
        timeoutMs: SUMMARY_TIMEOUT_MS,
        label: 'Agent final summary',
      });
      const summary = raw.trim();
      if (summary) {
        return summary;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn({ error: message }, 'Final summary generation failed, using fallback');
    }

    return this.formatAssistantSummary(history, doneReason || undefined);
  }

  private async executeRun(
    userId: number,
    runId: number,
    preferredModel?: { provider?: string; model?: string }
  ): Promise<void> {
    const runRow = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId },
      include: {
        triggerMessage: true,
        chat: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!runRow || !runRow.triggerMessage || !runRow.chat) {
      return;
    }

    const controller = new AbortController();
    AgentService.runControllers.set(runId, controller);

    let currentStep: AgentRunStep | null = null;

    try {
      const runtime = await this.resolveAiRuntime(userId, preferredModel);
      if (!runtime) {
        throw new Error('No AI provider/model is configured for the current user.');
      }

      await this.repository.updateRun(userId, runId, {
        status: 'running',
        startedAt: new Date(),
        error: null,
        plan: {
          version: AGENT_MANIFEST_VERSION,
          mode: 'llm_loop_v1',
          provider: runtime.provider,
          model: runtime.model,
          maxTries: MAX_LOOP_TRIES,
        },
      });

      await this.repository.createRunEvent({
        runId,
        type: 'run.started',
        level: 'info',
        payload: {
          startedAt: nowIso(),
          progressMessage: 'Thinking...',
          provider: runtime.provider,
          model: runtime.model,
        },
      });

      const content = runRow.triggerMessage.content;
      const mentions = parseMentions(runRow.triggerMessage.mentionsJson);

      await this.maybeGenerateChatTitle(
        userId,
        runId,
        runRow.chatId,
        runRow.chat.title,
        content,
        runtime
      );

      const baseCtx = await this.createExecutionContext(userId, runRow.serverId);
      const execCtx: AgentExecutionContext = {
        ...baseCtx,
        signal: controller.signal,
      };

      const history: AgentLoopHistoryItem[] = [];
      let doneReason: string | null = null;
      let ordinal = 1;

      for (let attempt = 1; attempt <= MAX_LOOP_TRIES; attempt++) {
        if (controller.signal.aborted) {
          throw new Error('Run cancelled');
        }

        await this.repository.createRunEvent({
          runId,
          type: 'run.progress',
          level: 'info',
          payload: {
            attempt,
            maxTries: MAX_LOOP_TRIES,
            progressMessage: `Thinking... (${attempt}/${MAX_LOOP_TRIES})`,
          },
        });

        const decision = await this.decideNextStep(runtime, content, mentions, history, attempt);
        if (decision.done) {
          doneReason = decision.reason || 'Planner completed.';
          break;
        }

        const operation = decision.operation || 'executeScript';
        const activity = decision.activity || `${operation} step`;
        const stepInput = isRecord(decision.input) ? decision.input : {};
        const requiresConfirmation = Boolean(decision.requiresConfirmation || operation === 'delete');

        currentStep = await this.repository.createRunStep({
          runId,
          ordinal,
          operation,
          status: 'pending',
          summary: activity,
          input: stepInput,
          requiresConfirmation,
        });
        ordinal += 1;

        currentStep =
          (await this.repository.updateRunStep(userId, runId, currentStep.id, {
            status: 'running',
            startedAt: new Date(),
          })) || currentStep;

        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.started',
          level: 'info',
          payload: {
            operation,
            ordinal: currentStep.ordinal,
            summary: activity,
            input: stepInput,
            progressMessage: activity,
          },
        });

        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.script.generating',
          level: 'info',
          payload: {
            operation,
            progressMessage: `Preparing script for ${operation}`,
          },
        });

        const instruction = await this.generateScriptInstruction(
          runtime,
          content,
          mentions,
          history,
          decision,
          attempt
        );
        const persistedStepInput = {
          ...stepInput,
          generatedScript: instruction.script,
          expected: instruction.expected ?? null,
          plannedOperation: operation,
        };

        currentStep =
          (await this.repository.updateRunStep(userId, runId, currentStep.id, {
            input: persistedStepInput,
            summary: instruction.activity,
          })) || currentStep;

        const scriptPreview = this.truncate(instruction.script, 1800);
        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.script.generated',
          level: 'info',
          payload: {
            operation,
            expected: instruction.expected ?? null,
            progressMessage: instruction.activity,
            output: {
              scriptPreview,
            },
          },
        });

        if (requiresConfirmation) {
          const confirmationToken = randomUUID();

          currentStep =
            (await this.repository.updateRunStep(userId, runId, currentStep.id, {
              status: 'waiting_confirmation',
              confirmationToken,
            })) || currentStep;

          await this.repository.updateRun(userId, runId, {
            status: 'waiting_confirmation',
          });

          await this.repository.createRunEvent({
            runId,
            stepId: currentStep.id,
            type: 'step.waiting_confirmation',
            level: 'warn',
            payload: {
              stepId: currentStep.id,
              confirmationToken,
              operation,
              summary: instruction.activity,
              progressMessage: `Confirmation required for ${operation}`,
              output: {
                scriptPreview,
              },
            },
          });

          const assistantMessage = await this.repository.createMessage({
            chatId: runRow.chatId,
            userId,
            role: 'assistant',
            content:
              `Confirmation required before executing "${operation}".` +
              `\nStep: ${currentStep.id}` +
              `\nType DELETE in confirmation dialog to proceed.`,
            mentions: [],
          });

          await this.repository.createOperationAudit({
            runId,
            stepId: currentStep.id,
            userId,
            serverId: runRow.serverId,
            operation,
            action: 'requested',
            targetSummary: instruction.activity,
            requestMessageId: runRow.triggerMessage.id,
            confirmationMessageId: assistantMessage.id,
            metadata: {
              requiresConfirmation: true,
              stepInput: persistedStepInput,
            },
          });

          return;
        }

        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.execution.started',
          level: 'info',
          payload: {
            operation,
            progressMessage: `Executing ${operation} script`,
          },
        });

        const executionOutput = await executeOperation('executeScript', execCtx, {
          script: instruction.script,
        });
        const statusCode = typeof executionOutput.status === 'number' ? executionOutput.status : 0;
        const outputError =
          typeof executionOutput.error === 'string' && executionOutput.error.trim()
            ? executionOutput.error.trim()
            : null;
        if (outputError || statusCode >= 400) {
          throw new Error(outputError || `Script execution failed with status ${statusCode}`);
        }

        const stepOutput = {
          operation,
          activity: instruction.activity,
          expected: instruction.expected ?? null,
          output: executionOutput,
        };

        currentStep =
          (await this.repository.updateRunStep(userId, runId, currentStep.id, {
            status: 'completed',
            completedAt: new Date(),
            output: stepOutput,
            summary: `${instruction.activity} completed`,
          })) || currentStep;

        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.completed',
          level: 'info',
          payload: {
            operation,
            output: stepOutput,
            progressMessage: `${instruction.activity} completed`,
          },
        });

        history.push({
          attempt,
          operation,
          activity: instruction.activity,
          input: stepInput,
          scriptPreview,
          output: stepOutput,
        });
        if (history.length > MAX_HISTORY_ITEMS) {
          history.shift();
        }
      }

      if (!doneReason && history.length >= MAX_LOOP_TRIES) {
        doneReason = `Stopped after ${MAX_LOOP_TRIES} attempts`;
      }

      const finalSummary = await this.generateFinalSummary(runtime, content, history, doneReason);

      await this.repository.updateRun(userId, runId, {
        status: 'completed',
        finishedAt: new Date(),
        error: null,
      });

      await this.repository.createRunEvent({
        runId,
        type: 'run.completed',
        level: 'info',
        payload: {
          finishedAt: nowIso(),
          attempts: history.length,
          doneReason,
          progressMessage: 'Run completed',
        },
      });

      await this.repository.createMessage({
        chatId: runRow.chatId,
        userId,
        role: 'assistant',
        content: finalSummary,
        mentions: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const cancelled = controller.signal.aborted || message.toLowerCase().includes('cancel');
      const runStatus = cancelled ? 'cancelled' : 'failed';

      if (currentStep && currentStep.status === 'running') {
        await this.repository.updateRunStep(userId, runId, currentStep.id, {
          status: cancelled ? 'cancelled' : 'failed',
          completedAt: new Date(),
          output: { error: message },
        });
      }

      await this.repository.updateRun(userId, runId, {
        status: runStatus,
        finishedAt: new Date(),
        error: cancelled ? null : message,
      });

      await this.repository.createRunEvent({
        runId,
        stepId: currentStep?.id ?? null,
        type: cancelled ? 'run.cancelled' : 'run.failed',
        level: cancelled ? 'warn' : 'error',
        payload: {
          error: message,
          progressMessage: cancelled ? 'Run cancelled' : `Run failed: ${message}`,
        },
      });

      await this.repository.createMessage({
        chatId: runRow.chatId,
        userId,
        role: 'assistant',
        content: cancelled ? 'Run cancelled.' : `Run failed: ${message}`,
        mentions: [],
      });

      if (!cancelled) {
        log.error({ err: error, runId }, 'Agent run failed');
      }
    } finally {
      AgentService.runControllers.delete(runId);
    }
  }
}
