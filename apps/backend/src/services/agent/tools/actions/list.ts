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

import { ActionsApi } from '@alfresco/js-api';
import {
  getAlfrescoActionDefinitionsPath,
  getAlfrescoNodeActionDefinitionsPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const actionListTool: ToolDefinition = {
  name: 'action_list',
  description:
    'List repository action definitions globally, or actions applicable to a specific node.',
  skill: { kind: 'local_md', path: '../skills/action_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description:
          'If set, list action definitions for this node; otherwise list global definitions',
      },
      maxItems: { type: 'number', description: 'Page size (default 50, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset' },
    },
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 50, maxCap: 100 });
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      const query = { skipCount, maxItems };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const actionsApi = new ActionsApi(ctx.api);

      if (nodeId) {
        const path = getAlfrescoNodeActionDefinitionsPath(nodeId);
        const payload = await actionsApi.nodeActions(nodeId, query);
        return {
          ok: true,
          data: {
            apiTrace: { method: 'GET', path, request: { query }, responseBody: payload },
            scope: 'node',
            nodeId,
            list: (payload as any)?.list ?? payload,
          },
        };
      }

      const path = getAlfrescoActionDefinitionsPath();
      const payload = await actionsApi.listActions(query);
      return {
        ok: true,
        data: {
          apiTrace: { method: 'GET', path, request: { query }, responseBody: payload },
          scope: 'global',
          list: (payload as any)?.list ?? payload,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
