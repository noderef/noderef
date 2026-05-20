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
 * Shared parser for the script-generation DSL produced by the AI router and
 * the `script_create` agent tool. The model is asked to emit:
 *
 *   <changes>
 *     {"type":"replace_selection","code":"...escaped JavaScript..."}
 *   </changes>
 *
 * In practice the model sometimes drops the wrapper or returns plain code,
 * so this module accepts several relaxed shapes (fenced code blocks, inline
 * JavaScript without any markup, partial JSON) before giving up.
 */

import { extractJsonFromModel } from './extractJsonFromModel.js';

export type DslChangeType = 'replace_selection' | 'replace_file';

export interface DslResponse {
  type: DslChangeType;
  code: string;
}

export type DslParseErrorCode = 'AI_DSL_MISSING' | 'AI_DSL_INVALID';

export class DslParseError extends Error {
  constructor(
    readonly code: DslParseErrorCode,
    message: string
  ) {
    super(message);
  }
}

const VALID_DSL_TYPES: ReadonlySet<DslChangeType> = new Set(['replace_selection', 'replace_file']);

/**
 * Parse a raw model response into a DSL change. Tries (in order):
 *  1. JSON object inside a `<changes>...</changes>` block.
 *  2. JSON object anywhere in the response.
 *  3. Regex recovery from partial DSL-like text.
 *  4. A fenced ```javascript ... ``` code block (treated as `replace_selection`).
 *  5. Inline JavaScript that fills most of the response (no wrapper at all).
 */
export function parseDslResponse(raw: string): DslResponse {
  const wrapperMatch = raw.match(/<changes>([\s\S]*?)<\/changes>/i);
  const candidates = [wrapperMatch?.[1], raw].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    const fromJson = tryParseDslJson(extractJsonFromModel(candidate.trim(), 'object'));
    if (fromJson) {
      return fromJson;
    }
    const recovered = tryRecoverDslLikePayload(candidate);
    if (recovered) {
      return recovered;
    }
  }

  if (!wrapperMatch) {
    const fencedCode = extractCodeFence(raw);
    if (fencedCode) {
      return { type: 'replace_selection', code: fencedCode };
    }
    const inlineCode = extractInlineJsCode(raw);
    if (inlineCode) {
      return { type: 'replace_selection', code: inlineCode };
    }
    throw new DslParseError(
      'AI_DSL_MISSING',
      'AI response is missing the <changes> block and no valid JSON was found.'
    );
  }

  throw new DslParseError('AI_DSL_INVALID', 'Failed to parse generated script response.');
}

/**
 * Try `parseDslResponse`; if it fails with a recoverable error, ask the model
 * (via the provided `repair` callback) to reformat its own previous response
 * and try parsing once more.
 */
export async function parseDslResponseWithRepair(
  raw: string,
  repair: (repairPrompt: string) => Promise<string>
): Promise<DslResponse> {
  try {
    return parseDslResponse(raw);
  } catch (err) {
    if (!(err instanceof DslParseError) || !isRepairable(err.code)) {
      throw err;
    }
    const repairedRaw = await repair(buildDslRepairPrompt(raw));
    return parseDslResponse(repairedRaw);
  }
}

export function buildDslRepairPrompt(rawResponse: string): string {
  return [
    'Convert the following assistant response into a STRICT DSL payload.',
    'Return only this format and nothing else:',
    '',
    '<changes>',
    '{"type":"replace_selection","code":"...escaped json string..."}',
    '</changes>',
    '',
    'Rules:',
    '1. JSON must be valid.',
    '2. "type" must be either "replace_selection" or "replace_file".',
    '3. "code" must contain valid JavaScript code as a single JSON string with escaped newlines.',
    '4. Do not include commentary outside <changes>.',
    '',
    'Input to convert:',
    rawResponse,
  ].join('\n');
}

function isRepairable(code: DslParseErrorCode): boolean {
  return code === 'AI_DSL_MISSING' || code === 'AI_DSL_INVALID';
}

