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
  buildNodeMetadataQuery,
  normalizeAllowableOperations,
  toNodeSummary,
} from '../../src/services/agent/tools/helpers/nodeResultHelpers.js';

describe('normalizeAllowableOperations', () => {
  it('keeps a string array, including an empty list', () => {
    expect(normalizeAllowableOperations(['update', 'delete'])).toEqual(['update', 'delete']);
    expect(normalizeAllowableOperations([])).toEqual([]);
  });

  it('drops non-string entries and trims values', () => {
    expect(normalizeAllowableOperations(['update', 1, null, ' delete '])).toEqual([
      'update',
      'delete',
    ]);
  });

  it('returns null for objects and missing values (Alfresco uses a string array, not a record)', () => {
    expect(normalizeAllowableOperations({ update: true })).toBeNull();
    expect(normalizeAllowableOperations(undefined)).toBeNull();
    expect(normalizeAllowableOperations('update')).toBeNull();
  });
});

describe('toNodeSummary', () => {
  it('surfaces allowableOperations from a node entry', () => {
    expect(
      toNodeSummary({
        id: 'n1',
        name: 'Doc',
        nodeType: 'cm:content',
        isFolder: false,
        isFile: true,
        allowableOperations: ['update'],
      }).allowableOperations
    ).toEqual(['update']);
  });
});

describe('buildNodeMetadataQuery', () => {
  it('requests allowableOperations in both fields and include', () => {
    const query = buildNodeMetadataQuery();
    expect(query.fields).toContain('allowableOperations');
    expect(query.include).toContain('allowableOperations');
  });
});
