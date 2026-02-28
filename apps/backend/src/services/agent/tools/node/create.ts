/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const normalizeNodePath = (p: string | undefined): string | null =>
  p?.trim().length ? p.trim() : null;

const CREATE_NODE_API_PATH_TEMPLATE = '/alfresco/api/-default-/public/alfresco/versions/1/nodes/{parentId}/children';

export const nodeCreateTool: ToolDefinition = {
  name: 'node_create',
  description:
    'Create a node under a parent folder. Supports setting nodeType and properties. Requires explicit user confirmation.',
  inputSchema: {
    type: 'object',
    properties: {
      parentId: { type: 'string', description: 'Parent folder node ID where the new node will be created' },
      name: { type: 'string', description: 'Name of the new node' },
      nodeType: {
        type: 'string',
        description: 'Alfresco type QName, e.g. cm:content or cm:folder. Default: cm:content.',
      },
      properties: {
        type: 'object',
        description: 'Optional Alfresco properties map (QName keys), e.g. {"cm:title":"My title"}',
      },
      autoRename: {
        type: 'boolean',
        description: 'If true, Alfresco will auto-rename on name collisions.',
      },
    },
    required: ['parentId', 'name'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const parentId = typeof args.parentId === 'string' ? args.parentId.trim() : '';
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!parentId || !name) {
        return { ok: false, error: 'parentId and name are required' };
      }

      const nodeType = typeof args.nodeType === 'string' && args.nodeType.trim() ? args.nodeType.trim() : 'cm:content';
      const properties =
        args.properties && typeof args.properties === 'object' && !Array.isArray(args.properties)
          ? (args.properties as Record<string, unknown>)
          : undefined;
      const autoRename = Boolean(args.autoRename);

      const requestBody: Record<string, unknown> = {
        name,
        nodeType,
        ...(properties ? { properties } : {}),
      };
      const requestQuery = {
        autoRename,
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
        include: ['path', 'properties'],
      };

      const nodesApi = new NodesApi(ctx.api);
      const result = await (nodesApi as any).createNode(parentId, requestBody, requestQuery);
      const e = (result as any)?.entry ?? result;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path: CREATE_NODE_API_PATH_TEMPLATE.replace('{parentId}', parentId),
            request: { body: requestBody, query: requestQuery },
            responseBody: result,
          },
          created: {
            id: e?.id,
            name: e?.name,
            nodeType: e?.nodeType,
            isFolder: e?.isFolder,
            isFile: e?.isFile,
            path: normalizeNodePath(e?.path?.name),
            mimeType: e?.content?.mimeType ?? null,
            properties: e?.properties ?? null,
          },
          parentId,
          autoRename,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

