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

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodeUnlockPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeUnlockTool: ToolDefinition = {
  name: 'node_unlock',
  description: 'Unlock a node (POST /nodes/{nodeId}/unlock).',
  skill: { kind: 'local_md', path: '../skills/node_unlock.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node UUID' },
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

      const nodesApi = new NodesApi(ctx.api);
      const path = getAlfrescoNodeUnlockPath(nodeId);
      const result = await nodesApi.unlockNode(nodeId, {});

      return {
        ok: true,
        data: {
          apiTrace: { method: 'POST', path, request: {}, responseBody: result },
          node: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
