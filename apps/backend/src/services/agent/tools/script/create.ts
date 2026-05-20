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
import {
  DslParseError,
  parseDslResponseWithRepair,
  type DslResponse,
} from '../../../../ai/dslResponse.js';
import { buildExecutionPrompt } from '../../../../ai/executePrompt.js';
import { loadMergedLibs } from '../../../../ai/loadMergedLibs.js';
import { loadStaticLibs } from '../../../../ai/loadLibs.js';
import { getRepositoryJsLibService } from '../../../repositoryJsLibService.js';
import { buildRouterPrompt } from '../../../../ai/routerPrompt.js';
import {
  resolveRouterLibrarySelection,
  suggestedLibrariesForRouter,
} from '../../../../ai/selectPreferredLibraries.js';
import type { Manifest } from '../../../../ai/types/manifest.js';
import { log } from '../../../../lib/logger.js';
import { maskString } from '../../../ai/maskingEngine.js';
import { getMaskingSettings } from '../../../ai/maskingSettings.js';
import type { AgentExecutionContext, ResolvedAiRuntime } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const MAX_SELECTED_LIBS = 5;
/** Generous budget for the executor: long scripts with comments are easily 1500+ tokens. */
const EXECUTE_MAX_TOKENS = 2400;
/** Smaller budget for the repair pass — it only reformats existing text. */
const REPAIR_MAX_TOKENS = 1200;

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

      const libs =
        typeof ctx.userId === 'number'
          ? await loadMergedLibs({
              userId: ctx.userId,
              serverId: ctx.serverId,
              repositoryJsLibService: getRepositoryJsLibService(),
            })
          : loadStaticLibs();

      const manifestTyped = libs.manifest as Manifest;
      const suggested = suggestedLibrariesForRouter(request, manifestTyped);
      const routerPrompt = await maskPromptForUser(
        ctx.userId,
        buildRouterPrompt(request, manifestTyped, { suggestedLibraries: suggested })
      );
      const routerRaw = await callTextModel(runtime, routerPrompt, 400);
      let selectedLibraries: string[];
      try {
        selectedLibraries = resolveRouterLibrarySelection(
          request,
          manifestTyped,
          routerRaw,
          MAX_SELECTED_LIBS
        ).selected;
      } catch (err) {
        throw new ScriptCreateError(
          'AI_ROUTER_PARSE_FAILED',
          `Failed to parse selected helper libraries: ${(err as Error).message}`
        );
      }

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
      const raw = await callTextModel(runtime, executePrompt, EXECUTE_MAX_TOKENS);
      const parsed = await parseDslWithRepairOrThrow({
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

async function parseDslWithRepairOrThrow(args: {
  raw: string;
  userId: number | undefined;
  runtime: ResolvedAiRuntime;
}): Promise<DslResponse> {
  try {
    return await parseDslResponseWithRepair(args.raw, async repairPrompt => {
      const masked = await maskPromptForUser(args.userId, repairPrompt);
      return callTextModel(args.runtime, masked, REPAIR_MAX_TOKENS);
    });
  } catch (err) {
    if (err instanceof DslParseError) {
      log.warn(
        { code: err.code, rawPreview: args.raw.slice(0, 400) },
        'script_create: AI response could not be parsed as DSL'
      );
      throw new ScriptCreateError(err.code, err.message);
    }
    throw err;
  }
}
