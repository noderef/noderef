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

import type { NodeBodyLock } from '@alfresco/js-api';
import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodeLockPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeLockTool: ToolDefinition = {
  name: 'node_lock',
  description: 'Lock a node (POST /nodes/{nodeId}/lock) with optional expiry, type, and lifetime.',
  skill: { kind: 'local_md', path: '../skills/node_lock.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node UUID' },
      timeToExpire: { type: 'number', description: 'Lock duration in seconds (server-dependent)' },
      type: {
        type: 'string',
        description: 'Lock type, e.g. ALLOW_OWNER_CHANGES or FULL',
      },
      lifetime: {
        type: 'string',
        description: 'PERSISTENT or EPHEMERAL',
      },
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

      const body: NodeBodyLock = {};
      if (typeof args.timeToExpire === 'number' && Number.isFinite(args.timeToExpire)) {
        body.timeToExpire = args.timeToExpire;
      }
      if (typeof args.type === 'string' && args.type.trim()) {
        body.type = args.type.trim();
      }
      if (typeof args.lifetime === 'string' && args.lifetime.trim()) {
        body.lifetime = args.lifetime.trim();
      }
      if (!body.type && body.timeToExpire === undefined && !body.lifetime) {
        body.type = 'ALLOW_OWNER_CHANGES';
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const nodesApi = new NodesApi(ctx.api);
      const path = getAlfrescoNodeLockPath(nodeId);
      const result = await nodesApi.lockNode(nodeId, body);

      return {
        ok: true,
        data: {
          apiTrace: { method: 'POST', path, request: { body }, responseBody: result },
          node: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
