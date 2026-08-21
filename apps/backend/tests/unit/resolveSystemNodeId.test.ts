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

import { describe, expect, it, vi } from 'vitest';
import { resolveSystemNodeId } from '../../src/rpc/backend/helpers.js';

function childrenResult(
  entries: Array<{ id: string; name: string }>
): { list: { entries: Array<{ entry: { id: string; name: string } }> } } {
  return {
    list: {
      entries: entries.map(entry => ({ entry })),
    },
  };
}

function parentsResult(id: string) {
  return {
    list: {
      entries: [{ entry: { id, name: 'workspace://SpacesStore' } }],
    },
  };
}

describe('resolveSystemNodeId', () => {
  it('finds sys:system via listParents when Company Home hides parentId', async () => {
    const nodesApi = {
      getNode: vi.fn(async () => ({
        entry: { id: 'company-home-id' },
      })),
      listParents: vi.fn(async () => parentsResult('store-root-id')),
      listNodeChildren: vi.fn(async () =>
        childrenResult([
          { id: 'company-home-id', name: 'Company Home' },
          { id: 'system-node-id', name: 'system' },
        ])
      ),
    };

    await expect(resolveSystemNodeId(nodesApi)).resolves.toBe('system-node-id');
    expect(nodesApi.listParents).toHaveBeenCalledWith('-root-', {
      where: '(isPrimary=true)',
      maxItems: 10,
    });
    expect(nodesApi.listNodeChildren).toHaveBeenCalledWith('store-root-id', {
      where: "(assocType='sys:children')",
      maxItems: 200,
    });
  });

  it('uses parentId when Alfresco does expose the store root', async () => {
    const nodesApi = {
      getNode: vi.fn(async () => ({
        entry: { id: 'company-home-id', parentId: 'store-root-id' },
      })),
      listParents: vi.fn(),
      listNodeChildren: vi.fn(async () =>
        childrenResult([{ id: 'system-node-id', name: 'System' }])
      ),
    };

    await expect(resolveSystemNodeId(nodesApi)).resolves.toBe('system-node-id');
    expect(nodesApi.listParents).not.toHaveBeenCalled();
  });

  it('does not pick a Company Home folder named system', async () => {
    const nodesApi = {
      getNode: vi.fn(async () => ({
        entry: { id: 'company-home-id' },
      })),
      listParents: vi.fn(async () => parentsResult('store-root-id')),
      listNodeChildren: vi.fn(async (nodeId: string, opts?: { where?: string }) => {
        const sysChildren = opts?.where?.includes("assocType='sys:children'");
        if (nodeId === 'store-root-id') {
          return childrenResult([{ id: 'company-home-id', name: 'Company Home' }]);
        }
        // Company Home uses cm:contains, so sys:children is empty.
        if (sysChildren) {
          return childrenResult([]);
        }
        return childrenResult([{ id: 'user-system-folder', name: 'system' }]);
      }),
    };

    await expect(resolveSystemNodeId(nodesApi)).resolves.toBeNull();
  });

  it('falls back to slingshot parent walk when Nodes listing hides sys:system', async () => {
    const nodesApi = {
      getNode: vi.fn(async () => ({
        entry: { id: 'company-home-id' },
      })),
      listParents: vi.fn(async () => {
        throw new Error('Forbidden');
      }),
      listNodeChildren: vi.fn(async () => childrenResult([])),
    };
    const fetchSlingshotNode = vi.fn(async (nodeId: string) => {
      if (nodeId === 'company-home-id') {
        return {
          parents: [{ primary: true, nodeRef: 'workspace://SpacesStore/store-root-id' }],
        };
      }
      return {
        children: [
          {
            nodeRef: 'workspace://SpacesStore/system-node-id',
            name: { prefixedName: 'sys:system', name: 'system' },
          },
        ],
      };
    });

    await expect(resolveSystemNodeId(nodesApi, { fetchSlingshotNode })).resolves.toBe(
      'system-node-id'
    );
    expect(fetchSlingshotNode).toHaveBeenCalledWith('company-home-id');
    expect(fetchSlingshotNode).toHaveBeenCalledWith('store-root-id');
  });

  it('falls back to AFTS when Nodes and slingshot cannot find the node', async () => {
    const nodesApi = {
      getNode: vi.fn(async () => ({
        entry: { id: 'company-home-id' },
      })),
      listParents: vi.fn(async () => parentsResult('store-root-id')),
      listNodeChildren: vi.fn(async () => childrenResult([])),
    };
    const searchApi = {
      search: vi.fn(async () => ({
        list: { entries: [{ entry: { id: 'system-from-search' } }] },
      })),
    };

    await expect(resolveSystemNodeId(nodesApi, { searchApi })).resolves.toBe('system-from-search');
    expect(searchApi.search).toHaveBeenCalledWith({
      query: { query: 'PATH:"/sys:system"', language: 'afts' },
      fields: ['id'],
    });
  });
});
