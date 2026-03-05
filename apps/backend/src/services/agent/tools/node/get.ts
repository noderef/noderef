/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { isRecord, normalizeNodePath } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeGetTool: ToolDefinition = {
  name: 'node_get',
  description: 'Fetch metadata for a single node by ID, including path, type, and properties.',
  skill: { kind: 'local_md', path: '../skills/node_get.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID (UUID)' },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) return { ok: false, error: 'nodeId is required' };

      const requestQuery = {
        fields: [
          'id',
          'name',
          'nodeType',
          'isFolder',
          'isFile',
          'path',
          'content',
          'aspectNames',
          'properties',
          'createdAt',
          'modifiedAt',
          'createdByUser',
          'modifiedByUser',
        ],
        include: ['path', 'properties', 'allowableOperations'],
      };

      const nodesApi = new NodesApi(ctx.api);
      const result = await nodesApi.getNode(nodeId, requestQuery);
      const e = (result as any)?.entry ?? result;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoNodePath(nodeId),
            request: { query: requestQuery },
            responseBody: result,
          },
          alfrescoNodesApi: {
            method: 'GET',
            path: getAlfrescoNodePath(nodeId),
            query: requestQuery,
            responseBody: result,
          },
          id: e?.id,
          name: e?.name,
          nodeType: e?.nodeType,
          isFolder: e?.isFolder,
          isFile: e?.isFile,
          path: normalizeNodePath(e?.path?.name),
          mimeType: e?.content?.mimeType ?? null,
          aspectNames: Array.isArray(e?.aspectNames) ? e.aspectNames : null,
          createdAt: e?.createdAt,
          modifiedAt: e?.modifiedAt,
          createdBy: e?.createdByUser?.displayName ?? e?.createdByUser?.id,
          modifiedBy: e?.modifiedByUser?.displayName ?? e?.modifiedByUser?.id,
          properties: isRecord(e?.properties) ? e.properties : null,
          allowableOperations: isRecord(e?.allowableOperations) ? e.allowableOperations : null,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
