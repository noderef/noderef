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
  providerSupportsCapability,
} from '../../src/ai/providers.js';

describe('ai providers catalog', () => {
  it('contains anthropic and minimax providers', () => {
    const providers = listAiProviders();
    const ids = providers.map(provider => provider.id);

    expect(ids).toContain('anthropic');
    expect(ids).toContain('minimax');
  });

  it('uses anthropic as default provider', () => {
    const provider = getDefaultAiProvider();
    expect(provider.id).toBe('anthropic');
    expect(provider.defaultModel).toBeTruthy();
  });

  it('resolves provider ids case-insensitively', () => {
    expect(getAiProvider('MINIMAX')?.id).toBe('minimax');
    expect(getAiProvider('Anthropic')?.id).toBe('anthropic');
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
});
