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
  callAnthropic,
  callWithTools,
  callWithToolsStream,
  type AgentCallResult,
  type AgentMessageParam,
  type AgentToolSchema,
} from '../../ai/anthropic.js';
import { createLogger } from '../../lib/logger.js';
import type { AgentRepository } from '../../repositories/agentRepository.js';
import {
  detokenizeText,
  maskPayload,
  maskString,
  type LlmMaskingConfig,
} from '../ai/maskingEngine.js';
import { getMaskingSettings } from '../ai/maskingSettings.js';
import {
  emitRunEvent,
  formatConversationHistory,
  publishAssistantClear,
  publishAssistantDelta,
  publishAssistantDone,
  publishRunStatus,
  stripHorizontalRules,
} from './agentUtils.js';
import {
  buildChatPresentationPrompt,
  buildFallbackChatTitle,
  CHAT_TITLE_CALL_TIMEOUT_MS,
  CHAT_TITLE_MAX_TOKENS,
  CHAT_TITLE_SYSTEM_PROMPT,
  DEFAULT_CHAT_ICON,
  normalizeChatIcon,
  parseChatPresentationFromModel,
  resolveChatPresentationUpdate,
} from './chatPresentation.js';
import {
  CONTEXT_NEAR_LIMIT_RATIO,
  CONTEXT_CRITICAL_LIMIT_RATIO,
  CONTEXT_TARGET_AFTER_COMPACTION_RATIO,
  estimatePromptTokens,
  resolveModelContextWindow,
  trimHistoricalToolResults,
  type ContextCompactionResult,
} from './contextWindow.js';
import {
  buildAnalyzingNote,
  buildChoosingToolsNote,
  buildComposingAnswerNote,
  buildRunningToolNote,
  buildWaitingConfirmationNote,
  type ProgressNote,
} from './progressMessages.js';
import { buildStepSummary } from './stepSummary.js';
import { buildSystemPrompt } from './systemPrompt.js';
import {
  compactToolDataForModel,
  MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL,
} from './toolResultCompaction.js';
import { getAllToolSchemas, getToolByName, resolveToolName } from './tools/registry.js';
import type { AgentExecutionContext, ResolvedAiRuntime, RunInput } from './types.js';

const log = createLogger('agent.engine');

const MAX_LOOP_STEPS = 8;
const CALL_TIMEOUT_MS = (() => {
  const configured = Number(process.env.AGENT_CALL_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 5_000 && configured <= 300_000) {
    return Math.floor(configured);
  }
  return 60_000;
})();
const DEFAULT_AGENT_MAX_TOKENS = (() => {
  const configured = Number(process.env.AGENT_MAX_TOKENS);
  if (Number.isFinite(configured) && configured >= 512 && configured <= 16_384) {
    return Math.floor(configured);
  }
  return 2048;
})();
const LARGE_TEXT_AGENT_MAX_TOKENS = (() => {
  const configured = Number(process.env.AGENT_LARGE_TEXT_MAX_TOKENS);
  if (
    Number.isFinite(configured) &&
    configured >= DEFAULT_AGENT_MAX_TOKENS &&
    configured <= 16_384
  ) {
    return Math.floor(configured);
  }
  return Math.max(DEFAULT_AGENT_MAX_TOKENS, 8192);
})();
const MAX_STEP_SUMMARY_CHARS = 180;
const SCRIPT_TOOL_NAME = 'script_execute';

const EXPLICIT_SCRIPT_REQUEST_PATTERNS: RegExp[] = [
  /\bscript\b/i,
  /\bjavascript\b/i,
  /\bjs\s*console\b/i,
  /\brun\s+(?:a\s+)?script\b/i,
  /\bexecute\s+(?:a\s+)?script\b/i,
  /\bskript\b/i,
  /\bscript uitvoeren\b/i,
  /\bex[ée]cuter\s+un\s+script\b/i,
  /\bscript ausf[üu]hren\b/i,
];

