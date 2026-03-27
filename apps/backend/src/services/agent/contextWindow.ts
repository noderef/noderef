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
 * Context-window estimation, compaction helpers, and related types.
 *
 * Pure functions — no I/O, no class state. Used by AgentRunEngine to
 * decide when/how to shrink conversation history before model calls.
 */

import type { AgentMessageParam, AgentToolSchema } from '../../ai/anthropic.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const AVG_CHARS_PER_TOKEN = 4;
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
export const CONTEXT_NEAR_LIMIT_RATIO = 0.85;
export const CONTEXT_CRITICAL_LIMIT_RATIO = 0.95;
export const CONTEXT_TARGET_AFTER_COMPACTION_RATIO = 0.75;
export const MAX_COMPACTED_TOOL_RESULT_CHARS = 3_000;

export const KNOWN_MODEL_CONTEXT_WINDOWS: Array<{ pattern: RegExp; tokens: number }> = [
  { pattern: /claude/i, tokens: 200_000 },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextWindowResolution {
  tokens: number;
  source: 'known' | 'default';
}

export interface ContextTokenEstimate {
  systemTokens: number;
  messagesTokens: number;
  toolsTokens: number;
  promptTokens: number;
}

export interface ContextCompactionResult {
  removedHistoryMessages: number;
  trimmedToolResultBlocks: number;
  beforePromptTokens: number;
  afterPromptTokens: number;
  applied: boolean;
}

// ── Functions ────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const toTokenEstimate = (text: string): number =>
  Math.ceil(Math.max(text.length, 1) / AVG_CHARS_PER_TOKEN);

export const resolveModelContextWindow = (model: string): ContextWindowResolution => {
  for (const candidate of KNOWN_MODEL_CONTEXT_WINDOWS) {
    if (candidate.pattern.test(model)) {
      return { tokens: candidate.tokens, source: 'known' };
    }
  }
  return { tokens: DEFAULT_CONTEXT_WINDOW_TOKENS, source: 'default' };
};

export const estimateMessageContentTokens = (content: unknown): number => {
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

export const estimatePromptTokens = (
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

export const trimHistoricalToolResults = (messages: AgentMessageParam[]): number => {
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
