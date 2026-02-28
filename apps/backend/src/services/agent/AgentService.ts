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
import { getToolByName } from './tools/registry.js';
import type { AgentExecutionContext } from './types.js';

const log = createLogger('agent.service');

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);

interface SendMessageInput {
  chatId: number;
  content: string;
  mentions?: AgentMention[];
  aiProvider?: string;
  aiModel?: string;
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
      content: 'Deletion request cancelled by user confirmation.',
      mentions: [],
    });

    return { success: true, runStatus: 'cancelled' };
  }

  private async approveStep(
    userId: number,
    run: { id: number; chatId: number; serverId: number },
    step: {
      id: number;
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

    try {
      const stepInput = (step.input && isRecord(step.input) ? step.input : {}) as Record<
        string,
        unknown
      >;

      const tool = getToolByName(step.operation);
      if (!tool) {
        throw new Error(`Unknown tool in confirmed step: ${step.operation}`);
      }

      const toolResult = await tool.execute(execCtx, stepInput);
      if (!toolResult.ok) {
        throw new Error(toolResult.error);
      }
      const output = toolResult.data;

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
        payload: { finishedAt: nowIso(), progressMessage: 'Run completed' },
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
    preferredModel?: { provider?: string; model?: string }
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
        plan: { version: AGENT_MANIFEST_VERSION, provider: runtime.provider, model: runtime.model },
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

      await this.repository.createMessage({
        chatId: runRow.chatId,
        userId,
        role: 'assistant',
        content: cancelled ? 'Run cancelled.' : `Run failed: ${message}`,
        mentions: [],
      });

      if (!cancelled) log.error({ err: error, runId }, 'Agent run failed');
    } finally {
      AgentService.runControllers.delete(runId);
    }
  }
}
