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

import { mockGetNodeContent, mockListNodeChildren } from '../mocks/alfresco-js-api.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedClientWithRefresh } from '../../src/services/alfresco/authenticationHelper.js';
import { RepositoryJsLibService } from '../../src/services/repositoryJsLibService.js';

vi.mock('../../src/services/alfresco/authenticationHelper.js', () => ({
  getAuthenticatedClientWithRefresh: vi.fn(async () => ({})),
}));

function pathChainResponse(nodeId: string) {
  const chain: Record<string, { id: string; name: string }> = {
    '-root-': { id: 'company', name: 'Company Home' },
    company: { id: 'dict', name: 'Data Dictionary' },
    dict: { id: 'noderef', name: 'NodeRef' },
    noderef: { id: 'libs', name: 'js-libs' },
  };
  const step = chain[nodeId];
  if (!step) {
    return { list: { entries: [] } };
  }
  return { list: { entries: [{ entry: { id: step.id, name: step.name } }] } };
}

describe('RepositoryJsLibService', () => {
  beforeEach(() => {
    mockListNodeChildren.mockReset();
    mockGetNodeContent.mockReset();
    vi.mocked(getAuthenticatedClientWithRefresh).mockReset();
    vi.mocked(getAuthenticatedClientWithRefresh).mockResolvedValue({} as never);
  });

  function createService(ttlMs = 60_000) {
    const serverService = {
      findById: vi.fn(async () => ({ baseUrl: 'http://alfresco.local' })),
    };
    return new RepositoryJsLibService({} as never, serverService as never, { ttlMs });
  }

  it('returns empty repo libs when js-libs folder is missing', async () => {
    mockListNodeChildren.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'dict') {
        return { list: { entries: [] } };
      }
      return pathChainResponse(nodeId);
    });

    const service = createService();
    const result = await service.refresh(1, 9);
    expect(result.ok).toBe(true);
    expect(result.libCount).toBe(0);
  });

  it('loads valid files and skips invalid ones', async () => {
    mockListNodeChildren.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'libs') {
        return {
          list: {
            entries: [
              { entry: { id: 'good', name: 'invoice-samples.js', modifiedAt: '2026-01-01' } },
              { entry: { id: 'bad', name: 'invalid.js', modifiedAt: '2026-01-01' } },
            ],
          },
        };
      }
      return pathChainResponse(nodeId);
    });

    mockGetNodeContent.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'good') {
        return `/**
 * @description Invoice helpers.
 * @tags invoice
 */
logger.log("ok");`;
      }
      return 'logger.log("no metadata");';
    });

    const service = createService();
    const result = await service.refresh(1, 9);
    expect(result.ok).toBe(true);
    expect(result.libCount).toBe(1);

    const snapshot = await service.getSnapshot(1, 9);
    expect(snapshot.manifest['custom_invoice-samples']).toBeDefined();
    expect(snapshot.libs['custom_invoice-samples']?.text).toContain('logger.log');
  });

  it('dedupes concurrent refresh calls', async () => {
    let releaseLibs!: () => void;
    const libsGate = new Promise<void>(resolve => {
      releaseLibs = resolve;
    });

    mockListNodeChildren.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'libs') {
        await libsGate;
        return { list: { entries: [] } };
      }
      return pathChainResponse(nodeId);
    });

    const service = createService();
    const first = service.refresh(1, 9);
    const second = service.refresh(1, 9);
    releaseLibs();
    await Promise.all([first, second]);

    expect(mockListNodeChildren.mock.calls.filter(call => call[0] === 'libs')).toHaveLength(1);
  });

  it('preserves previous snapshot when refresh fails', async () => {
    mockListNodeChildren.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'libs') {
        return {
          list: {
            entries: [{ entry: { id: 'good', name: 'sample.js', modifiedAt: '2026-01-01' } }],
          },
        };
      }
      return pathChainResponse(nodeId);
    });

    mockGetNodeContent.mockResolvedValue(`/**
 * @description Sample lib.
 */
logger.log(1);`);

    const service = createService();
    await service.refresh(1, 9);
    const before = await service.getSnapshot(1, 9);
    expect(before.manifest['custom_sample']).toBeDefined();

    vi.mocked(getAuthenticatedClientWithRefresh).mockRejectedValueOnce(new Error('auth failed'));

    const failed = await service.refresh(1, 9);
    expect(failed.ok).toBe(false);

    const after = await service.getSnapshot(1, 9);
    expect(after.manifest['custom_sample']).toBeDefined();
  });
});
