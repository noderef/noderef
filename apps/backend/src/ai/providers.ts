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

import type { AiCapability, AiListedModel } from './types.js';

export type AiProviderId = 'anthropic' | 'minimax' | 'openrouter';

export interface AiProviderConfig {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  defaultTemperature?: number;
  baseURL?: string;
  modelCatalogMode: 'api' | 'api_with_fallback' | 'static';
  fallbackModels: AiListedModel[];
}

const PROVIDERS: Record<AiProviderId, AiProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-sonnet-20241022',
    defaultTemperature: 0,
    modelCatalogMode: 'api',
    fallbackModels: [
      {
        id: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        createdAt: null,
        capabilities: ['text', 'vision'],
      },
    ],
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    defaultModel: 'M2.1',
    // MiniMax Anthropic-compatible endpoint requires temperature in (0, 1].
    defaultTemperature: 1,
    baseURL: 'https://api.minimax.io/anthropic',
    modelCatalogMode: 'api_with_fallback',
    fallbackModels: [
      { id: 'M2.1', displayName: 'MiniMax M2.1', createdAt: null, capabilities: ['text'] },
      {
        id: 'M2.1-lightning',
        displayName: 'MiniMax M2.1 Lightning',
        createdAt: null,
        capabilities: ['text'],
      },
      { id: 'M2', displayName: 'MiniMax M2', createdAt: null, capabilities: ['text'] },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'anthropic/claude-sonnet-4',
    defaultTemperature: 0.7,
    baseURL: 'https://openrouter.ai/api',
    modelCatalogMode: 'api_with_fallback',
    fallbackModels: [
      {
        id: 'anthropic/claude-sonnet-4',
        displayName: 'Claude Sonnet 4 (OpenRouter)',
        createdAt: null,
        capabilities: ['text', 'vision'],
      },
      {
        id: 'google/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro (OpenRouter)',
        createdAt: null,
        capabilities: ['text', 'vision'],
      },
      {
        id: 'openai/gpt-4o',
        displayName: 'GPT-4o (OpenRouter)',
        createdAt: null,
        capabilities: ['text', 'vision'],
      },
    ],
  },
};

const DEFAULT_PROVIDER_ID: AiProviderId = 'anthropic';

export function listAiProviders(): AiProviderConfig[] {
  return Object.values(PROVIDERS).map(cloneProviderConfig);
}

export function getAiProvider(provider: string): AiProviderConfig | null {
  const normalized = normalizeProviderId(provider);
  return normalized ? cloneProviderConfig(PROVIDERS[normalized]) : null;
}

export function getDefaultAiProvider(): AiProviderConfig {
  return cloneProviderConfig(PROVIDERS[DEFAULT_PROVIDER_ID]);
}

export function normalizeProviderId(provider: string | null | undefined): AiProviderId | null {
  const normalized = provider?.trim().toLowerCase();
  if (normalized === 'anthropic' || normalized === 'minimax' || normalized === 'openrouter') {
    return normalized;
  }
  return null;
}

export function inferModelCapabilities(providerId: AiProviderId, modelId: string): AiCapability[] {
  if (providerId === 'minimax') {
    return ['text'];
  }

  const normalized = modelId.trim().toLowerCase();
  if (!normalized) {
    return ['text'];
  }

  // Claude 3+ families support image input in Anthropic's Messages API.
  if (
    normalized.includes('claude-3') ||
    normalized.includes('claude-sonnet') ||
    normalized.includes('claude-opus') ||
    normalized.includes('claude-haiku')
  ) {
    return ['text', 'vision'];
  }

  // Common OpenRouter vision-capable families (provider/model slugs).
  if (
    normalized.includes('gpt-4o') ||
    normalized.includes('gemini') ||
    normalized.includes('/vision') ||
    normalized.endsWith('-vl')
  ) {
    return ['text', 'vision'];
  }

  return ['text'];
}

export function providerSupportsCapability(
  providerId: AiProviderId,
  capability: AiCapability
): boolean {
  if (capability === 'text') {
    return true;
  }
  return providerId !== 'minimax';
}

function cloneProviderConfig(provider: AiProviderConfig): AiProviderConfig {
  return {
    ...provider,
    fallbackModels: provider.fallbackModels.map(model => ({
      ...model,
      capabilities: [...model.capabilities],
    })),
  };
}
