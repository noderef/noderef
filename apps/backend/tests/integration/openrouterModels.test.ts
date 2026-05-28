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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { listOpenRouterModels } from '../../src/ai/openrouter.js';

describe('listOpenRouterModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps OpenRouter catalog entries into listed models', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'anthropic/claude-sonnet-4',
            name: 'Claude Sonnet 4',
            created: 1_700_000_000,
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'provider/embed-model',
            name: 'Embed Only',
            architecture: { modality: 'embeddings', output_modalities: ['embeddings'] },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const models = await listOpenRouterModels({ apiKey: 'sk-or-test' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=text',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-or-test' },
      })
    );
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('anthropic/claude-sonnet-4');
    expect(models[0]?.capabilities).toEqual(['text', 'vision']);
  });

  it('throws when the catalog request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })
    );

    await expect(listOpenRouterModels({ apiKey: 'bad' })).rejects.toThrow(
      /OpenRouter models request failed \(401\)/
    );
  });
});
