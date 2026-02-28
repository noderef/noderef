/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../types.js';
import type { ToolDefinition, ToolResult } from './types.js';

const normalizeNodePath = (p: string | undefined): string | null =>
  p?.trim().length ? p.trim() : null;

export const getChildrenTool: ToolDefinition = {
  name: 'get_children',
  description: [
    'List the direct children of a folder node.',
    'Returns pagination.totalCount (TRUE total children count) and a sample of child nodes.',
    'Use this when the user asks "what is in folder X?" or "show me the contents of X".',
  ].join(' '),
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
      const result = await nodesApi.listNodeChildren(nodeId, {
        maxItems,
        skipCount: 0,
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'content', 'path'],
        include: ['path'],
      });

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
          sample: entries.map((e: any) => ({
            id: e.id,
            name: e.name,
            nodeType: e.nodeType,
            isFolder: e.isFolder,
            isFile: e.isFile,
            path: normalizeNodePath(e.path?.name),
            mimeType: e.content?.mimeType ?? null,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
