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
import type { McpCatalog, McpToolSummary } from '@app/contracts';
import {
  defaultMcpSelection,
  emptyStateForStatus,
  filterTools,
  indicatorColor,
  schemaPropertyNames,
} from './mcpPanelModel';

const tool = (overrides: Partial<McpToolSummary>): McpToolSummary => ({
  name: 'echo_read',
  modelName: 'mcp_echo_read',
  title: 'Echo',
  description: 'Read-only echo',
  inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
  annotations: { readOnlyHint: true },
  policy: 'read',
  ...overrides,
});

const catalog = (tools: McpToolSummary[]): McpCatalog => ({
  status: 'connected',
  serverInfo: { name: 'gw', version: '1.6.0' },
  protocolVersion: '2025-11-25',
  capabilities: { tools: true, prompts: true, resources: true },
  tools,
  prompts: [],
  resources: [],
  resourceTemplates: [],
  fetchedAt: new Date().toISOString(),
  truncated: false,
});

describe('mcpPanelModel', () => {
  it('selects only read tools by default', () => {
    const selection = defaultMcpSelection(
      catalog([
        tool({ name: 'echo_read', policy: 'read' }),
        tool({ name: 'echo_write', policy: 'write' }),
      ])
    );
    expect(selection).toEqual({ enabled: true, tools: ['echo_read'] });
  });

  it('filters tools by name, title, and description', () => {
    const tools = [
      tool({ name: 'echo_read', modelName: 'mcp_echo_read', title: 'Echo' }),
      tool({ name: 'fail_tool', modelName: 'mcp_fail_tool', title: 'Fail', description: 'Always errors' }),
    ];
    expect(filterTools(tools, 'fail')).toHaveLength(1);
    expect(filterTools(tools, 'echo')).toHaveLength(1);
  });

  it('maps gateway status to empty-state keys and indicator colors', () => {
    expect(emptyStateForStatus(null)).toBe('notConfigured');
    expect(emptyStateForStatus('environment_mismatch')).toBe('environmentMismatch');
    expect(indicatorColor('connected', true)).toBe('green');
    expect(indicatorColor('unauthorized', true)).toBe('red');
    expect(indicatorColor('connected', false)).toBe('gray');
  });

  it('lists object schema property names', () => {
    expect(schemaPropertyNames({ type: 'object', properties: { a: {}, b: {} } })).toEqual([
      'a',
      'b',
    ]);
    expect(schemaPropertyNames(undefined)).toEqual([]);
  });
});
