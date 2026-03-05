/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { buildNodeMetadataQuery, toNodeSummary } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeUpdateTool: ToolDefinition = {
  name: 'node_update',
  description: 'Update node metadata such as name and properties.',
  skill: { kind: 'local_md', path: '../skills/node_update.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to update' },
      name: { type: 'string', description: 'Optional new node name' },
      properties: {
        type: 'object',
        description: 'Optional properties map to update, e.g. {"cm:title":"Updated title"}',
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

      const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : undefined;
      const properties =
        args.properties && typeof args.properties === 'object' && !Array.isArray(args.properties)
          ? (args.properties as Record<string, unknown>)
          : undefined;

      if (!name && !properties) {
        return { ok: false, error: 'At least one of name or properties must be provided' };
      }

      const requestBody: Record<string, unknown> = {
        ...(name ? { name } : {}),
        ...(properties ? { properties } : {}),
      };
      const requestQuery = buildNodeMetadataQuery();

      const nodesApi = new NodesApi(ctx.api);
      const result = await (nodesApi as any).updateNode(nodeId, requestBody, requestQuery);
      const e = (result as any)?.entry ?? result;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path: getAlfrescoNodePath(nodeId),
            request: { body: requestBody, query: requestQuery },
            responseBody: result,
          },
          updated: toNodeSummary(e),
          nodeId,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
