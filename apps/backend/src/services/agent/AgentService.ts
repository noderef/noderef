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

import type { AgentMention, AgentRunSummary } from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import { AgentRepository } from '../../repositories/agentRepository.js';
import type { ServerService } from '../serverService.js';
import { AgentRunEngine } from './AgentRunEngine.js';
import { AGENT_MANIFEST_VERSION } from './agentManifest.js';
import { inlineCode, truncateText } from './agentFormatting.js';
import {
  buildConfirmedOperationMessage,
  buildContinuationContent,
  buildOperationFailureMessage,
  buildRunFailureMessage,
  extractPrimaryNodeIdFromOutput,
  getConfirmationActionLabel,
} from './agentMessageBuilders.js';
import {
  getPreferredModelFromPlan,
  normalizeAppLanguage,
  parseJsonRecord,
} from './agentParsing.js';
import {
  buildPaginatedResponse,
  cleanText,
  createExecutionContext,
  emitRunEvent,
  extractErrorMessage,
  isRecord,
  nowIso,
  parseMentions,
  publishAssistantClear,
  publishRunStatus,
  publishStreamError,
  resolveAiRuntime,
} from './agentUtils.js';
import { buildCompletionNote, buildQueuedNote } from './progressMessages.js';
import { searchMentions } from './searchMentions.js';
import { getToolByName, resolveToolName } from './tools/registry.js';
import type { AgentExecutionContext } from './types.js';

