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

import { callAnthropic } from '../../../../ai/anthropic.js';
import { buildExecutionPrompt } from '../../../../ai/executePrompt.js';
import { loadLibs } from '../../../../ai/loadLibs.js';
import { buildRouterPrompt } from '../../../../ai/routerPrompt.js';
import { maskString } from '../../../ai/maskingEngine.js';
import { getMaskingSettings } from '../../../ai/maskingSettings.js';
import type { AgentExecutionContext, ResolvedAiRuntime } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const MAX_SELECTED_LIBS = 5;
const VALID_DSL_TYPES = new Set(['replace_selection', 'replace_file'] as const);

type DslChangeType = 'replace_selection' | 'replace_file';

interface DslResponse {
  type: DslChangeType;
  code: string;
}

class ScriptCreateError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const scriptCreateTool: ToolDefinition = {
  name: 'script_create',
  description:
    'Generate Alfresco JavaScript code from a user request using curated helper-library examples. This tool does not execute scripts.',
  skill: { kind: 'local_md', path: '../skills/script_create.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description:
          'What the generated JavaScript should do. Include concrete behavior and constraints.',
      },
      selection: {
        type: 'string',
        description: 'Optional currently selected code block to edit/replace.',
      },
      context: {
        type: 'string',
        description: 'Optional extra context (existing script snippet, errors, or constraints).',
      },
    },
    required: ['request'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const request = typeof args.request === 'string' ? args.request.trim() : '';
      if (!request) {
        return { ok: false, error: 'request is required' };
      }

      const runtime = ctx.aiRuntime;
      if (!runtime) {
        return { ok: false, error: 'AI runtime is unavailable for script generation.' };
      }

      const selection = typeof args.selection === 'string' ? args.selection : undefined;
      const contextSnippet = typeof args.context === 'string' ? args.context : undefined;

      const libs = loadLibs();

      const routerPrompt = await maskPromptForUser(
        ctx.userId,
        buildRouterPrompt(request, libs.manifest)
      );
      const routerRaw = await callTextModel(runtime, routerPrompt, 400);
      const selectedLibraries = parseSelectedLibraries(routerRaw, libs.manifest);

      const executePrompt = await maskPromptForUser(
        ctx.userId,
        buildExecutionPrompt({
          question: request,
          selectedLibs: selectedLibraries,
          libs: libs.libs,
          selection,
          contextSnippet,
        })
      );
      const raw = await callTextModel(runtime, executePrompt, 1400);
      const parsed = await parseDslResponseWithRepair({
        raw,
        userId: ctx.userId,
        runtime,
      });

      return {
        ok: true,
        data: {
          type: parsed.type,
          script: parsed.code,
          selectedLibraries,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

async function callTextModel(
  runtime: ResolvedAiRuntime,
  prompt: string,
  maxTokens: number
): Promise<string> {
  return callAnthropic({
    apiKey: runtime.apiKey,
    model: runtime.model,
    baseURL: runtime.baseURL,
    temperature: runtime.temperature,
    prompt,
    maxTokens,
  });
}

async function maskPromptForUser(userId: number | undefined, prompt: string): Promise<string> {
  if (typeof userId !== 'number') {
    return prompt;
  }

  try {
    const maskConfig = await getMaskingSettings(userId);
    if (maskConfig.enabled) {
      return maskString(prompt, maskConfig).masked;
    }
  } catch {
    // Masking unavailable — proceed unmasked.
  }

  return prompt;
}

function parseSelectedLibraries(raw: string, manifest: Record<string, unknown>): string[] {
  try {
    const sanitized = extractJsonArray(raw);
    const parsed = JSON.parse(sanitized);
    if (!Array.isArray(parsed)) {
      throw new Error('Router response must be an array.');
    }

    return parsed
      .filter(name => typeof name === 'string' && name in manifest)
      .slice(0, MAX_SELECTED_LIBS);
  } catch (err) {
    throw new ScriptCreateError(
      'AI_ROUTER_PARSE_FAILED',
      `Failed to parse selected helper libraries: ${(err as Error).message}`
    );
  }
}

function extractJson(raw: string, charPair: [string, string]): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      return fenceMatch[1].trim();
    }
  }
  const firstChar = trimmed.indexOf(charPair[0]);
  const lastChar = trimmed.lastIndexOf(charPair[1]);
  if (firstChar !== -1 && lastChar !== -1 && lastChar > firstChar) {
    return trimmed.slice(firstChar, lastChar + 1);
  }
  return trimmed;
}

function extractJsonArray(raw: string): string {
  return extractJson(raw, ['[', ']']);
}

function extractJsonObject(raw: string): string {
  return extractJson(raw, ['{', '}']);
}

async function parseDslResponseWithRepair(args: {
  raw: string;
  userId: number | undefined;
  runtime: ResolvedAiRuntime;
}): Promise<DslResponse> {
  try {
    return parseDslResponse(args.raw);
  } catch (err) {
    if (!(err instanceof ScriptCreateError) || !shouldAttemptDslRepair(err.code)) {
      throw err;
    }

    const repairedPrompt = await maskPromptForUser(args.userId, buildDslRepairPrompt(args.raw));
    const repairedRaw = await callTextModel(args.runtime, repairedPrompt, 900);
    return parseDslResponse(repairedRaw);
  }
}

function parseDslResponse(raw: string): DslResponse {
  const match = raw.match(/<changes>([\s\S]*?)<\/changes>/i);
  const candidates = [match?.[1], raw].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const parsedFromJson = tryParseDslJson(extractJsonObject(candidate.trim()));
    if (parsedFromJson) {
      return parsedFromJson;
    }

    const recoveredFromDslLikeText = tryRecoverDslLikePayload(candidate);
    if (recoveredFromDslLikeText) {
      return recoveredFromDslLikeText;
    }
  }

  if (!match) {
    const fencedCode = extractCodeFence(raw);
    if (fencedCode) {
      return {
        type: 'replace_selection',
        code: fencedCode,
      };
    }
  }

  if (!match) {
    throw new ScriptCreateError(
      'AI_DSL_MISSING',
      'AI response is missing the <changes> block and no valid JSON was found.'
    );
  }

  throw new ScriptCreateError('AI_DSL_INVALID', 'Failed to parse generated script response.');
}

function shouldAttemptDslRepair(code: string): boolean {
  return code === 'AI_DSL_MISSING' || code === 'AI_DSL_INVALID';
}

function buildDslRepairPrompt(rawResponse: string): string {
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

function tryParseDslJson(payload: string): DslResponse | null {
  try {
    const json = JSON.parse(payload);
    if (!VALID_DSL_TYPES.has(json?.type) || typeof json?.code !== 'string') {
      return null;
    }

    return {
      type: json.type as DslChangeType,
      code: json.code,
    };
  } catch {
    return null;
  }
}

function tryRecoverDslLikePayload(raw: string): DslResponse | null {
  const typeMatch = raw.match(/"type"\s*:\s*"(replace_selection|replace_file)"/i);
  if (!typeMatch?.[1]) {
    return null;
  }

  const codeMatch = raw.match(/"code"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/i);
  if (!codeMatch?.[1]) {
    return null;
  }

  return {
    type: typeMatch[1] as DslChangeType,
    code: decodeJsonStringFragment(codeMatch[1]),
  };
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
