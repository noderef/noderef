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

import { AssociationBody, ChildAssociationBody, NodesApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeSecondaryChildrenPath,
  getAlfrescoNodeTargetsPath,
  getAlfrescoNodeTargetPath,
  getAlfrescoNodeSecondaryChildPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

type AssocAction = 'add_peer' | 'remove_peer' | 'add_secondary' | 'remove_secondary';

export const associationManageTool: ToolDefinition = {
  name: 'association_manage',
  description:
    'Create or remove peer (target) associations and secondary child associations between nodes.',
  skill: { kind: 'local_md', path: '../skills/association_manage.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add_peer', 'remove_peer', 'add_secondary', 'remove_secondary'],
      },
      nodeId: { type: 'string', description: 'Source node UUID' },
      targetId: { type: 'string', description: 'Target node id (peer) or child id (secondary)' },
      assocType: {
        type: 'string',
        description:
          'Association QName (e.g. cm:contains) — required for add_*; optional for remove_peer',
      },
    },
    required: ['action', 'nodeId', 'targetId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const action = (typeof args.action === 'string' ? args.action.trim() : '') as AssocAction;
      const valid: AssocAction[] = ['add_peer', 'remove_peer', 'add_secondary', 'remove_secondary'];
      if (!valid.includes(action)) {
        return { ok: false, error: `action must be one of: ${valid.join(', ')}` };
      }

      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      const targetId = typeof args.targetId === 'string' ? args.targetId.trim() : '';
      const assocType = typeof args.assocType === 'string' ? args.assocType.trim() : '';

      if (!nodeId || !targetId) {
        return { ok: false, error: 'nodeId and targetId are required' };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const nodesApi = new NodesApi(ctx.api);

      if (action === 'add_peer') {
        if (!assocType) {
          return { ok: false, error: 'assocType is required for add_peer' };
        }
        const path = getAlfrescoNodeTargetsPath(nodeId);
        const body = new AssociationBody({ targetId, assocType });
        const result = await nodesApi.createAssociation(nodeId, body as any);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'POST',
              path,
              request: { body: { targetId, assocType } },
              responseBody: result,
            },
            action,
            result,
          },
        };
      }

      if (action === 'remove_peer') {
        const path = getAlfrescoNodeTargetPath(nodeId, targetId);
        await nodesApi.deleteAssociation(nodeId, targetId, assocType ? { assocType } : {});
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'DELETE',
              path,
              request: { query: assocType ? { assocType } : {} },
              responseBody: null,
            },
            action,
            nodeId,
            targetId,
          },
        };
      }

      if (action === 'add_secondary') {
        if (!assocType) {
          return { ok: false, error: 'assocType is required for add_secondary' };
        }
        const path = getAlfrescoNodeSecondaryChildrenPath(nodeId);
        const body = new ChildAssociationBody({ childId: targetId, assocType });
        const result = await nodesApi.createSecondaryChildAssociation(nodeId, body as any);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'POST',
              path,
              request: { body: { childId: targetId, assocType } },
              responseBody: result,
            },
            action,
            result,
          },
        };
      }

      const path = getAlfrescoNodeSecondaryChildPath(nodeId, targetId);
      await nodesApi.deleteSecondaryChildAssociation(nodeId, targetId, {});
      return {
        ok: true,
        data: {
          apiTrace: { method: 'DELETE', path, request: {}, responseBody: null },
          action,
          nodeId,
          childId: targetId,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
