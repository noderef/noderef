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

import Anthropic from '@anthropic-ai/sdk';
import type { AiInputImage, AiListedModel } from './types.js';

const LICENSE_HEADER = '';
void LICENSE_HEADER;

export interface AnthropicRequest {
  apiKey: string;
  model: string;
  prompt: string;
  system?: string;
  prefill?: string;
  maxTokens?: number;
  temperature?: number;
  baseURL?: string;
  images?: AiInputImage[];
}

export async function callAnthropic({
  apiKey,
  model,
  prompt,
  system,
  prefill,
  maxTokens = 1024,
  temperature = 0,
  baseURL,
  images = [],
}: AnthropicRequest): Promise<string> {
  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  const content = [
    { type: 'text' as const, text: prompt },
    ...images.map(image => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mediaType,
        data: image.data,
      },
    })),
  ];

  const supportsPrefill = modelSupportsAnthropicPrefill(model);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];

  if (prefill && supportsPrefill) {
    messages.push({ role: 'assistant', content: prefill });
  }

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages,
  });

  const text = response.content
    .map(item => ('text' in item ? item.text : ''))
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Empty response from Anthropic');
  }

  return prefill && supportsPrefill ? prefill + text : text;
}

// ── Native tool-use API ───────────────────────────────────────────────────────

export interface AgentToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentUsageMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

export type AgentCallResult =
  | { type: 'text'; text: string; stopReason: string; usage: AgentUsageMetrics | null }
  | {
      type: 'tool_calls';
      calls: AgentToolCall[];
      reasoning: string | null;
      rawContent: Anthropic.ContentBlock[];
      stopReason: string;
      usage: AgentUsageMetrics | null;
    };

export type AgentMessageParam = Anthropic.MessageParam;

/**
 * Call the model with native tool_use support.
 * Works with both Anthropic and MiniMax (Anthropic-compatible endpoint).
 * Returns either a final text answer or the tool calls the model wants to make.
 */
export async function callWithTools({
  apiKey,
  model,
  baseURL,
  system,
  messages,
  tools,
  maxTokens = 1024,
  temperature = 0,
}: {
  apiKey: string;
  model: string;
  baseURL?: string;
  system: string;
  messages: AgentMessageParam[];
  tools: AgentToolSchema[];
  maxTokens?: number;
  temperature?: number;
}): Promise<AgentCallResult> {
  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages,
    tools: tools as Anthropic.Tool[],
  } as any);
  const usageRaw = (response as any)?.usage as
    | {
        input_tokens?: unknown;
        output_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
      }
    | undefined;
  const usage: AgentUsageMetrics | null = usageRaw
    ? {
        inputTokens: typeof usageRaw.input_tokens === 'number' ? usageRaw.input_tokens : null,
        outputTokens: typeof usageRaw.output_tokens === 'number' ? usageRaw.output_tokens : null,
        cacheCreationInputTokens:
          typeof usageRaw.cache_creation_input_tokens === 'number'
            ? usageRaw.cache_creation_input_tokens
            : null,
        cacheReadInputTokens:
          typeof usageRaw.cache_read_input_tokens === 'number'
            ? usageRaw.cache_read_input_tokens
            : null,
      }
    : null;

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
  const toolBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  );

  if (toolBlocks.length > 0) {
    const reasoning =
      textBlocks.length > 0
        ? textBlocks
            .map(b => b.text)
            .join('\n')
            .trim()
        : null;
    return {
      type: 'tool_calls',
      stopReason: response.stop_reason ?? 'tool_use',
      reasoning,
      rawContent: response.content,
      usage,
      calls: toolBlocks.map(b => ({
        id: b.id,
        name: b.name,
        args: (b.input as Record<string, unknown>) ?? {},
      })),
    };
  }

  const text = textBlocks
    .map(b => b.text)
    .join('\n')
    .trim();
  return {
    type: 'text',
    text: text || '(no response)',
    stopReason: response.stop_reason ?? 'end_turn',
    usage,
  };
}

export interface CallWithToolsStreamOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
  system: string;
  messages: AgentMessageParam[];
  tools: AgentToolSchema[];
  maxTokens?: number;
  temperature?: number;
  onTextDelta?: (delta: string) => void;
  onToolUseStarted?: () => void;
}

