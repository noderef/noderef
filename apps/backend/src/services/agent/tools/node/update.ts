/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const normalizeNodePath = (p: string | undefined): string | null =>
  p?.trim().length ? p.trim() : null;

export const nodeUpdateTool: ToolDefinition = {
  name: 'node_update',
  description:
    'Update metadata for an existing node (name and/or properties). Requires explicit user confirmation.',
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
      const requestQuery = {
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
        include: ['path', 'properties'],
      };

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
          updated: {
            id: e?.id,
            name: e?.name,
            nodeType: e?.nodeType,
            isFolder: e?.isFolder,
            isFile: e?.isFile,
            path: normalizeNodePath(e?.path?.name),
            mimeType: e?.content?.mimeType ?? null,
            properties: e?.properties ?? null,
          },
          nodeId,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
