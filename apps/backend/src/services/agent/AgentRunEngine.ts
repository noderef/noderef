/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 *
 * Agent Run Engine — native tool-use loop.
 *
 * Pipeline (for any provider — Anthropic, MiniMax, future):
 *
 *   messages = [user message + conversation history]
 *   loop:
 *     response = callWithTools(system, messages, tools)
 *     if response.type === 'text'  → save final answer, done
 *     if response.type === 'tool_calls':
 *       for each call:
 *         if requiresConfirmation → pause, await user confirm, return
 *         else execute → collect result
 *       append tool_use + tool_results to messages → continue
 */

import { NodesApi } from '@alfresco/js-api';
import { randomUUID } from 'crypto';
import {
  callWithTools,
  type AgentCallResult,
  type AgentMessageParam,
  type AgentToolSchema,
} from '../../ai/anthropic.js';
import { createLogger } from '../../lib/logger.js';
import type { AgentRepository } from '../../repositories/agentRepository.js';
import { emitRunEvent, formatConversationHistory } from './agentUtils.js';
import { buildConfirmNote, buildDescriptionNote, type ProgressNote } from './progressMessages.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { getAllToolSchemas, getToolByName, resolveToolName } from './tools/registry.js';
import type { AgentExecutionContext, ResolvedAiRuntime, RunInput } from './types.js';

const log = createLogger('agent.engine');

const MAX_LOOP_STEPS = 8;
const CALL_TIMEOUT_MS = 30_000;
const MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL = 60_000;
const MAX_API_TRACE_ENTRIES_PREVIEW = 10;
const MAX_API_TRACE_RESPONSE_CHARS_FOR_MODEL = 4_000;
const AVG_CHARS_PER_TOKEN = 4;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
const CONTEXT_NEAR_LIMIT_RATIO = 0.85;
const CONTEXT_CRITICAL_LIMIT_RATIO = 0.95;
const CONTEXT_TARGET_AFTER_COMPACTION_RATIO = 0.75;
const MAX_COMPACTED_TOOL_RESULT_CHARS = 3_000;

const KNOWN_MODEL_CONTEXT_WINDOWS: Array<{ pattern: RegExp; tokens: number }> = [
  { pattern: /claude/i, tokens: 200_000 },
];

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let h: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      h = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (h) clearTimeout(h);
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);

const toTokenEstimate = (text: string): number => Math.ceil(Math.max(text.length, 1) / AVG_CHARS_PER_TOKEN);

const toPercent = (value: number): number => Math.max(0, Math.round(value * 10) / 10);

interface ContextWindowResolution {
  tokens: number;
  source: 'known' | 'default';
}

interface ContextTokenEstimate {
  systemTokens: number;
  messagesTokens: number;
  toolsTokens: number;
  promptTokens: number;
}

interface ContextCompactionResult {
  removedHistoryMessages: number;
  trimmedToolResultBlocks: number;
  beforePromptTokens: number;
  afterPromptTokens: number;
  applied: boolean;
}

const resolveModelContextWindow = (model: string): ContextWindowResolution => {
  for (const candidate of KNOWN_MODEL_CONTEXT_WINDOWS) {
    if (candidate.pattern.test(model)) {
      return { tokens: candidate.tokens, source: 'known' };
    }
  }
  return { tokens: DEFAULT_CONTEXT_WINDOW_TOKENS, source: 'default' };
};