/**
 * Stream a tool-capable model call, accumulating the same result shape as callWithTools.
 */
export async function callWithToolsStream({
  apiKey,
  model,
  baseURL,
  system,
  messages,
  tools,
  maxTokens = 1024,
  temperature = 0,
  onTextDelta,
  onToolUseStarted,
}: CallWithToolsStreamOptions): Promise<AgentCallResult> {
  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages,
    tools: tools as Anthropic.Tool[],
  } as any);

  let toolUseNotified = false;
  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      const block = (event as { content_block?: { type?: string } }).content_block;
      if (block?.type === 'tool_use') {
        if (!toolUseNotified) {
          toolUseNotified = true;
          onToolUseStarted?.();
        }
      }
    }
    if (event.type === 'content_block_delta') {
      const delta = (event as { delta?: { type?: string; text?: string } }).delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        onTextDelta?.(delta.text);
      }
    }
  }

  const response = await stream.finalMessage();
  const usageRaw = (response as any)?.usage as
    | {
        input_tokens?: unknown;
        output_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
      }
    | undefined;
  const usage: AgentUsageMetrics | null = usageRaw
    ? {
        inputTokens: typeof usageRaw.input_tokens === 'number' ? usageRaw.input_tokens : null,
        outputTokens: typeof usageRaw.output_tokens === 'number' ? usageRaw.output_tokens : null,
        cacheCreationInputTokens:
          typeof usageRaw.cache_creation_input_tokens === 'number'
            ? usageRaw.cache_creation_input_tokens
            : null,
        cacheReadInputTokens:
          typeof usageRaw.cache_read_input_tokens === 'number'
            ? usageRaw.cache_read_input_tokens
            : null,
      }
    : null;

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
  const toolBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  );

  if (toolBlocks.length > 0) {
    const reasoning =
      textBlocks.length > 0
        ? textBlocks
            .map(b => b.text)
            .join('\n')
            .trim()
        : null;
    return {
      type: 'tool_calls',
      stopReason: response.stop_reason ?? 'tool_use',
      reasoning,
      rawContent: response.content,
      usage,
      calls: toolBlocks.map(b => ({
        id: b.id,
        name: b.name,
        args: (b.input as Record<string, unknown>) ?? {},
      })),
    };
  }

  const text = textBlocks
    .map(b => b.text)
    .join('\n')
    .trim();
  return {
    type: 'text',
    text: text || '(no response)',
    stopReason: response.stop_reason ?? 'end_turn',
    usage,
  };
}

/**
 * Build the assistant turn that includes both tool_use blocks and text (if any).
 * Used when appending the model's tool-call turn to the message history.
 */
function buildAssistantToolCallTurn(
  result: Extract<AgentCallResult, { type: 'tool_calls' }>,
  rawContent: Anthropic.ContentBlock[]
): AgentMessageParam {
  return { role: 'assistant', content: rawContent };
}

/**
 * Build the user turn that contains tool_result blocks.
 */
function buildToolResultTurn(
  results: Array<{ id: string; content: string; isError?: boolean }>
): AgentMessageParam {
  return {
    role: 'user',
    content: results.map(r => ({
      type: 'tool_result' as const,
      tool_use_id: r.id,
      content: r.content,
      ...(r.isError ? { is_error: true } : {}),
    })),
  };
}

export async function listAnthropicModels({
  apiKey,
  baseURL,
}: {
  apiKey: string;
  baseURL?: string;
}): Promise<AiListedModel[]> {
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const response = await client.models.list();
  return response.data.map(model => ({
    id: model.id,
    displayName: (model as any).display_name ?? null,
    createdAt: model.created_at ?? null,
    capabilities: ['text'],
  }));
}

/** Native Anthropic IDs and OpenRouter slugs such as `anthropic/claude-3.5-sonnet`. */
function modelSupportsAnthropicPrefill(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const modelName = normalized.includes('/')
    ? (normalized.split('/').pop() ?? normalized)
    : normalized;
  return modelName.startsWith('claude');
}
