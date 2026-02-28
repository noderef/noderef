/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../types.js';
import type { ToolDefinition, ToolResult } from './types.js';

const normalizeNodePath = (p: string | undefined): string | null =>
  p?.trim().length ? p.trim() : null;

export const getNodeTool: ToolDefinition = {
  name: 'get_node',
  description:
    'Fetch metadata for a single Alfresco node by ID. Returns name, path, type, dates, and properties.',
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

      const nodesApi = new NodesApi(ctx.api);
      const result = await nodesApi.getNode(nodeId, {
        fields: [
          'id',
          'name',
          'nodeType',
          'isFolder',
          'isFile',
          'path',
          'content',
          'properties',
          'createdAt',
          'modifiedAt',
          'createdByUser',
          'modifiedByUser',
        ],
        include: ['path', 'properties', 'allowableOperations'],
      });

      const e = (result as any)?.entry ?? result;
      return {
        ok: true,
        data: {
          id: e?.id,
          name: e?.name,
          nodeType: e?.nodeType,
          isFolder: e?.isFolder,
          isFile: e?.isFile,
          path: normalizeNodePath(e?.path?.name),
          mimeType: e?.content?.mimeType ?? null,
          createdAt: e?.createdAt,
          modifiedAt: e?.modifiedAt,
          createdBy: e?.createdByUser?.displayName ?? e?.createdByUser?.id,
          modifiedBy: e?.modifiedByUser?.displayName ?? e?.modifiedByUser?.id,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