const estimateMessageContentTokens = (content: unknown): number => {
  if (typeof content === 'string') {
    return toTokenEstimate(content);
  }

  if (!Array.isArray(content)) {
    try {
      return toTokenEstimate(JSON.stringify(content));
    } catch {
      return 0;
    }
  }

  let tokens = 0;
  for (const block of content) {
    if (!isRecord(block)) {
      tokens += 4;
      continue;
    }

    if (block.type === 'text' && typeof block.text === 'string') {
      tokens += toTokenEstimate(block.text) + 4;
      continue;
    }

    if (block.type === 'tool_use') {
      const toolName = typeof block.name === 'string' ? block.name : '';
      tokens += toTokenEstimate(toolName) + 6;
      if (isRecord(block.input)) {
        tokens += toTokenEstimate(JSON.stringify(block.input));
      }
      continue;
    }

    if (block.type === 'tool_result') {
      if (typeof block.content === 'string') {
        tokens += toTokenEstimate(block.content) + 6;
      } else {
        try {
          tokens += toTokenEstimate(JSON.stringify(block.content)) + 6;
        } catch {
          tokens += 6;
        }
      }
      continue;
    }

    try {
      tokens += toTokenEstimate(JSON.stringify(block));
    } catch {
      tokens += 8;
    }
  }

  return tokens;
};

const estimatePromptTokens = (
  systemPrompt: string,
  messages: AgentMessageParam[],
  tools: AgentToolSchema[]
): ContextTokenEstimate => {
  const systemTokens = toTokenEstimate(systemPrompt);
  const messagesTokens = messages.reduce((sum, message) => {
    const messageContent = (message as { content?: unknown }).content;
    return sum + estimateMessageContentTokens(messageContent) + 6;
  }, 0);
  const toolsTokens = toTokenEstimate(JSON.stringify(tools));
  return {
    systemTokens,
    messagesTokens,
    toolsTokens,
    promptTokens: systemTokens + messagesTokens + toolsTokens + 32,
  };
};

const trimHistoricalToolResults = (messages: AgentMessageParam[]): number => {
  let trimmedCount = 0;

  // Preserve the most recent two turns intact.
  for (let index = 0; index < Math.max(0, messages.length - 2); index += 1) {
    const message = messages[index] as { content?: unknown };
    if (!Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content) {
      if (!isRecord(block) || block.type !== 'tool_result' || typeof block.content !== 'string') {
        continue;
      }
      if (block.content.length <= MAX_COMPACTED_TOOL_RESULT_CHARS) {
        continue;
      }

      const removed = block.content.length - MAX_COMPACTED_TOOL_RESULT_CHARS;
      block.content = `${block.content.slice(0, MAX_COMPACTED_TOOL_RESULT_CHARS)}\n... [trimmed ${removed} chars to preserve context window]`;
      trimmedCount += 1;
    }
  }

  return trimmedCount;
};

const compactApiTraceResponseBodyForModel = (body: unknown): unknown => {
  if (isRecord(body) && isRecord(body.list)) {
    const list = body.list as Record<string, unknown>;
    const entries = Array.isArray(list.entries) ? list.entries : [];
    const entriesPreview = entries.slice(0, MAX_API_TRACE_ENTRIES_PREVIEW).map(item => {
      if (isRecord(item) && isRecord(item.entry)) {
        const e = item.entry as Record<string, unknown>;
        return {
          id: e.id ?? null,
          name: e.name ?? null,
          nodeType: e.nodeType ?? null,
          isFolder: e.isFolder ?? null,
          isFile: e.isFile ?? null,
        };
      }
      return item;
    });

    return {
      list: {
        pagination: list.pagination ?? null,
        returned: entries.length,
        entriesPreview,
      },
    };
  }

  try {
    const serialized = JSON.stringify(body);
    if (serialized.length <= MAX_API_TRACE_RESPONSE_CHARS_FOR_MODEL) {
      return body;
    }
    return {
      omitted: true,
      reason: 'responseBody too large for model context',
      originalSizeChars: serialized.length,
    };
  } catch {
    return {
      omitted: true,
      reason: 'responseBody could not be serialized for model context',
    };
  }
};

const compactToolDataForModel = (data: Record<string, unknown>): Record<string, unknown> => {
  let cloned: Record<string, unknown>;
  try {
    cloned = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return data;
  }

  if (isRecord(cloned.apiTrace) && Object.prototype.hasOwnProperty.call(cloned.apiTrace, 'responseBody')) {
    cloned.apiTrace.responseBody = compactApiTraceResponseBodyForModel(cloned.apiTrace.responseBody);
  }

  return cloned;
};

