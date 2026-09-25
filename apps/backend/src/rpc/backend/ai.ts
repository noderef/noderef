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
 * AI RPC handlers
 * Handles all backend.ai.* RPC methods
 */

import { z } from 'zod';
import { listAnthropicModels } from '../../ai/anthropic.js';
import { listOpenRouterModels } from '../../ai/openrouter.js';
import {
  getAiProvider,
  getDefaultAiProvider,
  inferModelCapabilities,
  isBaseUrlMissing,
  listAiProviders,
  normalizeCustomBaseUrl,
  normalizeProviderId,
  providerSupportsCapability,
  resolveProviderEndpoint,
  type AiProviderConfig,
  type AiProviderEndpoint,
} from '../../ai/providers.js';
import type { AiListedModel } from '../../ai/types.js';
import { AppErrors } from '../../lib/errors.js';
import {
  getMaskingSettings,
  previewMasking,
  saveMaskingSettings,
} from '../../services/ai/maskingSettings.js';
import {
  listUserAiSettings,
  parseAiSettingsMetadata,
  resolveUserAiConfig,
  resolveUserAiConfigForProvider,
  upsertUserAiSettings,
} from '../../services/ai/userSettingsService.js';
import { getAiAssistantEnabled, setAiAssistantEnabled } from '../../services/userSettings.js';
import type { Routes } from './types.js';
import { getCurrentUserId } from './withAuth.js';

const DEFAULT_PROVIDER = getDefaultAiProvider();
const INVALID_BASE_URL_MESSAGE = 'A valid http(s) base URL is required for this provider.';

/**
 * Register all AI-related RPC handlers
 */
export function registerAiHandlers(routes: Routes): void {
  routes['backend.ai.listProviders'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const settings = await listUserAiSettings(userId);
      const settingsByProvider = new Map(settings.map(setting => [setting.provider, setting]));
      const providers = listAiProviders().map(provider => {
        const stored = settingsByProvider.get(provider.id);
        const endpoint = resolveProviderEndpoint(provider, {
          metadata: parseAiSettingsMetadata(stored?.metadata),
        });
        return {
          id: provider.id,
          label: provider.label,
          defaultModel: provider.defaultModel,
          modelCatalogMode: provider.modelCatalogMode,
          capabilities: getProviderCapabilities(provider),
          models: provider.fallbackModels,
          hasToken: Boolean(stored),
          hasApiKey: Boolean(stored?.token),
          requiresBaseUrl: Boolean(provider.requiresBaseUrl),
          tokenOptional: Boolean(provider.tokenOptional),
          baseURL: endpoint.baseURL ?? null,
        };
      });

      return {
        defaultProvider: DEFAULT_PROVIDER.id,
        providers,
      };
    },
  };

  routes['backend.ai.getSettings'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const config = await resolveUserAiConfig(userId);
      const configuredProvider = config?.provider ? getAiProvider(config.provider) : null;
      const selectedProvider = configuredProvider || getDefaultAiProvider();
      const hasToken = Boolean(
        configuredProvider && (config?.apiKey || configuredProvider.tokenOptional)
      );
      const model = configuredProvider
        ? (config?.model ?? selectedProvider.defaultModel)
        : selectedProvider.defaultModel;

      return {
        provider: selectedProvider.id,
        model,
        hasToken,
        enabled: await getAiAssistantEnabled(userId),
      };
    },
  };

  routes['backend.ai.saveSettings'] = {
    schema: z.object({
      provider: z.string().min(1),
      model: z.string().min(1),
      token: z.string().optional(),
      baseURL: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { provider, model, token, baseURL, enabled } = params as {
        provider: string;
        model: string;
        token?: string;
        baseURL?: string;
        enabled?: boolean;
      };

      const normalizedProviderId = normalizeProviderId(provider);
      if (!normalizedProviderId) {
        AppErrors.invalidInput(`Provider "${provider}" is not supported.`);
      }
      const resolvedProvider =
        getAiProvider(normalizedProviderId || DEFAULT_PROVIDER.id) || DEFAULT_PROVIDER;

      const normalizedModel = model.trim();
      if (!normalizedModel) {
        AppErrors.invalidInput('Model is required.');
      }

      const normalizedToken = token && token.trim().length > 0 ? token.trim() : undefined;

      let metadata: Record<string, unknown> | null = null;
      if (resolvedProvider.requiresBaseUrl) {
        const normalizedBaseUrl = normalizeCustomBaseUrl(baseURL);
        if (!normalizedBaseUrl) {
          AppErrors.invalidInput(INVALID_BASE_URL_MESSAGE);
        }
        metadata = { baseURL: normalizedBaseUrl };
      }

      await upsertUserAiSettings(userId, {
        provider: resolvedProvider.id,
        model: normalizedModel,
        token: normalizedToken,
        metadata,
        isDefault: true,
        allowEmptyToken: resolvedProvider.tokenOptional,
      });

      if (typeof enabled === 'boolean') {
        await setAiAssistantEnabled(userId, enabled);
      }

      return { success: true };
    },
  };

  routes['backend.ai.listModels'] = {
    schema: z.object({
      provider: z.string().optional(),
      token: z.string().optional(),
      baseURL: z.string().optional(),
    }),
    handler: async (params: unknown) => {
      const typedParams = params as { provider?: string; token?: string; baseURL?: string };
      const userId = await getCurrentUserId();
      const providerOverride = typedParams.provider?.trim();
      const tokenOverride = typedParams.token?.trim();
      const baseUrlOverride = typedParams.baseURL?.trim();

      const defaultConfig = await resolveUserAiConfig(userId).catch(() => null);

      const resolvedProviderId =
        normalizeProviderId(providerOverride) ||
        normalizeProviderId(defaultConfig?.provider) ||
        DEFAULT_PROVIDER.id;

      const provider = getAiProvider(resolvedProviderId);
      if (!provider) {
        AppErrors.invalidInput(`Provider "${resolvedProviderId}" is not supported.`);
      }
      const resolvedProvider = provider || DEFAULT_PROVIDER;

      const providerConfig = await resolveUserAiConfigForProvider(
        userId,
        resolvedProvider.id
      ).catch(() => null);
      const token = tokenOverride || providerConfig?.apiKey;
      if (!token && !resolvedProvider.tokenOptional) {
        AppErrors.invalidInput('No API token provided or stored.');
      }
      const resolvedToken = token || '';

      const endpoint = resolveProviderEndpoint(resolvedProvider, {
        apiKey: resolvedToken,
        metadata: baseUrlOverride ? { baseURL: baseUrlOverride } : providerConfig?.metadata,
      });
      if (isBaseUrlMissing(resolvedProvider, endpoint)) {
        AppErrors.invalidInput(INVALID_BASE_URL_MESSAGE);
      }

      // Keep the saved model selectable even if the server does not list it.
      const fallbackModels =
        resolvedProvider.requiresBaseUrl && providerConfig?.model
          ? [
              {
                id: providerConfig.model,
                displayName: null,
                createdAt: null,
                capabilities: inferModelCapabilities(resolvedProvider.id, providerConfig.model),
              },
            ]
          : resolvedProvider.fallbackModels;

      const models = await listModelsForProvider(
        { ...resolvedProvider, fallbackModels },
        resolvedToken,
        endpoint
      );
      return { provider: resolvedProvider.id, models };
    },
  };

  // ── Masking settings ────────────────────────────────────────────────────────

  routes['backend.ai.getMaskingSettings'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      return getMaskingSettings(userId);
    },
  };

  routes['backend.ai.saveMaskingSettings'] = {
    schema: z.object({
      config: z.record(z.unknown()),
    }),
    handler: async (params: unknown) => {
      const userId = await getCurrentUserId();
      const { config } = params as { config: unknown };
      return saveMaskingSettings(userId, config);
    },
  };

  routes['backend.ai.previewMasking'] = {
    schema: z.object({
      config: z.record(z.unknown()),
      input: z.string(),
    }),
    handler: async (params: unknown) => {
      await getCurrentUserId();
      const { config, input } = params as { config: unknown; input: string };
      return previewMasking(config, input);
    },
  };
}