function tryParseDslJson(payload: string): DslResponse | null {
  try {
    const json = JSON.parse(payload);
    if (!VALID_DSL_TYPES.has(json?.type) || typeof json?.code !== 'string') {
      return null;
    }
    return { type: json.type as DslChangeType, code: json.code };
  } catch {
    return null;
  }
}

/**
 * Recover a DSL payload from a response that doesn't parse as strict JSON.
 *
 * Handles two real-world cases:
 *  - The model emitted DSL-like text with unescaped characters that break
 *    `JSON.parse` (e.g. raw newlines inside the `code` string).
 *  - The model was truncated mid-string by `max_tokens`, so the closing
 *    `"` and `</changes>` are missing. In that case we still salvage the
 *    partial code so the user sees something rather than a generic failure.
 */
function tryRecoverDslLikePayload(raw: string): DslResponse | null {
  const codeStart = raw.match(/"code"\s*:\s*"/);
  if (!codeStart || codeStart.index === undefined) {
    return null;
  }

  const contentStart = codeStart.index + codeStart[0].length;
  const scanned = scanJsonStringContent(raw, contentStart);
  if (scanned.content.length === 0) {
    return null;
  }

  const typeMatch = raw.match(/"type"\s*:\s*"(replace_selection|replace_file)"/i);
  const type: DslChangeType =
    typeMatch?.[1] === 'replace_file' ? 'replace_file' : 'replace_selection';

  return { type, code: decodeJsonStringFragment(scanned.content) };
}

/**
 * Reads a JSON string body starting at `startAt` (just after the opening `"`)
 * and returns its contents. Respects backslash escaping so that `\"` doesn't
 * terminate the scan. If the input is truncated before the closing quote,
 * returns everything up to the end and sets `truncated: true`.
 */
function scanJsonStringContent(
  input: string,
  startAt: number
): { content: string; truncated: boolean } {
  for (let i = startAt; i < input.length; i++) {
    if (input[i] === '\\') {
      i += 1;
      continue;
    }
    if (input[i] === '"') {
      return { content: input.slice(startAt, i), truncated: false };
    }
  }
  return { content: input.slice(startAt), truncated: true };
}

function decodeJsonStringFragment(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractCodeFence(raw: string): string | null {
  const fenceMatch = raw.match(/```(?:javascript|js|typescript|ts)?\s*([\s\S]*?)```/i);
  const code = fenceMatch?.[1]?.trim();
  return code && code.length > 0 ? code : null;
}

/**
 * Last-resort recovery: when the model returns plain text that is mostly
 * JavaScript (no wrapper, no fences) we still want to surface it instead of
 * failing the whole tool call. Returns the contiguous span between the first
 * and last code-like line, or `null` when the response is mostly prose.
 */
function extractInlineJsCode(raw: string): string | null {
  const lines = raw.split('\n');
  const codeLineIndices: number[] = [];

  lines.forEach((line, idx) => {
    if (looksLikeJsLine(line)) {
      codeLineIndices.push(idx);
    }
  });

  const nonBlankLines = lines.filter(line => line.trim().length > 0).length;
  if (
    codeLineIndices.length < 3 ||
    nonBlankLines === 0 ||
    codeLineIndices.length / nonBlankLines < 0.3
  ) {
    return null;
  }

  const first = codeLineIndices[0]!;
  const last = codeLineIndices[codeLineIndices.length - 1]!;
  const block = lines
    .slice(first, last + 1)
    .join('\n')
    .trim();
  return block.length > 0 ? block : null;
}

const JS_LINE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\s*(var|let|const|function|class|import|export|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|typeof|instanceof|delete|void|yield|await|async)\b/,
  /^\s*\/\//,
  /^\s*\/\*/,
  /^\s*\*\s/,
  /^\s*\*\//,
  /^\s*[}{)\]]/,
  /[;{},]\s*$/,
  /^\s*[\w$][\w$.]*\s*[=({:]/,
];

function looksLikeJsLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return JS_LINE_PATTERNS.some(pattern => pattern.test(trimmed));
}
