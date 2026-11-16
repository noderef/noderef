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

import { describe, expect, it } from 'vitest';
import {
  getAiProvider,
  getDefaultAiProvider,
  inferModelCapabilities,
  listAiProviders,
  normalizeCustomBaseUrl,
  providerSupportsCapability,
  resolveProviderEndpoint,
} from '../../src/ai/providers.js';

describe('ai providers catalog', () => {
  it('contains anthropic, minimax, and openrouter providers', () => {
    const providers = listAiProviders();
    const ids = providers.map(provider => provider.id);

    expect(ids).toContain('anthropic');
    expect(ids).toContain('minimax');
    expect(ids).toContain('openrouter');
  });

  it('uses anthropic as default provider', () => {
    const provider = getDefaultAiProvider();
    expect(provider.id).toBe('anthropic');
    expect(provider.defaultModel).toBeTruthy();
  });

  it('resolves provider ids case-insensitively', () => {
    expect(getAiProvider('MINIMAX')?.id).toBe('minimax');
    expect(getAiProvider('Anthropic')?.id).toBe('anthropic');
    expect(getAiProvider('OpenRouter')?.id).toBe('openrouter');
  });

  it('marks minimax as text-only for Anthropic-compatible mode', () => {
    expect(providerSupportsCapability('minimax', 'text')).toBe(true);
    expect(providerSupportsCapability('minimax', 'vision')).toBe(false);
  });

  it('infers vision support for Claude 3 family models', () => {
    expect(inferModelCapabilities('anthropic', 'claude-3-5-sonnet-20241022')).toEqual([
      'text',
      'vision',
    ]);
    expect(inferModelCapabilities('anthropic', 'claude-2.1')).toEqual(['text']);
  });

  it('configures openrouter with anthropic-compatible base URL and fallbacks', () => {
    const provider = getAiProvider('openrouter');
    expect(provider).toBeTruthy();
    expect(provider?.baseURL).toBe('https://openrouter.ai/api');
    expect(provider?.modelCatalogMode).toBe('api_with_fallback');
    expect(provider?.fallbackModels.length).toBeGreaterThan(0);
  });

  it('infers vision support for OpenRouter Claude slugs', () => {
    expect(inferModelCapabilities('openrouter', 'anthropic/claude-sonnet-4')).toEqual([
      'text',
      'vision',
    ]);
    expect(inferModelCapabilities('openrouter', 'google/gemini-2.5-pro')).toEqual([
      'text',
      'vision',
    ]);
  });

  it('allows vision capability at provider level for openrouter', () => {
    expect(providerSupportsCapability('openrouter', 'text')).toBe(true);
    expect(providerSupportsCapability('openrouter', 'vision')).toBe(true);
  });

  it('exposes a custom provider with user-supplied base URL and optional token', () => {
    const provider = getAiProvider('Custom');
    expect(provider?.id).toBe('custom');
    expect(provider?.requiresBaseUrl).toBe(true);
    expect(provider?.tokenOptional).toBe(true);
    expect(provider?.baseURL).toBeUndefined();
  });
});

describe('normalizeCustomBaseUrl', () => {
  it('strips trailing slashes and OpenAI-style /v1 suffixes', () => {
    expect(normalizeCustomBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
    expect(normalizeCustomBaseUrl(' http://localhost:11434/ ')).toBe('http://localhost:11434');
    expect(normalizeCustomBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434');
    expect(normalizeCustomBaseUrl('http://localhost:4000/v1/messages')).toBe(
      'http://localhost:4000'
    );
    expect(normalizeCustomBaseUrl('https://llm.example.com/litellm/v1/')).toBe(
      'https://llm.example.com/litellm'
    );
  });

  it('rejects empty and non-http URLs', () => {
    expect(normalizeCustomBaseUrl('')).toBeNull();
    expect(normalizeCustomBaseUrl(undefined)).toBeNull();
    expect(normalizeCustomBaseUrl('localhost:11434')).toBeNull();
    expect(normalizeCustomBaseUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeCustomBaseUrl('not a url')).toBeNull();
  });
});

describe('resolveProviderEndpoint', () => {
  it('uses the built-in base URL for hosted providers and never sends a bearer token', () => {
    const provider = getAiProvider('openrouter')!;
    expect(
      resolveProviderEndpoint(provider, {
        apiKey: 'sk-test',
        metadata: { baseURL: 'http://evil.local' },
      })
    ).toEqual({ baseURL: 'https://openrouter.ai/api' });
  });

  it('reads the stored base URL for the custom provider and forwards the key as bearer', () => {
    const provider = getAiProvider('custom')!;
    expect(
      resolveProviderEndpoint(provider, {
        apiKey: 'sk-local',
        metadata: { baseURL: 'http://localhost:4000/v1' },
      })
    ).toEqual({ baseURL: 'http://localhost:4000', authToken: 'sk-local' });
  });

  it('omits auth for keyless custom endpoints and leaves base URL unset when missing', () => {
    const provider = getAiProvider('custom')!;
    expect(
      resolveProviderEndpoint(provider, {
        apiKey: '',
        metadata: { baseURL: 'http://localhost:11434' },
      })
    ).toEqual({ baseURL: 'http://localhost:11434', authToken: undefined });
    expect(resolveProviderEndpoint(provider, { apiKey: '', metadata: null }).baseURL).toBe(
      undefined
    );
  });
});
