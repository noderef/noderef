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
import { getAiProvider } from '../ai/providers.js';
import { createLogger } from '../lib/logger.js';
import { AppErrors } from '../lib/errors.js';
import { AgentRepository, type AgentMessage, type AgentRun, type AgentRunStep } from '../repositories/agentRepository.js';
import type { ServerService } from './serverService.js';
import { AGENT_MANIFEST_VERSION, agentManifest } from './agentManifest.js';
import { buildExecutionPlan, executeOperation, type AgentExecutionContext, type AgentPlannedStep } from './agentOperationRegistry.js';
import { resolveUserAiConfig } from './ai/userSettingsService.js';
import { getAiAssistantEnabled } from './userSettings.js';

const log = createLogger('agent.service');

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);
const MAX_PLANNER_STEPS = 6;
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

interface SendMessageInput {
  chatId: number;
  content: string;
  mentions?: AgentMention[];
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
      },
    });

    // Fire-and-forget execution for independent concurrent runs.
    setImmediate(() => {
      void this.executeRun(userId, run.id).catch(error => {
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
      const output = await executeOperation(step.operation as AgentPlannedStep['operation'], execCtx, step.input || {});

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
        },
      });

      await this.repository.createRunEvent({
        runId: run.id,
        type: 'run.completed',
        level: 'info',
        payload: {
          finishedAt: nowIso(),
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
        content: `Confirmed. Operation \"${step.operation}\" completed successfully.`,
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

  private formatAssistantSummary(plan: AgentPlannedStep[], completedSteps: AgentRunStep[]): string {
    if (!completedSteps.length) {
      return 'No executable operations were completed.';
    }

    const byOrdinal = new Map<number, AgentRunStep>();
    for (const step of completedSteps) {
      byOrdinal.set(step.ordinal, step);
    }

    const lines = ['Run completed.', ''];
    for (const planned of plan) {
      const step = Array.from(byOrdinal.values()).find(item => item.operation === planned.operation);
      if (!step) {
        continue;
      }
      lines.push(`- ${planned.operation}: ${step.summary || 'completed'}`);
    }

    return lines.join('\n');
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

  private parsePlannerPayload(raw: string): unknown {
    const payload = this.extractJsonObject(raw);
    return JSON.parse(payload);
  }

  private normalizePlannerSteps(
    candidate: unknown,
    fallbackPlan: AgentPlannedStep[]
  ): AgentPlannedStep[] {
    const parsedSteps = Array.isArray(candidate)
      ? candidate
      : isRecord(candidate) && Array.isArray(candidate.steps)
        ? candidate.steps
        : [];

    if (!parsedSteps.length) {
      return [];
    }

    const manifestByOperation = new Map(agentManifest.operations.map(operation => [operation.name, operation]));

    const normalized: AgentPlannedStep[] = [];
    for (const item of parsedSteps.slice(0, MAX_PLANNER_STEPS)) {
      if (!isRecord(item)) {
        continue;
      }

      const operationName = typeof item.operation === 'string' ? item.operation.trim() : '';
      if (!operationName || !isAgentOperation(operationName)) {
        continue;
      }

      const manifestOperation = manifestByOperation.get(operationName);
      if (!manifestOperation) {
        continue;
      }

      const summary =
        typeof item.summary === 'string' && item.summary.trim()
          ? cleanText(item.summary)
          : `${operationName} planned`;

      const rawInput = isRecord(item.input) ? item.input : {};
      const fallbackStep = fallbackPlan.find(step => step.operation === operationName);
      const fallbackInput = fallbackStep?.input ?? {};

      const input =
        operationName === 'search'
          ? {
              query:
                typeof rawInput.query === 'string'
                  ? rawInput.query
                  : (fallbackInput.query ?? ''),
              nodeId:
                typeof rawInput.nodeId === 'string' || rawInput.nodeId === null
                  ? rawInput.nodeId
                  : (fallbackInput.nodeId ?? null),
              maxItems:
                typeof rawInput.maxItems === 'number' && Number.isFinite(rawInput.maxItems)
                  ? Math.max(1, Math.min(Math.round(rawInput.maxItems), 500))
                  : (fallbackInput.maxItems ?? 100),
            }
          : {
              ...fallbackInput,
              ...rawInput,
            };

      normalized.push({
        operation: operationName,
        summary,
        input,
        requiresConfirmation: Boolean(manifestOperation.requiresConfirmation),
      });
    }

    if (!normalized.length) {
      return [];
    }

    const fallbackSearch = fallbackPlan.find(step => step.operation === 'search');
    const plannedSearch = normalized.find(step => step.operation === 'search');
    const rest = normalized.filter(step => step.operation !== 'search');

    const firstSearch = plannedSearch ?? fallbackSearch;
    if (!firstSearch) {
      return rest.slice(0, MAX_PLANNER_STEPS);
    }

    return [firstSearch, ...rest].slice(0, MAX_PLANNER_STEPS);
  }

  private buildPlannerPrompt(content: string, mentions: AgentMention[]): string {
    const manifestSummary = agentManifest.operations.map(operation => ({
      name: operation.name,
      aliases: operation.aliases,
      destructive: Boolean(operation.destructive),
      requiresConfirmation: Boolean(operation.requiresConfirmation),
      alwaysFirst: Boolean(operation.alwaysFirst),
      description: operation.description,
    }));

    const compactMentions = mentions.map(item => ({
      id: item.id,
      type: item.type,
      label: item.label,
      path: item.path ?? null,
    }));

    return [
      'You are an agent planner for NodeRef.',
      'Generate an execution plan as strict JSON for repository operations.',
      'Output only valid JSON. No markdown, no commentary.',
      '',
      `Allowed operations: ${AGENT_OPERATION_NAMES.join(', ')}`,
      'Rules:',
      '1. Always include "search" as the first step.',
      `2. Use only the allowed operations and at most ${MAX_PLANNER_STEPS} steps.`,
      '3. For delete steps, include target node identifiers where possible.',
      '4. Keep each summary short and factual.',
      '5. For search, prefer mention nodeId as scope when available.',
      '',
      'Return JSON with this schema:',
      '{"steps":[{"operation":"search","summary":"...","input":{"query":"...","nodeId":"...","maxItems":100}}]}',
      '',
      `Manifest: ${JSON.stringify(manifestSummary)}`,
      `Mentions: ${JSON.stringify(compactMentions)}`,
      `User message: ${JSON.stringify(content)}`,
    ].join('\n');
  }

  private async buildExecutionPlanWithModel(
    userId: number,
    content: string,
    mentions: AgentMention[]
  ): Promise<{
    plan: AgentPlannedStep[];
    planner: 'model' | 'heuristic';
    provider: string | null;
    model: string | null;
  }> {
    const fallbackPlan = buildExecutionPlan(content, mentions);

    const [assistantEnabled, aiConfig] = await Promise.all([
      getAiAssistantEnabled(userId),
      resolveUserAiConfig(userId),
    ]);

    if (!assistantEnabled || !aiConfig) {
      return {
        plan: fallbackPlan,
        planner: 'heuristic',
        provider: null,
        model: null,
      };
    }

    const provider = getAiProvider(aiConfig.provider);
    if (!provider) {
      return {
        plan: fallbackPlan,
        planner: 'heuristic',
        provider: aiConfig.provider,
        model: aiConfig.model,
      };
    }

    try {
      const prompt = this.buildPlannerPrompt(content, mentions);
      const raw = await callAnthropic({
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        prompt,
        maxTokens: 800,
        temperature: provider.defaultTemperature ?? 0,
        baseURL: provider.baseURL,
      });

      const parsed = this.parsePlannerPayload(raw);
      const plan = this.normalizePlannerSteps(parsed, fallbackPlan);
      if (!plan.length) {
        return {
          plan: fallbackPlan,
          planner: 'heuristic',
          provider: provider.id,
          model: aiConfig.model,
        };
      }

      return {
        plan,
        planner: 'model',
        provider: provider.id,
        model: aiConfig.model,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(
        { userId, provider: provider.id, model: aiConfig.model, error: message },
        'Model planning failed, falling back to heuristic planner'
      );
      return {
        plan: fallbackPlan,
        planner: 'heuristic',
        provider: provider.id,
        model: aiConfig.model,
      };
    }
  }

  private async executeRun(userId: number, runId: number): Promise<void> {
    const runRow = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId },
      include: {
        triggerMessage: true,
      },
    });

    if (!runRow || !runRow.triggerMessage) {
      return;
    }

    const controller = new AbortController();
    AgentService.runControllers.set(runId, controller);

    let currentStep: AgentRunStep | null = null;

    try {
      await this.repository.updateRun(userId, runId, {
        status: 'running',
        startedAt: new Date(),
        error: null,
      });

      await this.repository.createRunEvent({
        runId,
        type: 'run.started',
        level: 'info',
        payload: {
          startedAt: nowIso(),
        },
      });

      const mentions = parseMentions(runRow.triggerMessage.mentionsJson);
      await this.repository.createRunEvent({
        runId,
        type: 'run.planning.started',
        level: 'info',
        payload: {
          startedAt: nowIso(),
        },
      });

      const planning = await this.buildExecutionPlanWithModel(
        userId,
        runRow.triggerMessage.content,
        mentions
      );
      const plan = planning.plan;

      await this.repository.createRunEvent({
        runId,
        type: 'run.planning.completed',
        level: 'info',
        payload: {
          completedAt: nowIso(),
          planner: planning.planner,
          provider: planning.provider,
          model: planning.model,
          stepCount: plan.length,
        },
      });

      await this.repository.updateRun(userId, runId, {
        plan: {
          version: AGENT_MANIFEST_VERSION,
          planner: planning.planner,
          provider: planning.provider,
          model: planning.model,
          steps: plan,
        },
      });

      const baseCtx = await this.createExecutionContext(userId, runRow.serverId);
      const execCtx: AgentExecutionContext = {
        ...baseCtx,
        signal: controller.signal,
      };

      const completedSteps: AgentRunStep[] = [];

      for (let index = 0; index < plan.length; index++) {
        if (controller.signal.aborted) {
          throw new Error('Run cancelled');
        }

        const planned = plan[index];

        currentStep = await this.repository.createRunStep({
          runId,
          ordinal: index + 1,
          operation: planned.operation,
          status: 'pending',
          summary: planned.summary,
          input: planned.input,
          requiresConfirmation: planned.requiresConfirmation,
        });

        await this.repository.updateRunStep(userId, runId, currentStep.id, {
          status: 'running',
          startedAt: new Date(),
        });

        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.started',
          level: 'info',
          payload: {
            operation: planned.operation,
            ordinal: currentStep.ordinal,
          },
        });

        if (planned.requiresConfirmation) {
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
              operation: planned.operation,
              summary: planned.summary,
            },
          });

          const assistantMessage = await this.repository.createMessage({
            chatId: runRow.chatId,
            userId,
            role: 'assistant',
            content:
              `Confirmation required before executing \"${planned.operation}\".` +
              `\nStep: ${currentStep.id}` +
              `\nType DELETE in confirmation dialog to proceed.`,
            mentions: [],
          });

          await this.repository.createOperationAudit({
            runId,
            stepId: currentStep.id,
            userId,
            serverId: runRow.serverId,
            operation: planned.operation,
            action: 'requested',
            targetSummary: planned.summary,
            requestMessageId: runRow.triggerMessage.id,
            confirmationMessageId: assistantMessage.id,
            metadata: {
              requiresConfirmation: true,
              stepInput: planned.input,
            },
          });

          return;
        }

        const output = await executeOperation(planned.operation, execCtx, planned.input);

        currentStep =
          (await this.repository.updateRunStep(userId, runId, currentStep.id, {
            status: 'completed',
            completedAt: new Date(),
            output,
            summary:
              planned.operation === 'search'
                ? 'Repository context collected'
                : `${planned.operation} completed`,
          })) || currentStep;

        completedSteps.push(currentStep);

        await this.repository.createRunEvent({
          runId,
          stepId: currentStep.id,
          type: 'step.completed',
          level: 'info',
          payload: {
            operation: planned.operation,
            output,
          },
        });
      }

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
        },
      });

      await this.repository.createMessage({
        chatId: runRow.chatId,
        userId,
        role: 'assistant',
        content: this.formatAssistantSummary(plan, completedSteps),
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
        payload: { error: message },
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
