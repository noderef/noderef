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
import { emptyCatalog, mapTools } from '../../../src/services/agentGateway/mcpCatalog.js';

describe('mcpCatalog', () => {
  it('drops non-object schemas and strips $schema', () => {
    const mapped = mapTools(
      [
        {
          name: 'good',
          description: 'ok',
          inputSchema: { type: 'object', $schema: 'https://json-schema.org/draft-07/schema', properties: {} },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        {
          name: 'bad',
          inputSchema: { type: 'string' },
        },
      ],
      new Set()
    );
    expect(mapped.dropped).toEqual(['bad']);
    expect(mapped.tools).toHaveLength(1);
    expect(mapped.tools[0].modelName).toBe('mcp_good');
    expect(mapped.tools[0].inputSchema.$schema).toBeUndefined();
    expect(mapped.tools[0].policy).toBe('read');
  });

  it('returns an empty catalog for a gateway status', () => {
    expect(emptyCatalog('disabled').status).toBe('disabled');
    expect(emptyCatalog('disabled').tools).toEqual([]);
  });
});
