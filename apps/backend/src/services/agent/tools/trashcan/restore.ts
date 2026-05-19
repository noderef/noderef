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
import { getAlfrescoDeletedNodeRestorePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const trashcanRestoreTool: ToolDefinition = {
  name: 'trashcan_restore',
  description:
    'Restore a deleted node from the trashcan to its original or a new parent (targetParentId).',
  skill: { kind: 'local_md', path: '../skills/trashcan_restore.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Deleted node id (UUID) from trashcan_list' },
      targetParentId: {
        type: 'string',
        description: 'Optional parent folder node id; omit to restore to original location',
      },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }
      const targetParentId =
        typeof args.targetParentId === 'string' ? args.targetParentId.trim() : '';

      const deletedNodeBodyRestore =
        targetParentId ? ({ targetParentId } as Record<string, unknown>) : undefined;

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const trashApi = new TrashcanApi(ctx.api);
      const path = getAlfrescoDeletedNodeRestorePath(nodeId);
      const result = await trashApi.restoreDeletedNode(
        nodeId,
        deletedNodeBodyRestore ? { deletedNodeBodyRestore } : {}
      );

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path,
            request: { body: deletedNodeBodyRestore ?? {} },
            responseBody: result,
          },
          node: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