function getProviderCapabilities(provider: AiProviderConfig): Array<'text' | 'vision'> {
  const capabilities: Array<'text' | 'vision'> = ['text'];
  if (providerSupportsCapability(provider.id, 'vision')) {
    capabilities.push('vision');
  }
  return capabilities;
}

async function listModelsForProvider(
  provider: AiProviderConfig,
  apiKey: string,
  endpoint: AiProviderEndpoint
): Promise<AiListedModel[]> {
  if (provider.modelCatalogMode === 'static') {
    return provider.fallbackModels;
  }

  try {
    const remoteModels = await fetchRemoteModelsForProvider(provider, apiKey, endpoint);
    const normalizedRemote = remoteModels.map(model => ({
      ...model,
      capabilities: inferModelCapabilities(provider.id, model.id),
    }));
    return mergeUniqueModels(normalizedRemote, provider.fallbackModels);
  } catch (error) {
    if (provider.modelCatalogMode === 'api_with_fallback') {
      if (isUnsupportedModelsEndpoint(error) || provider.id === 'openrouter') {
        return provider.fallbackModels;
      }
    }
    throw error;
  }
}

async function fetchRemoteModelsForProvider(
  provider: AiProviderConfig,
  apiKey: string,
  endpoint: AiProviderEndpoint
): Promise<AiListedModel[]> {
  if (provider.id === 'openrouter') {
    return listOpenRouterModels({ apiKey });
  }

  const models = await listAnthropicModels({ apiKey, ...endpoint });
  // Self-hosted catalogs mix in embedding/reranker models that cannot chat.
  return provider.requiresBaseUrl
    ? models.filter(model => !/embed|rerank/i.test(model.id))
    : models;
}

function mergeUniqueModels(primary: AiListedModel[], fallback: AiListedModel[]): AiListedModel[] {
  const seen = new Set<string>();
  const merged: AiListedModel[] = [];

  for (const model of [...primary, ...fallback]) {
    const key = model.id.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(model);
  }

  return merged;
}

function isUnsupportedModelsEndpoint(error: unknown): boolean {
  const statusRaw = (error as { status?: unknown })?.status;
  const status = typeof statusRaw === 'number' ? statusRaw : undefined;

  if (status === 404 || status === 405 || status === 501) {
    return true;
  }

  const messageRaw = (error as { message?: unknown })?.message;
  const message = typeof messageRaw === 'string' ? messageRaw.toLowerCase() : '';
  return message.includes('/v1/models') && message.includes('not') && message.includes('support');
}
