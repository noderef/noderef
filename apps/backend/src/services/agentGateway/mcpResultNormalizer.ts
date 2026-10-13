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

import type { CallToolResult } from '@modelcontextprotocol/client';
import type { ToolResult } from '../agent/tools/types.js';
import { MAX_ERROR_TEXT_CHARS, MAX_PROMPT_TEXT_CHARS, MAX_RESOURCE_TEXT_CHARS } from './types.js';

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, max), truncated: true };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contentToData(content: unknown[]): Record<string, unknown> {
  const parts: unknown[] = [];
  for (const raw of content) {
    const block = asRecord(raw);
    if (!block) continue;
    const type = block.type;
    if (type === 'text' && typeof block.text === 'string') {
      if (content.length === 1) {
        try {
          const parsed = JSON.parse(block.text) as unknown;
          const record = asRecord(parsed);
          if (record) return record;
          return { text: block.text, value: parsed };
        } catch {
          return { text: block.text };
        }
      }
      parts.push({ type: 'text', text: block.text });
      continue;
    }
    if (type === 'image' || type === 'audio') {
      const data = typeof block.data === 'string' ? block.data : '';
      parts.push({
        type,
        mimeType: block.mimeType ?? null,
        omitted: true,
        bytes: Math.floor((data.length * 3) / 4),
      });
      continue;
    }
    if (type === 'resource_link') {
      parts.push({
        type,
        uri: block.uri ?? null,
        name: block.name ?? null,
        mimeType: block.mimeType ?? null,
      });
      continue;
    }
    if (type === 'resource') {
      const resource = asRecord(block.resource) ?? block;
      if (typeof resource.text === 'string') {
        const clipped = truncate(resource.text, MAX_RESOURCE_TEXT_CHARS);
        parts.push({
          type,
          uri: resource.uri ?? null,
          mimeType: resource.mimeType ?? null,
          text: clipped.text,
          truncated: clipped.truncated,
        });
      } else {
        parts.push({
          type,
          uri: resource.uri ?? null,
          mimeType: resource.mimeType ?? null,
          blobOmitted: true,
        });
      }
    }
  }
  return { content: parts };
}

export function normalizeMcpToolResult(toolName: string, result: CallToolResult): ToolResult {
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content
          .map(block => ('text' in block && typeof block.text === 'string' ? block.text : ''))
          .filter(Boolean)
          .join('\n')
      : 'Agent Gateway tool returned an error';
    return { ok: false, error: truncate(text || 'Agent Gateway tool returned an error', MAX_ERROR_TEXT_CHARS).text };
  }

  let data: Record<string, unknown>;
  if (result.structuredContent !== undefined) {
    const record = asRecord(result.structuredContent);
    data = record ?? { value: result.structuredContent };
  } else {
    data = contentToData(Array.isArray(result.content) ? result.content : []);
  }

  return {
    ok: true,
    data: {
      source: 'agent_gateway',
      tool: toolName,
      untrusted: true,
      ...data,
    },
  };
}

export function promptMessagesToText(messages: unknown[]): { text: string; truncated: boolean } {
  const lines: string[] = [];
  for (const raw of messages) {
    const message = asRecord(raw);
    if (!message) continue;
    const role = typeof message.role === 'string' ? message.role : 'user';
    const contents = Array.isArray(message.content) ? message.content : [message.content];
    const bits: string[] = [];
    for (const content of contents) {
      if (typeof content === 'string') {
        bits.push(content);
        continue;
      }
      const block = asRecord(content);
      if (!block) continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        bits.push(block.text);
      } else if (block.type === 'image' || block.type === 'audio') {
        bits.push(`[${String(block.type)} omitted]`);
      } else if (block.type === 'resource') {
        const resource = asRecord(block.resource) ?? block;
        if (typeof resource.text === 'string') {
          bits.push(truncate(resource.text, 4000).text);
        } else {
          bits.push('[embedded resource omitted]');
        }
      }
    }
    const body = bits.join('\n').trim();
    if (!body) continue;
    lines.push(messages.length > 1 ? `${role}:\n${body}` : body);
  }
  return truncate(lines.join('\n\n'), MAX_PROMPT_TEXT_CHARS);
}

export function resourceContentsToText(contents: unknown[]): {
  text: string;
  mimeType: string | null;
  truncated: boolean;
} {
  const texts: string[] = [];
  let mimeType: string | null = null;
  for (const raw of contents) {
    const block = asRecord(raw);
    if (!block) continue;
    if (typeof block.mimeType === 'string' && !mimeType) {
      mimeType = block.mimeType;
    }
    if (typeof block.text === 'string') {
      texts.push(block.text);
    } else if (block.blob) {
      texts.push('[binary resource omitted]');
    }
  }
  const clipped = truncate(texts.join('\n'), MAX_RESOURCE_TEXT_CHARS);
  return { ...clipped, mimeType };
}