export class AgentRunEngine {
  constructor(
    private repository: AgentRepository,
    private runtime: ResolvedAiRuntime,
    private execCtx: AgentExecutionContext,
    private signal: AbortSignal
  ) {}

  async execute(input: RunInput): Promise<void> {
    // ── Conversation history → prepended as assistant/user turns ──────────────
    const recentMessages = await this.repository.getRecentMessages(input.chatId, {
      maxItems: 20,
      excludeMessageId: input.triggerMessageId,
    });
    const historyText = formatConversationHistory(recentMessages);

    // ── Resolve @mention nodes for context ────────────────────────────────────
    const mentionContext = await this.resolveMentionContext(input);

    // Update chat title from first message content
    if (input.chatTitle.trim().toLowerCase() === 'new chat') {
      const shortTitle = input.content.slice(0, 60).replace(/[.!?]+$/, '');
      if (shortTitle) {
        await this.repository
          .updateChatTitle(input.userId, input.chatId, shortTitle)
          .catch(() => {});
      }
    }

    // ── Build initial message list ─────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(mentionContext, input.preferredLanguage);
    const tools = getAllToolSchemas();

    // Inject conversation history as a prior assistant message if available
    const messages: AgentMessageParam[] = [];
    if (historyText.trim()) {
      messages.push({ role: 'user', content: '<conversation_history>' });
      messages.push({ role: 'assistant', content: historyText });
    }
    messages.push({ role: 'user', content: input.content });

    // ── Tool-use loop ─────────────────────────────────────────────────────────
    let stepOrdinal = 0;
    const contextWindow = resolveModelContextWindow(this.runtime.model);

    for (let iteration = 0; iteration < MAX_LOOP_STEPS; iteration++) {
      this.checkAborted();

      const iterationIndex = iteration + 1;
      const preCompactionEstimate = estimatePromptTokens(systemPrompt, messages, tools);
      const compaction = this.compactMessagesForContextWindow(
        messages,
        systemPrompt,
        tools,
        contextWindow.tokens
      );
      const effectiveEstimate =
        compaction.applied && compaction.afterPromptTokens > 0
          ? estimatePromptTokens(systemPrompt, messages, tools)
          : preCompactionEstimate;
      const preCallPromptTokens = effectiveEstimate.promptTokens;
      const preCallPromptUtilization = preCallPromptTokens / contextWindow.tokens;

      await this.emitEvent(input.runId, 'run.context', 'info', {
        phase: 'pre_call',
        iteration: iterationIndex,
        provider: this.runtime.provider,
        model: this.runtime.model,
        contextWindowTokens: contextWindow.tokens,
        contextWindowSource: contextWindow.source,
        estimated: {
          systemTokens: effectiveEstimate.systemTokens,
          messagesTokens: effectiveEstimate.messagesTokens,
          toolsTokens: effectiveEstimate.toolsTokens,
          promptTokens: preCallPromptTokens,
        },
        utilizationPctPrompt: toPercent(preCallPromptUtilization * 100),
        nearLimit: preCallPromptUtilization >= CONTEXT_NEAR_LIMIT_RATIO,
        criticalLimit: preCallPromptUtilization >= CONTEXT_CRITICAL_LIMIT_RATIO,
        remainingTokens: Math.max(0, contextWindow.tokens - preCallPromptTokens),
        compaction,
      });

      let response: AgentCallResult;
      try {
        response = await withTimeout(
          callWithTools({
            apiKey: this.runtime.apiKey,
            model: this.runtime.model,
            baseURL: this.runtime.baseURL,
            system: systemPrompt,
            messages,
            tools,
            maxTokens: 2048,
            temperature: this.runtime.temperature,
          }),
          CALL_TIMEOUT_MS,
          `Agent call (iteration ${iterationIndex})`
        );
      } catch (err) {
        await this.emitEvent(input.runId, 'run.context', 'warn', {
          phase: 'call_failed',
          iteration: iterationIndex,
          provider: this.runtime.provider,
          model: this.runtime.model,
          contextWindowTokens: contextWindow.tokens,
          contextWindowSource: contextWindow.source,
          estimated: {
            systemTokens: effectiveEstimate.systemTokens,
            messagesTokens: effectiveEstimate.messagesTokens,
            toolsTokens: effectiveEstimate.toolsTokens,
            promptTokens: preCallPromptTokens,
          },
          utilizationPctPrompt: toPercent(preCallPromptUtilization * 100),
          nearLimit: preCallPromptUtilization >= CONTEXT_NEAR_LIMIT_RATIO,
          criticalLimit: preCallPromptUtilization >= CONTEXT_CRITICAL_LIMIT_RATIO,
          remainingTokens: Math.max(0, contextWindow.tokens - preCallPromptTokens),
          compaction,
          error: toErrorMessage(err),
        });
        log.error({ err, iteration }, 'Model call failed');
        throw err;
      }

      const apiInputTokens = response.usage?.inputTokens ?? null;
      const apiOutputTokens = response.usage?.outputTokens ?? null;
      const promptTokens = apiInputTokens ?? preCallPromptTokens;
      const totalTokens = promptTokens + (apiOutputTokens ?? 0);
      const promptUtilization = promptTokens / contextWindow.tokens;
      const totalUtilization = totalTokens / contextWindow.tokens;

      await this.emitEvent(input.runId, 'run.context', 'info', {
        phase: 'post_call',
        iteration: iterationIndex,
        provider: this.runtime.provider,
        model: this.runtime.model,
        contextWindowTokens: contextWindow.tokens,
        contextWindowSource: contextWindow.source,
        estimated: {
          systemTokens: effectiveEstimate.systemTokens,
          messagesTokens: effectiveEstimate.messagesTokens,
          toolsTokens: effectiveEstimate.toolsTokens,
          promptTokens: preCallPromptTokens,
        },
        usage: response.usage,
        promptTokens,
        outputTokens: apiOutputTokens,
        totalTokens,
        utilizationPctPrompt: toPercent(promptUtilization * 100),
        utilizationPctTotal: toPercent(totalUtilization * 100),
        nearLimit: totalUtilization >= CONTEXT_NEAR_LIMIT_RATIO,
        criticalLimit: totalUtilization >= CONTEXT_CRITICAL_LIMIT_RATIO,
        remainingTokens: Math.max(0, contextWindow.tokens - totalTokens),
        compaction,
      });

      log.info(
        { type: response.type, stopReason: response.stopReason, iteration },
        'Model response'
      );

      // ── Final text answer ──────────────────────────────────────────────────
      if (response.type === 'text') {
        await this.repository.createMessage({
          chatId: input.chatId,
          userId: input.userId,
          role: 'assistant',
          content: response.text,
          mentions: [],
        });
        return;
      }

      // ── Tool calls ─────────────────────────────────────────────────────────
      // The model's full response (text + tool_use blocks) appended as-is
      messages.push({ role: 'assistant', content: response.rawContent });

      const toolResultContents: Array<{
        tool_use_id: string;
        type: 'tool_result';
        content: string;
        is_error?: boolean;
      }> = [];

      for (const call of response.calls) {
        this.checkAborted();

        const tool = getToolByName(call.name);
        const canonicalOperation = resolveToolName(call.name);
        if (!tool) {
          log.warn({ name: call.name }, 'Unknown tool called by model');
          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
            is_error: true,
          });
          continue;
        }

        const confirmationPhrase = tool.confirmation?.phrase ?? 'CONFIRM';
        const autoApproveEnabledForCall = Boolean(
          input.autoApproveConfirmations && tool.requiresConfirmation && confirmationPhrase !== 'DELETE'
        );
        const requiresManualConfirmation = tool.requiresConfirmation && !autoApproveEnabledForCall;

        stepOrdinal += 1;
        const step = await this.repository.createRunStep({
          runId: input.runId,
          ordinal: stepOrdinal,
          operation: canonicalOperation,
          status: requiresManualConfirmation ? 'waiting_confirmation' : 'running',
          summary: `${canonicalOperation}`,
          input: call.args,
          requiresConfirmation: tool.requiresConfirmation,
        });

        // ── Emit description note on first tool call: use LLM's own words ────
        if (stepOrdinal === 1 && response.reasoning?.trim()) {
          await this.emitNote(input.runId, buildDescriptionNote(response.reasoning.trim()));
        }
        // ── Confirmation gate ────────────────────────────────────────────────
        if (requiresManualConfirmation) {
          const token = randomUUID();
          await this.repository.updateRunStep(input.userId, input.runId, step.id, {
            status: 'waiting_confirmation',
            confirmationToken: token,
          });
          await this.repository.updateRun(input.userId, input.runId, {
            status: 'waiting_confirmation',
          });
          await this.emitNote(input.runId, buildConfirmNote(canonicalOperation));
          await this.emitEvent(input.runId, 'step.waiting_confirmation', 'warn', {
            stepId: step.id,
            confirmationToken: token,
            operation: canonicalOperation,
            output: { args: call.args },
          });
          await this.repository.createMessage({
            chatId: input.chatId,
            userId: input.userId,
            role: 'assistant',
            content: `Confirmation required before executing \`${call.name}\`.\nType **${confirmationPhrase}** to proceed.`,
            mentions: [],
          });
          await this.repository.createOperationAudit({
            runId: input.runId,
            stepId: step.id,
            userId: input.userId,
            serverId: input.serverId,
            operation: canonicalOperation,
            action: 'requested',
            targetSummary: canonicalOperation,
            requestMessageId: input.triggerMessageId,
          });
          return; // halts — resumed by AgentService.approveStep
        }

        // ── Execute tool ─────────────────────────────────────────────────────
        await this.emitEvent(input.runId, 'run.executing', 'info', { stepId: step.id });

        const executionStartedAt = Date.now();
        const toolResult = await tool.execute(this.execCtx, call.args);
        const durationMs = Date.now() - executionStartedAt;
        const modelPayload = toolResult.ok
          ? compactToolDataForModel(toolResult.data)
          : { error: toolResult.error };
        let resultStr = JSON.stringify(modelPayload);
        if (resultStr.length > MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL) {
          resultStr = `${resultStr.slice(0, MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL)}\n... [truncated ${resultStr.length - MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL} chars for model context]`;
        }

        if (toolResult.ok) {
          await this.repository.updateRunStep(input.userId, input.runId, step.id, {
            status: 'completed',
            completedAt: new Date(),
            output: toolResult.data,
          });
          await this.emitEvent(input.runId, 'step.completed', 'info', {
            stepId: step.id,
            operation: canonicalOperation,
            status: 'completed',
            durationMs,
            output: toolResult.data,
          });
        } else {
          await this.repository.updateRunStep(input.userId, input.runId, step.id, {
            status: 'failed',
            completedAt: new Date(),
            output: { error: toolResult.error },
          });
          await this.emitEvent(input.runId, 'step.failed', 'error', {
            stepId: step.id,
            operation: canonicalOperation,
            status: 'failed',
            durationMs,
            output: { error: toolResult.error },
            error: toolResult.error,
          });
        }

        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: resultStr,
          ...(toolResult.ok ? {} : { is_error: true }),
        });
      }

      // Append all tool results as a user message, then loop back to model
      messages.push({ role: 'user', content: toolResultContents });
    }

    // Safety: if we hit MAX_LOOP_STEPS, emit a fallback message
    log.warn({ runId: input.runId }, 'Agent hit MAX_LOOP_STEPS without a final answer');
    await this.repository.createMessage({
      chatId: input.chatId,
      userId: input.userId,
      role: 'assistant',
      content:
        'I was unable to complete the request within the step limit. Please try a more specific question.',
      mentions: [],
    });
  }

  private compactMessagesForContextWindow(
    messages: AgentMessageParam[],
    systemPrompt: string,
    tools: AgentToolSchema[],
    contextWindowTokens: number
  ): ContextCompactionResult {
    const beforeEstimate = estimatePromptTokens(systemPrompt, messages, tools);
    const nearThresholdTokens = Math.floor(contextWindowTokens * CONTEXT_NEAR_LIMIT_RATIO);
    const targetTokens = Math.floor(contextWindowTokens * CONTEXT_TARGET_AFTER_COMPACTION_RATIO);

    if (beforeEstimate.promptTokens < nearThresholdTokens) {
      return {
        removedHistoryMessages: 0,
        trimmedToolResultBlocks: 0,
        beforePromptTokens: beforeEstimate.promptTokens,
        afterPromptTokens: beforeEstimate.promptTokens,
        applied: false,
      };
    }

    let removedHistoryMessages = 0;
    const canDropConversationHistoryPair = () =>
      messages.length >= 3 &&
      messages[0]?.role === 'user' &&
      (messages[0] as { content?: unknown }).content === '<conversation_history>' &&
      messages[1]?.role === 'assistant';

    // Always drop injected conversation history first when possible.
    if (canDropConversationHistoryPair()) {
      messages.splice(0, 2);
      removedHistoryMessages += 2;
    }

    let estimate = estimatePromptTokens(systemPrompt, messages, tools);
    while (estimate.promptTokens > targetTokens && messages.length >= 4) {
      // Remove oldest assistant/user pair while keeping the most recent context.
      messages.splice(0, 2);
      removedHistoryMessages += 2;
      estimate = estimatePromptTokens(systemPrompt, messages, tools);
    }

    let trimmedToolResultBlocks = 0;
    if (estimate.promptTokens > targetTokens) {
      trimmedToolResultBlocks = trimHistoricalToolResults(messages);
      estimate = estimatePromptTokens(systemPrompt, messages, tools);
    }

    return {
      removedHistoryMessages,
      trimmedToolResultBlocks,
      beforePromptTokens: beforeEstimate.promptTokens,
      afterPromptTokens: estimate.promptTokens,
      applied: removedHistoryMessages > 0 || trimmedToolResultBlocks > 0,
    };
  }

  // ── Resolve @mention nodes ─────────────────────────────────────────────────

  private async resolveMentionContext(input: RunInput): Promise<string> {
    const nodeMentions = input.mentions.filter(m => m.type === 'node');
    if (!nodeMentions.length) return '';

    const nodesApi = new NodesApi(this.execCtx.api);
    const lines: string[] = [];

    await Promise.allSettled(
      nodeMentions.map(async m => {
        try {
          const result = await nodesApi.getNode(m.id, {
            fields: ['id', 'name', 'path'],
            include: ['path'],
          });
          const e = (result as any)?.entry ?? result;
          lines.push(`${m.id}: ${e?.name ?? m.label} (path: ${e?.path?.name ?? 'unknown'})`);
        } catch {
          lines.push(`${m.id}: ${m.label}`);
        }
      })
    );

    return lines.join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private checkAborted(): void {
    if (this.signal.aborted) throw new Error('Run cancelled');
  }

  private async emitEvent(
    runId: number,
    type: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    extra?: Record<string, unknown>
  ): Promise<void> {
    await emitRunEvent(this.repository, runId, type, level, extra);
  }

  private async emitNote(runId: number, note: ProgressNote): Promise<void> {
    await emitRunEvent(
      this.repository,
      runId,
      note.type,
      'info',
      note.payload as Record<string, unknown>
    );
  }
}