const log = createLogger('agent.service');

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);

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
  enableAutoApproveConfirmations?: boolean;
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

  async getRunSummary(userId: number, runId: number): Promise<AgentRunSummary | null> {
    return this.repository.getRunSummary(userId, runId);
  }

  private async broadcastRunStatus(userId: number, runId: number): Promise<void> {
    const summary = await this.getRunSummary(userId, runId);
    if (summary) {
      publishRunStatus(runId, summary);
    }
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

    const preferredLanguage = normalizeAppLanguage(payload.appLanguage);

    await this.emitEvent(run.id, 'run.queued', 'info', { messageId: message.id });
    const queuedNote = buildQueuedNote(preferredLanguage);
    await emitRunEvent(
      this.repository,
      run.id,
      queuedNote.type,
      'info',
      queuedNote.payload as Record<string, unknown>
    );
    await this.broadcastRunStatus(userId, run.id);

    const aiSelection = {
      provider:
        typeof payload.aiProvider === 'string'
          ? payload.aiProvider.trim().toLowerCase()
          : undefined,
      model: typeof payload.aiModel === 'string' ? payload.aiModel.trim() : undefined,
    };
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

    await this.emitEvent(run.id, 'run.cancelled', 'warn', { cancelledAt: nowIso() });
    publishAssistantClear(run.id);
    await this.broadcastRunStatus(userId, run.id);

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

    const shouldAutoApproveContinuation = Boolean(
      payload.enableAutoApproveConfirmations ||
        (run.plan && run.plan.autoApproveConfirmations === true)
    );

    if (shouldAutoApproveContinuation) {
      await this.repository.updateRun(userId, run.id, {
        plan: {
          ...(run.plan || {}),
          autoApproveConfirmations: true,
        },
      });
    }

    return this.approveStep(userId, run, step, confirmationMessage, {
      autoApproveConfirmationsForContinuation: shouldAutoApproveContinuation,
    });
  }

  async setChatAutoApproveConfirmations(userId: number, chatId: number, enabled: boolean) {
    const chat = await this.repository.findChatById(userId, chatId);
    if (!chat) {
      return AppErrors.notFound('Chat', chatId);
    }

    const activeRuns = await this.prisma.agentRun.findMany({
      where: {
        userId,
        chatId,
        status: { in: ['queued', 'running', 'waiting_confirmation'] },
      },
      select: { id: true, planJson: true },
    });

    await Promise.all(
      activeRuns.map(async run => {
        const existingPlan = parseJsonRecord(run.planJson) || {};
        await this.repository.updateRun(userId, run.id, {
          plan: {
            ...existingPlan,
            autoApproveConfirmations: enabled,
          },
        });
      })
    );

    return { success: true, updatedRuns: activeRuns.length };
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

    await emitRunEvent(this.repository, run.id, 'step.rejected', 'warn', {
      stepId: step.id,
      confirmedAt: nowIso(),
      confirmationMessageId: confirmationMessage.id,
    });
    await this.broadcastRunStatus(userId, run.id);

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
    confirmationMessage: { id: number },
    options?: { autoApproveConfirmationsForContinuation?: boolean }
  ) {
    const execCtx = await createExecutionContext(
      this.prisma,
      this.serverService,
      userId,
      run.serverId
    );

    await this.repository.updateRun(userId, run.id, { status: 'running', error: null });
    await this.broadcastRunStatus(userId, run.id);

    await this.repository.updateRunStep(userId, run.id, step.id, {
      status: 'running',
      confirmedAt: new Date(),
      startedAt: new Date(),
    });

    await emitRunEvent(this.repository, run.id, 'step.confirmed', 'info', {
      stepId: step.id,
      confirmationMessageId: confirmationMessage.id,
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
        content: buildConfirmedOperationMessage(canonicalOperation, output, stepInput),
        mentions: [],
      });

      const completedAction = getConfirmationActionLabel(step);
      const preferredModel = getPreferredModelFromPlan(run.plan);
      const preferredLanguage = normalizeAppLanguage(
        typeof run.plan?.appLanguage === 'string' ? run.plan.appLanguage : undefined
      );

      const continuationAutoApprove = Boolean(options?.autoApproveConfirmationsForContinuation);

      setImmediate(() => {
        void this.executeRun(
          userId,
          run.id,
          preferredModel,
          preferredLanguage,
          continuationAutoApprove,
          {
            completedAction,
            completedOutput: output,
          }
        ).catch(error => {
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
        content: buildOperationFailureMessage(resolveToolName(step.operation), message),
        mentions: [],
      });

      log.warn(
        { runId: run.id, stepId: step.id, operation: resolveToolName(step.operation), err: error },
        'Confirmed operation failed; returning failed run status without throwing'
      );
      return { success: true, runStatus: 'failed' as const };
    }
  }

  private async runPostActionVerification(
    userId: number,
    runId: number,
    step: { id: number; ordinal: number; operation: string },
    operation: string,
    output: Record<string, unknown>,
    execCtx: AgentExecutionContext
  ): Promise<Record<string, unknown> | null> {
    const nodeId = extractPrimaryNodeIdFromOutput(operation, output);
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
        chat: { select: { id: true, title: true, chatIcon: true } },
      },
    });

    if (!runRow?.triggerMessage || !runRow.chat) return;

    const controller = new AbortController();
    AgentService.runControllers.set(runId, controller);

    try {
      const runtime = await resolveAiRuntime(userId, preferredModel);
      if (!runtime) throw new Error('No AI provider configured.');

      const content = continuation
        ? buildContinuationContent(
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
          autoApproveConfirmations,
          ...(preferredLanguage ? { appLanguage: preferredLanguage } : {}),
        },
      });
      await this.broadcastRunStatus(userId, runId);

      const execCtx = await createExecutionContext(
        this.prisma,
        this.serverService,
        userId,
        runRow.serverId,
        {
          signal: controller.signal,
          aiRuntime: runtime,
        }
      );

      const engine = new AgentRunEngine(this.repository, runtime, execCtx, controller.signal);

      await engine.execute({
        runId,
        chatId: runRow.chatId,
        serverId: runRow.serverId,
        userId,
        content,
        mentions,
        chatTitle: runRow.chat.title,
        chatIcon: runRow.chat.chatIcon,
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
        const completionNote = buildCompletionNote(true, preferredLanguage);
        await emitRunEvent(
          this.repository,
          runId,
          completionNote.type,
          'info',
          completionNote.payload as Record<string, unknown>
        );
        await this.broadcastRunStatus(userId, runId);
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
        publishAssistantClear(runId);
      } else {
        const completionNote = buildCompletionNote(false, preferredLanguage);
        await emitRunEvent(
          this.repository,
          runId,
          completionNote.type,
          'info',
          completionNote.payload as Record<string, unknown>
        );
        publishStreamError(runId, message, 'run_failed');
      }
      await this.broadcastRunStatus(userId, runId);

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
        const failureContent = await buildRunFailureMessage(this.prisma, runId, message).catch(
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