const EXPLICIT_CONTENT_REQUEST_PATTERNS: RegExp[] = [
  /\b(geef|toon|laat\s+zien|open|lees)\b[\s\S]{0,80}\b(inhoud|content)\b/i,
  /\b(show|display|open|read|get)\b[\s\S]{0,80}\b(content|contents)\b/i,
  /\b(inhoud|file\s+content|file\s+contents)\b/i,
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

const isExplicitContentRequest = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return EXPLICIT_CONTENT_REQUEST_PATTERNS.some(pattern => pattern.test(normalized));
};

const buildDirectNodeContentReply = (
  data: Record<string, unknown>,
  preferredLanguage?: string
): string | null => {
  const isTextBased = data.isTextBased === true;
  const node = isRecord(data.node) ? data.node : null;
  const nodeName = typeof node?.name === 'string' && node.name.trim() ? node.name.trim() : 'file';
  const isDutch = (preferredLanguage ?? '').toLowerCase().startsWith('nl');

  if (!isTextBased) {
    return isDutch
      ? `De inhoud van **${nodeName}** lijkt niet tekst-gebaseerd (binary).`
      : `The content of **${nodeName}** appears to be binary/non-text.`;
  }

  const codeBlock = typeof data.markdownCodeBlock === 'string' ? data.markdownCodeBlock : null;
  if (!codeBlock) {
    return null;
  }

  const hasMoreContent = data.hasMoreContent === true;
  const startChar =
    typeof data.startChar === 'number' && Number.isFinite(data.startChar) ? data.startChar : 0;
  const endCharExclusive =
    typeof data.endCharExclusive === 'number' && Number.isFinite(data.endCharExclusive)
      ? data.endCharExclusive
      : null;
  const totalChars =
    typeof data.totalChars === 'number' && Number.isFinite(data.totalChars)
      ? data.totalChars
      : null;

  if (!hasMoreContent) {
    return isDutch
      ? `Hier is de inhoud van **${nodeName}**:\n\n${codeBlock}`
      : `Here is the content of **${nodeName}**:\n\n${codeBlock}`;
  }

  const rangeText =
    endCharExclusive !== null && totalChars !== null
      ? `${startChar + 1}-${endCharExclusive} / ${totalChars}`
      : null;

  const continuation = isDutch
    ? rangeText
      ? `Dit is een deelweergave (${rangeText}). Vraag om het volgende deel om verder te gaan.`
      : 'Dit is een deelweergave. Vraag om het volgende deel om verder te gaan.'
    : rangeText
      ? `This is a partial view (${rangeText}). Ask for the next part to continue.`
      : 'This is a partial view. Ask for the next part to continue.';

  return isDutch
    ? `Hier is (een deel van) de inhoud van **${nodeName}**.\n\n${continuation}\n\n${codeBlock}`
    : `Here is (part of) the content of **${nodeName}**.\n\n${continuation}\n\n${codeBlock}`;
};

const isExplicitScriptExecutionRequested = (content: string): boolean => {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }
  return EXPLICIT_SCRIPT_REQUEST_PATTERNS.some(pattern => pattern.test(normalized));
};

