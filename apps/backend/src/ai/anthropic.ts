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

  const supportsPrefill = model.startsWith('claude');

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

export type AgentCallResult =
  | { type: 'text'; text: string; stopReason: string }
  | {
      type: 'tool_calls';
      calls: AgentToolCall[];
      reasoning: string | null;
      rawContent: Anthropic.ContentBlock[];
      stopReason: string;
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
  };
}

/**
 * Build the assistant turn that includes both tool_use blocks and text (if any).
 * Used when appending the model's tool-call turn to the message history.
 */
export function buildAssistantToolCallTurn(
  result: Extract<AgentCallResult, { type: 'tool_calls' }>,
  rawContent: Anthropic.ContentBlock[]
): AgentMessageParam {
  return { role: 'assistant', content: rawContent };
}

/**
 * Build the user turn that contains tool_result blocks.
 */
export function buildToolResultTurn(
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
