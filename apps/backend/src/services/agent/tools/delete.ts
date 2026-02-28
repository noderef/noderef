/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../types.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const deleteTool: ToolDefinition = {
  name: 'delete_nodes',
  description:
    'Delete one or more nodes. Destructive — moves to trash by default. Requires typing DELETE to confirm.',
  inputSchema: {
    type: 'object',
    properties: {
      nodeIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of node IDs to delete',
      },
      permanent: {
        type: 'boolean',
        description: 'If true, permanently delete (skip trash). Default: false.',
      },
    },
    required: ['nodeIds'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'DELETE' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeIds = Array.isArray(args.nodeIds)
        ? args.nodeIds.map(id => String(id).trim()).filter(Boolean)
        : [];
      if (!nodeIds.length) return { ok: false, error: 'At least one nodeId is required' };
      const permanent = Boolean(args.permanent);

      const nodesApi = new NodesApi(ctx.api);
      const deleted: string[] = [];
      for (const nodeId of nodeIds) {
        if (ctx.signal.aborted) throw new Error('Run was cancelled');
        await nodesApi.deleteNode(nodeId, { permanent });
        deleted.push(nodeId);
      }

      return { ok: true, data: { deleted, permanent, totalDeleted: deleted.length } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