const toPercent = (value: number): number => Math.max(0, Math.round(value * 10) / 10);

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

    await this.maybeGenerateInitialChatPresentation(input, recentMessages.length > 0);

    // ── Build initial message list ─────────────────────────────────────────────
    const systemPrompt = await buildSystemPrompt(mentionContext, input.preferredLanguage);
    const allTools = getAllToolSchemas();
    const allowScriptExecution = isExplicitScriptExecutionRequested(input.content);
    const tools = allowScriptExecution
      ? allTools
      : allTools.filter(schema => resolveToolName(schema.name) !== SCRIPT_TOOL_NAME);

    // Inject conversation history as a prior assistant message if available
    const messages: AgentMessageParam[] = [];
    if (historyText.trim()) {
      messages.push({ role: 'user', content: '<conversation_history>' });
      messages.push({ role: 'assistant', content: historyText });
    }
    messages.push({ role: 'user', content: input.content });

    // ── Tool-use loop ─────────────────────────────────────────────────────────
    let stepOrdinal = await this.repository.getMaxRunStepOrdinal(input.runId);
    const contextWindow = resolveModelContextWindow(this.runtime.model);
    let nextCallMaxTokens = DEFAULT_AGENT_MAX_TOKENS;

    // ── Load masking config once for the run ────────────────────────────────
    let maskingConfig: LlmMaskingConfig | null = null;
    try {
      maskingConfig = await getMaskingSettings(input.userId);
      if (!maskingConfig.enabled) maskingConfig = null;
    } catch {
      // Masking unavailable — proceed unmasked
    }
    const maskingTokenMap = maskingConfig?.mode === 'tokenize' ? new Map<string, string>() : null;

    let emittedAnalyzingNote = false;

    for (let iteration = 0; iteration < MAX_LOOP_STEPS; iteration++) {
      this.checkAborted();

      const iterationIndex = iteration + 1;
      if (!emittedAnalyzingNote) {
        await this.emitNote(input.runId, buildAnalyzingNote(input.preferredLanguage));
        emittedAnalyzingNote = true;
      }
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
        // ── Apply masking to outbound payload ──────────────────────────────
        let maskedSystem = systemPrompt;
        let maskedMessages = messages;
        if (maskingConfig) {
          maskedSystem = maskString(systemPrompt, maskingConfig).masked;
          const { masked } = maskPayload(messages, maskingConfig, {
            tokenMap: maskingTokenMap ?? undefined,
          });
          maskedMessages = masked as AgentMessageParam[];
        }

        let streamAssistantText = true;
        let composingNoteEmitted = false;
        const invokeModel = async (): Promise<AgentCallResult> => {
          try {
            return await callWithToolsStream({
              apiKey: this.runtime.apiKey,
              model: this.runtime.model,
              baseURL: this.runtime.baseURL,
              system: maskedSystem,
              messages: maskedMessages,
              tools,
              maxTokens: nextCallMaxTokens,
              temperature: this.runtime.temperature,
              onTextDelta: delta => {
                if (!composingNoteEmitted) {
                  composingNoteEmitted = true;
                  void this.emitNote(
                    input.runId,
                    buildComposingAnswerNote(input.preferredLanguage)
                  );
                }
                if (streamAssistantText) {
                  publishAssistantDelta(input.runId, delta);
                }
              },
              onToolUseStarted: () => {
                streamAssistantText = false;
                publishAssistantClear(input.runId);
              },
            });
          } catch (streamError) {
            log.warn(
              { err: streamError, iteration: iterationIndex },
              'Streaming call failed; falling back'
            );
            return callWithTools({
              apiKey: this.runtime.apiKey,
              model: this.runtime.model,
              baseURL: this.runtime.baseURL,
              system: maskedSystem,
              messages: maskedMessages,
              tools,
              maxTokens: nextCallMaxTokens,
              temperature: this.runtime.temperature,
            });
          }
        };

        response = await withTimeout(
          invokeModel(),
          CALL_TIMEOUT_MS,
          `Agent call (iteration ${iterationIndex})`
        );
        if (response.type === 'tool_calls') {
          publishAssistantClear(input.runId);
        }
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
        const detokenizedText = maskingTokenMap
          ? detokenizeText(response.text, maskingTokenMap)
          : response.text;
        const sanitizedText = stripHorizontalRules(detokenizedText);
        const message = await this.repository.createMessage({
          chatId: input.chatId,
          userId: input.userId,
          role: 'assistant',
          content: sanitizedText,
          mentions: [],
        });
        publishAssistantDone(input.runId, {
          messageId: message.id,
          content: sanitizedText,
          stopReason: response.stopReason,
        });
        return;
      }

      // ── Tool calls ─────────────────────────────────────────────────────────
      const detokenizedReasoning =
        maskingTokenMap && response.reasoning
          ? detokenizeText(response.reasoning, maskingTokenMap)
          : response.reasoning;
      const rawContentForHistory = maskingTokenMap
        ? response.rawContent.map(block =>
            block.type === 'text'
              ? { ...block, text: detokenizeText(block.text, maskingTokenMap) }
              : block
          )
        : response.rawContent;

      // The model's full response (text + tool_use blocks) appended as-is
      messages.push({ role: 'assistant', content: rawContentForHistory });

      const toolResultContents: Array<{
        tool_use_id: string;
        type: 'tool_result';
        content: string;
        is_error?: boolean;
      }> = [];
      let shouldBoostNextCallMaxTokens = false;
      let directNodeContentReply: string | null = null;

      for (const [callIndex, call] of response.calls.entries()) {
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

        const scriptExecutionBlocked =
          canonicalOperation === SCRIPT_TOOL_NAME && !allowScriptExecution;
        if (scriptExecutionBlocked) {
          const blockedMessage =
            'Script execution is blocked unless the user explicitly asks to execute a script.';
          const stepSummary = buildStepSummary({
            operation: canonicalOperation,
            args: call.args,
            reasoning: detokenizedReasoning,
            callIndex,
            totalCalls: response.calls.length,
          });

          stepOrdinal += 1;
          const step = await this.repository.createRunStep({
            runId: input.runId,
            ordinal: stepOrdinal,
            operation: canonicalOperation,
            status: 'failed',
            summary: stepSummary,
            input: call.args,
            requiresConfirmation: tool.requiresConfirmation,
            completedAt: new Date(),
            output: {
              error: blockedMessage,
              policy: 'script_execute_requires_explicit_user_request',
            },
          });

          await this.emitEvent(input.runId, 'step.failed', 'warn', {
            stepId: step.id,
            operation: canonicalOperation,
            status: 'failed',
            output: { error: blockedMessage },
            error: blockedMessage,
          });

          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ error: blockedMessage }),
            is_error: true,
          });
          continue;
        }

        const autoApproveEnabledForCall = Boolean(
          input.autoApproveConfirmations && tool.requiresConfirmation
        );
        const requiresManualConfirmation = tool.requiresConfirmation && !autoApproveEnabledForCall;
        const stepSummary = buildStepSummary({
          operation: canonicalOperation,
          args: call.args,
          reasoning: detokenizedReasoning,
          callIndex,
          totalCalls: response.calls.length,
        });

        stepOrdinal += 1;
        const step = await this.repository.createRunStep({
          runId: input.runId,
          ordinal: stepOrdinal,
          operation: canonicalOperation,
          status: requiresManualConfirmation ? 'waiting_confirmation' : 'running',
          summary: stepSummary,
          input: call.args,
          requiresConfirmation: tool.requiresConfirmation,
        });

        if (callIndex === 0) {
          await this.emitNote(
            input.runId,
            buildChoosingToolsNote(response.calls.length, input.preferredLanguage)
          );
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
          await this.emitEvent(input.runId, 'step.waiting_confirmation', 'warn', {
            stepId: step.id,
            confirmationToken: token,
            operation: canonicalOperation,
            summary: stepSummary,
            output: { args: call.args },
          });
          await this.emitNote(
            input.runId,
            buildWaitingConfirmationNote(stepSummary, input.preferredLanguage)
          );
          publishAssistantClear(input.runId);
          await this.broadcastRunStatus(input.userId, input.runId);
          await this.repository.createOperationAudit({
            runId: input.runId,
            stepId: step.id,
            userId: input.userId,
            serverId: input.serverId,
            operation: canonicalOperation,
            action: 'requested',
            targetSummary: stepSummary,
            requestMessageId: input.triggerMessageId,
          });
          return; // halts — resumed by AgentService.approveStep
        }

        // ── Execute tool ─────────────────────────────────────────────────────
        await this.emitEvent(input.runId, 'step.started', 'info', {
          stepId: step.id,
          operation: canonicalOperation,
          summary: stepSummary,
        });
        await this.emitNote(
          input.runId,
          buildRunningToolNote(canonicalOperation, stepSummary, input.preferredLanguage)
        );
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
          if (canonicalOperation === 'node_get_content' && toolResult.data.isTextBased === true) {
            shouldBoostNextCallMaxTokens = true;
          }
          if (
            canonicalOperation === 'node_get_content' &&
            isExplicitContentRequest(input.content) &&
            !directNodeContentReply
          ) {
            directNodeContentReply = buildDirectNodeContentReply(
              toolResult.data,
              input.preferredLanguage
            );
          }
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

      if (directNodeContentReply) {
        const message = await this.repository.createMessage({
          chatId: input.chatId,
          userId: input.userId,
          role: 'assistant',
          content: directNodeContentReply,
          mentions: [],
        });
        publishAssistantDone(input.runId, {
          messageId: message.id,
          content: directNodeContentReply,
          stopReason: 'direct_content',
        });
        return;
      }

      // Append all tool results as a user message, then loop back to model
      messages.push({ role: 'user', content: toolResultContents });
      nextCallMaxTokens = shouldBoostNextCallMaxTokens
        ? LARGE_TEXT_AGENT_MAX_TOKENS
        : DEFAULT_AGENT_MAX_TOKENS;
    }

    // Safety: if we hit MAX_LOOP_STEPS, emit a fallback message
    log.warn({ runId: input.runId }, 'Agent hit MAX_LOOP_STEPS without a final answer');
    const fallbackMessage = await this.repository.createMessage({
      chatId: input.chatId,
      userId: input.userId,
      role: 'assistant',
      content:
        'I was unable to complete the request within the step limit. Please try a more specific question.',
      mentions: [],
    });
    publishAssistantDone(input.runId, {
      messageId: fallbackMessage.id,
      content: fallbackMessage.content,
      stopReason: 'max_steps',
    });
  }

  private async maybeGenerateInitialChatPresentation(
    input: RunInput,
    hasHistory: boolean
  ): Promise<void> {
    const updateFlags = resolveChatPresentationUpdate({
      existingTitle: input.chatTitle,
      existingIcon: input.chatIcon,
      content: input.content,
      hasHistory,
    });

    if (!updateFlags.shouldUpdateTitle && !updateFlags.shouldUpdateIcon) {
      return;
    }

    let nextTitle = buildFallbackChatTitle(input.content);
    let nextChatIcon = DEFAULT_CHAT_ICON;

    try {
      const generated = await withTimeout(
        callAnthropic({
          apiKey: this.runtime.apiKey,
          model: this.runtime.model,
          baseURL: this.runtime.baseURL,
          system: CHAT_TITLE_SYSTEM_PROMPT,
          prompt: buildChatPresentationPrompt(input.content, input.preferredLanguage),
          maxTokens: CHAT_TITLE_MAX_TOKENS,
          temperature: 0,
        }),
        CHAT_TITLE_CALL_TIMEOUT_MS,
        'chat presentation generation'
      );
      const parsed = parseChatPresentationFromModel(generated, input.content);
      nextTitle = parsed.title;
      nextChatIcon = parsed.chatIcon;
    } catch (error) {
      log.debug(
        { err: toErrorMessage(error), chatId: input.chatId, runId: input.runId },
        'Chat presentation generation failed; falling back to defaults'
      );
    }

    const updates: { title?: string; chatIcon?: string } = {};
    if (updateFlags.shouldUpdateTitle && nextTitle) {
      updates.title = nextTitle;
    }
    if (updateFlags.shouldUpdateIcon) {
      updates.chatIcon = nextChatIcon || DEFAULT_CHAT_ICON;
    }
    if (!updates.title && !updates.chatIcon) {
      return;
    }

    await this.repository
      .updateChatPresentation(input.userId, input.chatId, updates)
      .catch(() => {});
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

  private async broadcastRunStatus(userId: number, runId: number): Promise<void> {
    const summary = await this.repository.getRunSummary(userId, runId);
    if (summary) {
      publishRunStatus(runId, summary);
    }
  }
}
