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

import { Router, type Router as ExpressRouter, type Response } from 'express';
import { log } from '../lib/logger.js';
import { resolveUserAiConfig } from '../services/ai/userSettingsService.js';
import { getCurrentUserId } from '../services/userBootstrap.js';
import { getAiAssistantEnabled } from '../services/userSettings.js';
import { callAnthropic } from './anthropic.js';
import { buildExecutionPrompt } from './executePrompt.js';
import { loadLibs } from './loadLibs.js';
import { getAiProvider, providerSupportsCapability } from './providers.js';
import { buildRouterPrompt } from './routerPrompt.js';
import type { AiInputImage, AiInputImageMediaType } from './types.js';

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

const VALID_IMAGE_MEDIA_TYPES: ReadonlySet<AiInputImageMediaType> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

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
    const images = parseInputImages(req.body?.images);

    const { manifest } = loadLibs();
    const prompt = buildRouterPrompt(question, manifest);
    const raw = await callProvider(aiConfig.provider, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      prompt,
      maxTokens: 400,
      images,
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
    const images = parseInputImages(req.body?.images);
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
      images,
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
  args: {
    apiKey: string;
    model: string;
    prompt: string;
    maxTokens?: number;
    images?: AiInputImage[];
  }
) {
  const resolvedProvider = getAiProvider(provider);
  if (!resolvedProvider) {
    throw new AiError({
      code: 'AI_PROVIDER_UNSUPPORTED',
      message: `Provider "${provider}" is not supported.`,
      status: 400,
    });
  }

  if (args.images?.length && !providerSupportsCapability(resolvedProvider.id, 'vision')) {
    throw new AiError({
      code: 'AI_INPUT_UNSUPPORTED',
      message: `Provider "${resolvedProvider.label}" does not support image input.`,
      status: 400,
    });
  }

  return callAnthropic({
    apiKey: args.apiKey,
    model: args.model,
    prompt: args.prompt,
    maxTokens: args.maxTokens,
    temperature: resolvedProvider.defaultTemperature,
    baseURL: resolvedProvider.baseURL,
    images: args.images,
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

function parseInputImages(raw: unknown): AiInputImage[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: 'images must be an array when provided.',
    });
  }

  return raw.map((item, index) => parseInputImage(item, index));
}

function parseInputImage(raw: unknown, index: number): AiInputImage {
  if (!raw || typeof raw !== 'object') {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: `images[${index}] must be an object.`,
    });
  }

  const image = raw as { dataUrl?: unknown; data?: unknown; mediaType?: unknown };
  if (typeof image.dataUrl === 'string') {
    return parseDataUrlImage(image.dataUrl, index);
  }

  if (typeof image.data !== 'string' || typeof image.mediaType !== 'string') {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: `images[${index}] must include either dataUrl or { data, mediaType }.`,
    });
  }

  const mediaType = image.mediaType as AiInputImageMediaType;
  if (!VALID_IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: `images[${index}] mediaType is not supported.`,
    });
  }

  const data = image.data.trim();
  if (!data) {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: `images[${index}] data must be non-empty.`,
    });
  }

  return { mediaType, data };
}

function parseDataUrlImage(dataUrl: string, index: number): AiInputImage {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([a-zA-Z0-9+/=\s]+)$/i);
  if (!match?.[1] || !match[2]) {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: `images[${index}] dataUrl must be a valid base64 image data URL.`,
    });
  }

  const mediaType = match[1].toLowerCase() as AiInputImageMediaType;
  if (!VALID_IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: `images[${index}] dataUrl media type is not supported.`,
    });
  }

  return { mediaType, data: match[2].replace(/\s+/g, '') };
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

const VALID_DSL_TYPES = new Set(['replace_selection', 'replace_file'] as const);

function parseDslResponse(raw: string) {
  const match = raw.match(/<changes>([\s\S]*?)<\/changes>/i);
  let payload = match ? match[1].trim() : raw.trim();

  // Handle markdown fences and extract object
  payload = extractJsonObject(payload);

  try {
    const json = JSON.parse(payload);
    if (!VALID_DSL_TYPES.has(json.type) || typeof json.code !== 'string') {
      throw new Error('Invalid DSL payload.');
    }
    return json;
  } catch (err) {
    if (!match) {
      throw new AiError({
        code: 'AI_DSL_MISSING',
        message: 'AI response is missing the <changes> block and no valid JSON was found.',
      });
    }
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
