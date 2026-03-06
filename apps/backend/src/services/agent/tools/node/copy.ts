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
import { getAlfrescoNodeCopyPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { normalizeNodePath } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeCopyTool: ToolDefinition = {
  name: 'node_copy',
  description: 'Copy a node to a different parent folder.',
  skill: { kind: 'local_md', path: '../skills/node_copy.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      sourceNodeId: { type: 'string', description: 'ID of the node to copy' },
      targetParentId: { type: 'string', description: 'ID of the target parent folder' },
    },
    required: ['sourceNodeId', 'targetParentId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const sourceNodeId = typeof args.sourceNodeId === 'string' ? args.sourceNodeId.trim() : '';
      const targetParentId =
        typeof args.targetParentId === 'string' ? args.targetParentId.trim() : '';
      if (!sourceNodeId || !targetParentId) {
        return { ok: false, error: 'sourceNodeId and targetParentId are required' };
      }
      const nodesApi = new NodesApi(ctx.api);
      const requestBody = { targetParentId };
      const requestQuery = { fields: ['id', 'name', 'path'] };
      const result = await nodesApi.copyNode(sourceNodeId, requestBody, requestQuery);
      const e = (result as any)?.entry ?? result;
      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path: getAlfrescoNodeCopyPath(sourceNodeId),
            request: {
              body: requestBody,
              query: requestQuery,
            },
            responseBody: result,
          },
          copied: { id: e?.id, name: e?.name, path: normalizeNodePath(e?.path?.name) },
          sourceNodeId,
          targetParentId,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
