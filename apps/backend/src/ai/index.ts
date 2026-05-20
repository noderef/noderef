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
import { maskString } from '../services/ai/maskingEngine.js';
import { getMaskingSettings } from '../services/ai/maskingSettings.js';
import { resolveUserAiConfig } from '../services/ai/userSettingsService.js';
import { getCurrentUserId } from '../services/userBootstrap.js';
import { getAiAssistantEnabled } from '../services/userSettings.js';
import { callAnthropic } from './anthropic.js';
import { buildExecutionPrompt } from './executePrompt.js';
import { loadMergedLibs } from './loadMergedLibs.js';
import type { RepositoryJsLibService } from '../services/repositoryJsLibService.js';
import { getAiProvider, providerSupportsCapability } from './providers.js';
import { buildRouterPrompt } from './routerPrompt.js';
import type { AiInputImage, AiInputImageMediaType } from './types.js';

export interface CreateAiRouterOptions {
  repositoryJsLibService: RepositoryJsLibService;
}

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

function parseOptionalServerId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AiError({
      code: 'INVALID_INPUT',
      message: 'serverId must be a positive integer when provided.',
    });
  }
  return value;
}

function parseRequiredServerId(raw: unknown): number {
  const value = parseOptionalServerId(raw);
  if (value == null) {
    throw new AiError({ code: 'INVALID_INPUT', message: 'serverId is required.' });
  }
  return value;
}

export function createAiRouter({ repositoryJsLibService }: CreateAiRouterOptions): ExpressRouter {
  const router: ExpressRouter = Router();

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

      const serverId = parseOptionalServerId(req.body?.serverId);
      const libs = await loadMergedLibs({ userId, serverId, repositoryJsLibService });
      const { manifest } = libs;
      const prompt = buildRouterPrompt(question, manifest);
      const maskedPrompt = await maskPromptForUser(userId, prompt);

      const raw = await callProvider(aiConfig.provider, {
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        prompt: maskedPrompt,
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
      const selectionText =
        typeof req.body?.selection === 'string' ? req.body.selection : undefined;
      const contextSnippet = typeof req.body?.context === 'string' ? req.body.context : undefined;

      const userId = await getCurrentUserId();
      const aiConfig = await resolveConfigOrThrow(userId);
      await ensureUserEnabled(userId);
      const images = parseInputImages(req.body?.images);
      const serverId = parseOptionalServerId(req.body?.serverId);
      const libs = await loadMergedLibs({ userId, serverId, repositoryJsLibService });
      const selectedLibs = selected.filter((name: string) => name in libs.libs);

      const prompt = buildExecutionPrompt({
        question,
        selectedLibs,
        libs: libs.libs,
        selection: selectionText,
        contextSnippet,
      });
      const maskedPrompt = await maskPromptForUser(userId, prompt);

      const raw = await callProvider(aiConfig.provider, {
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        prompt: maskedPrompt,
        maxTokens: 8192,
        images,
      });

      const parsed = await parseDslResponseWithRepair({
        raw,
        userId,
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        maxTokens: 1200,
      });
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

  async function maskPromptForUser(userId: number, prompt: string): Promise<string> {
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
    const match = dataUrl.match(
      /^data:(image\/(?:jpeg|png|gif|webp));base64,([a-zA-Z0-9+/=\s]+)$/i
    );
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

  const VALID_DSL_TYPES = new Set(['replace_selection', 'replace_file'] as const);
  type DslChangeType = 'replace_selection' | 'replace_file';
  interface DslResponse {
    type: DslChangeType;
    code: string;
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

    // Fallback: if model returned plain fenced JS/TS instead of DSL JSON, use it directly.
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
      throw new AiError({
        code: 'AI_DSL_MISSING',
        message: 'AI response is missing the <changes> block and no valid JSON was found.',
      });
    }

    throw new AiError({
      code: 'AI_DSL_INVALID',
      message: 'Failed to parse DSL response.',
    });
  }

  async function parseDslResponseWithRepair(args: {
    raw: string;
    userId: number;
    provider: string;
    apiKey: string;
    model: string;
    maxTokens?: number;
  }): Promise<DslResponse> {
    try {
      return parseDslResponse(args.raw);
    } catch (err) {
      if (!(err instanceof AiError) || !shouldAttemptDslRepair(err.code)) {
        throw err;
      }

      const repairedPrompt = await maskPromptForUser(args.userId, buildDslRepairPrompt(args.raw));
      const repairedRaw = await callProvider(args.provider, {
        apiKey: args.apiKey,
        model: args.model,
        prompt: repairedPrompt,
        maxTokens: Math.min(args.maxTokens ?? 1200, 900),
      });

      return parseDslResponse(repairedRaw);
    }
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

  function extractJsonObject(raw: string): string {
    const trimmed = raw.trim();
    // Handle markdown code blocks if present
    if (trimmed.startsWith('```')) {
      const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch?.[1]) {
        return fenceMatch[1].trim();
      }
    }

    // Find outer-most braces
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return '';
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

  router.post('/libs/warm', async (req, res) => {
    try {
      const serverId = parseRequiredServerId(req.body?.serverId);
      const userId = await getCurrentUserId();
      const status = await repositoryJsLibService.warm(userId, serverId);
      res.json(status);
    } catch (err) {
      handleError(res, err as Error, 0, 'libs/warm');
    }
  });

  return router;
}
