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

import { TrashcanApi } from '@alfresco/js-api';
import { getAlfrescoDeletedNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const trashcanPurgeTool: ToolDefinition = {
  name: 'trashcan_purge',
  description: 'Permanently delete a node from the trashcan (cannot be undone).',
  skill: { kind: 'local_md', path: '../skills/trashcan_purge.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Deleted node id (UUID) in trashcan' },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const trashApi = new TrashcanApi(ctx.api);
      const path = getAlfrescoDeletedNodePath(nodeId);
      await trashApi.deleteDeletedNode(nodeId);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'DELETE',
            path,
            request: {},
            responseBody: null,
          },
          nodeId,
          purged: true,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
