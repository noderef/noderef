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
import { callWithTools, type AgentCallResult, type AgentMessageParam } from '../../ai/anthropic.js';
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

    for (let iteration = 0; iteration < MAX_LOOP_STEPS; iteration++) {
      this.checkAborted();

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
          `Agent call (iteration ${iteration + 1})`
        );
      } catch (err) {
        log.error({ err, iteration }, 'Model call failed');
        throw err;
      }

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

        stepOrdinal += 1;
        const step = await this.repository.createRunStep({
          runId: input.runId,
          ordinal: stepOrdinal,
          operation: canonicalOperation,
          status: tool.requiresConfirmation ? 'waiting_confirmation' : 'running',
          summary: `${canonicalOperation}`,
          input: call.args,
          requiresConfirmation: tool.requiresConfirmation,
        });

        // ── Emit description note on first tool call: use LLM's own words ────
        if (stepOrdinal === 1 && response.reasoning?.trim()) {
          await this.emitNote(input.runId, buildDescriptionNote(response.reasoning.trim()));
        }
        // ── Confirmation gate ────────────────────────────────────────────────
        if (tool.requiresConfirmation) {
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
          const phrase = tool.confirmation?.phrase ?? 'CONFIRM';
          await this.repository.createMessage({
            chatId: input.chatId,
            userId: input.userId,
            role: 'assistant',
            content: `Confirmation required before executing \`${call.name}\`.\nType **${phrase}** to proceed.`,
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
