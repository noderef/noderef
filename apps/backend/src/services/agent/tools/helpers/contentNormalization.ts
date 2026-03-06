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

const CONTENT_CANDIDATE_KEYS = ['content', 'text', 'value', 'body', 'data', 'payload', 'lines'];

export interface NormalizedContent {
  content: string;
  sourceType: string;
  transformed: boolean;
}

export interface ContentCandidate {
  value: unknown;
  sourceType: string;
}

function stripMarkdownFence(raw: string): string {
  const match = raw.match(/^\s*```(?:[\w.+-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  return match ? match[1] : raw;
}

function stringifyLossless(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function normalizeContentArg(
  raw: unknown,
  sourceType = 'content',
  depth = 0
): NormalizedContent | null {
  if (depth > 5 || raw === undefined || raw === null) {
    return null;
  }

  if (typeof raw === 'string') {
    const stripped = stripMarkdownFence(raw);
    return {
      content: stripped,
      sourceType,
      transformed: stripped !== raw || sourceType !== 'content',
    };
  }

  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') {
    return { content: String(raw), sourceType, transformed: true };
  }

  if (Array.isArray(raw)) {
    const lines = raw.map(item => {
      const normalized = normalizeContentArg(item, `${sourceType}.item`, depth + 1);
      if (normalized) {
        return normalized.content;
      }
      return stringifyLossless(item);
    });
    return { content: lines.join('\n'), sourceType, transformed: true };
  }

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;

    if (record.type === 'Buffer' && Array.isArray(record.data)) {
      const bytes = record.data.filter(value => typeof value === 'number');
      return {
        content: Buffer.from(bytes).toString('utf8'),
        sourceType: `${sourceType}.buffer`,
        transformed: true,
      };
    }

    for (const key of CONTENT_CANDIDATE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      const nested = normalizeContentArg(record[key], `${sourceType}.${key}`, depth + 1);
      if (nested) {
        return { ...nested, transformed: true };
      }
    }

    return {
      content: stringifyLossless(record),
      sourceType,
      transformed: true,
    };
  }

  return null;
}

export function extractContentCandidate(args: Record<string, unknown>): ContentCandidate | null {
  if (Object.prototype.hasOwnProperty.call(args, 'content')) {
    return { value: args.content, sourceType: 'content' };
  }

  for (const key of CONTENT_CANDIDATE_KEYS) {
    if (key === 'content') {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      return { value: args[key], sourceType: key };
    }
  }

  return null;
}

export function buildContentRequestPreview(
  content: string,
  maxChars: number
): Record<string, unknown> {
  if (content.length <= maxChars) {
    return { content, chars: content.length, truncated: false };
  }
  return {
    contentPreview: content.slice(0, maxChars),
    chars: content.length,
    truncated: true,
    truncatedChars: content.length - maxChars,
  };
}
