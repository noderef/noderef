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
import { mapNodeEntryToRepositoryNode } from '../../src/rpc/backend/helpers.js';

describe('mapNodeEntryToRepositoryNode', () => {
  it('keeps allowableOperations when Alfresco returns them', () => {
    const mapped = mapNodeEntryToRepositoryNode({
      id: 'abc-123',
      name: 'Report.pdf',
      isFolder: false,
      isFile: true,
      nodeType: 'cm:content',
      allowableOperations: ['update', 'delete'],
    });

    expect(mapped.allowableOperations).toEqual(['update', 'delete']);
  });

  it('maps omitted allowableOperations to an empty list', () => {
    const mapped = mapNodeEntryToRepositoryNode({
      id: 'abc-123',
      name: 'Templates',
      isFolder: true,
      isFile: false,
      nodeType: 'cm:folder',
    });

    expect(mapped.allowableOperations).toEqual([]);
  });
});
