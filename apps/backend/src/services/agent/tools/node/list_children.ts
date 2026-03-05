/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodeChildrenPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { toNodeSummary } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeListChildrenTool: ToolDefinition = {
  name: 'node_list_children',
  description: 'List direct children of a folder with pagination totals and a sampled result list.',
  skill: { kind: 'local_md', path: '../skills/node_list_children.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Parent folder node ID' },
      maxItems: {
        type: 'number',
        description: 'Max children to return in sample (1–200, default 20)',
      },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) return { ok: false, error: 'nodeId is required' };
      const maxItems =
        typeof args.maxItems === 'number' && Number.isFinite(args.maxItems)
          ? Math.max(1, Math.min(Math.floor(args.maxItems), 200))
          : 20;

      const nodesApi = new NodesApi(ctx.api);
      const requestQuery = {
        maxItems,
        skipCount: 0,
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'content', 'path'],
        include: ['path'],
      };

      const result = await nodesApi.listNodeChildren(nodeId, requestQuery);

      const entries = (result.list?.entries ?? []).map((e: any) => e.entry);
      const totalCount = result.list?.pagination?.totalItems ?? entries.length;
      const extensionMap = new Map<string, number>();
      for (const e of entries) {
        if (!e?.isFile || !e?.name?.includes('.')) continue;
        const ext = e.name.split('.').pop()?.toLowerCase();
        if (ext) extensionMap.set(ext, (extensionMap.get(ext) ?? 0) + 1);
      }

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoNodeChildrenPath(nodeId),
            request: { query: requestQuery },
            responseBody: result,
          },
          alfrescoNodesApi: {
            method: 'GET',
            path: getAlfrescoNodeChildrenPath(nodeId),
            query: requestQuery,
            responseBody: result,
          },
          nodeId,
          pagination: { totalCount, returned: entries.length, maxItems },
          breakdown: {
            files: entries.filter((e: any) => e?.isFile).length,
            folders: entries.filter((e: any) => e?.isFolder).length,
          },
          extensions: Array.from(extensionMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ext, count]) => ({ ext, count })),
          sample: entries.map((e: any) => toNodeSummary(e)),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
