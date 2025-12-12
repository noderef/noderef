/**
 * Copyright 2025 NodeRef
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

import { Router, type Response, type Router as ExpressRouter } from 'express';
import { log } from '../lib/logger.js';
import { getCurrentUserId } from '../services/userBootstrap.js';
import { resolveUserAiConfig } from '../services/ai/userSettingsService.js';
import { getAiAssistantEnabled } from '../services/userSettings.js';
import { callAnthropic } from './anthropic.js';
import { buildExecutionPrompt } from './executePrompt.js';
import { buildRouterPrompt } from './routerPrompt.js';
import { loadLibs } from './loadLibs.js';

const router: ExpressRouter = Router();

interface AiErrorOptions {
  code: string;
  message: string;
  status?: number;
}

class AiError extends Error {
  code: string;
  status: number;

  constructor({ code, message, status = 400 }: AiErrorOptions) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function isAiEnabled(): boolean {
  return process.env.ENABLE_AI_CONSOLE !== '0';
}

router.get('/status', async (_req, res) => {
  const globallyEnabled = isAiEnabled();
  const userId = await getCurrentUserId();
  const userEnabled = await getAiAssistantEnabled(userId);
  const config = await resolveUserAiConfig(userId);

  res.json({
    enabled: globallyEnabled && userEnabled,
    userEnabled,
    providerConfigured: Boolean(config),
  });
});

router.use((req, res, next) => {
  if (!isAiEnabled()) {
    return res.status(503).json({
      code: 'AI_DISABLED',
      message: 'AI console is disabled for this environment.',
    });
  }
  next();
});

router.post('/router', async (req, res) => {
  const started = Date.now();
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) {
      throw new AiError({ code: 'INVALID_INPUT', message: 'Question is required.' });
    }

    const userId = await getCurrentUserId();
    const aiConfig = await resolveConfigOrThrow(userId);
    await ensureUserEnabled(userId);

    const { manifest } = loadLibs();
    const prompt = buildRouterPrompt(question, manifest);
    const raw = await callProvider(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      prompt,
      maxTokens: 400,
    });

    const selected = parseSelectedLibraries(raw, manifest);
    log.info(
      {
        route: 'router',
        userId,
        provider: aiConfig.provider,
        durationMs: Date.now() - started,
        selected,
      },
      'AI router success'
    );
    res.json({ selected });
  } catch (err) {
    handleError(res, err as Error, Date.now() - started, 'router');
  }
});

router.post('/execute', async (req, res) => {
  const started = Date.now();
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) {
      throw new AiError({ code: 'INVALID_INPUT', message: 'Question is required.' });
    }

    const selected = Array.isArray(req.body?.selected) ? req.body.selected : [];
    const selectionText = typeof req.body?.selection === 'string' ? req.body.selection : undefined;
    const contextSnippet = typeof req.body?.context === 'string' ? req.body.context : undefined;

    const userId = await getCurrentUserId();
    const aiConfig = await resolveConfigOrThrow(userId);
    await ensureUserEnabled(userId);
    const libs = loadLibs();
    const selectedLibs = selected.filter((name: string) => name in libs.libs);

    const prompt = buildExecutionPrompt({
      question,
      selectedLibs,
      libs: libs.libs,
      selection: selectionText,
      contextSnippet,
    });

    const raw = await callProvider(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      prompt,
      maxTokens: 1200,
    });

    const parsed = parseDslResponse(raw);
    log.info(
      {
        route: 'execute',
        userId,
        provider: aiConfig.provider,
        durationMs: Date.now() - started,
        selectedLibCount: selectedLibs.length,
      },
      'AI execute success'
    );

    res.json({
      result: parsed,
      raw,
    });
  } catch (err) {
    handleError(res, err as Error, Date.now() - started, 'execute');
  }
});

async function resolveConfigOrThrow(userId: number) {
  const config = await resolveUserAiConfig(userId);
  if (!config) {
    throw new AiError({
      code: 'AI_CONFIG_MISSING',
      message: 'No AI provider is configured for your user.',
      status: 412,
    });
  }
  return config;
}

async function ensureUserEnabled(userId: number) {
  const userEnabled = await getAiAssistantEnabled(userId);
  if (!userEnabled) {
    throw new AiError({
      code: 'AI_DISABLED_FOR_USER',
      message: 'AI assistant is disabled in your settings.',
      status: 403,
    });
  }
}

async function callProvider(
  provider: string,
  args: { apiKey: string; model: string; prompt: string; maxTokens?: number }
) {
  if (provider === 'anthropic') {
    return callAnthropic({
      apiKey: args.apiKey,
      model: args.model,
      prompt: args.prompt,
      maxTokens: args.maxTokens,
    });
  }

  throw new AiError({
    code: 'AI_PROVIDER_UNSUPPORTED',
    message: `Provider "${provider}" is not supported.`,
    status: 400,
  });
}

function parseSelectedLibraries(raw: string, manifest: Record<string, unknown>): string[] {
  try {
    const sanitized = extractJsonArray(raw);
    const parsed = JSON.parse(sanitized);
    if (!Array.isArray(parsed)) {
      throw new Error('Router response must be an array.');
    }

    return parsed.filter(name => typeof name === 'string' && name in manifest).slice(0, 5);
  } catch (err) {
    throw new AiError({
      code: 'AI_ROUTER_PARSE_FAILED',
      message: `Failed to parse router response: ${(err as Error).message}`,
    });
  }
}

function extractJsonArray(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      return fenceMatch[1].trim();
    }
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }
  return trimmed;
}

const VALID_DSL_TYPES = new Set(['replace_selection', 'replace_file'] as const);

function parseDslResponse(raw: string) {
  const match = raw.match(/<changes>([\s\S]*?)<\/changes>/i);
  if (!match) {
    throw new AiError({
      code: 'AI_DSL_MISSING',
      message: 'AI response is missing the <changes> block.',
    });
  }

  const payload = match[1].trim();
  try {
    const json = JSON.parse(payload);
    if (!VALID_DSL_TYPES.has(json.type) || typeof json.code !== 'string') {
      throw new Error('Invalid DSL payload.');
    }
    return json;
  } catch (err) {
    throw new AiError({
      code: 'AI_DSL_INVALID',
      message: `Failed to parse DSL response: ${(err as Error).message}`,
    });
  }
}

function handleError(res: Response, err: Error, durationMs: number, route: string) {
  const aiErr =
    err instanceof AiError
      ? err
      : new AiError({ code: 'AI_ERROR', message: err.message, status: 500 });
  log.error(
    {
      route,
      durationMs,
      code: aiErr.code,
      error: err.message,
    },
    'AI route failed'
  );

  res.status(aiErr.status).json({
    code: aiErr.code,
    message: aiErr.message,
  });
}

export default router;
