/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { extractPermissionsState } from '../helpers/permissionsHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const permissionsGetTool: ToolDefinition = {
  name: 'permissions_get',
  description: 'Get effective and local permissions for a node, including inheritance state.',
  skill: { kind: 'local_md', path: '../skills/permissions_get.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID (UUID) to inspect permissions for' },
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

      const requestQuery = {
        fields: ['id', 'name', 'path', 'permissions'],
        include: ['path', 'permissions'],
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const nodesApi = new NodesApi(ctx.api);
      const result = await nodesApi.getNode(nodeId, requestQuery);
      const entry = (result as any)?.entry ?? result;
      const permissionsState = extractPermissionsState(entry, nodeId);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoNodePath(nodeId),
            request: { query: requestQuery },
            responseBody: result,
          },
          nodeId: permissionsState.nodeId,
          name: permissionsState.name,
          path: permissionsState.path,
          isInheritanceEnabled: permissionsState.isInheritanceEnabled,
          localPermissions: permissionsState.localPermissions,
          inheritedPermissions: permissionsState.inheritedPermissions,
          settablePermissions: permissionsState.settablePermissions,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
