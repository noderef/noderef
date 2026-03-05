/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { ALFRESCO_NODE_PATH_TEMPLATE, getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeDeleteTool: ToolDefinition = {
  name: 'node_delete',
  description:
    'Delete one or more nodes, moving to trash by default unless permanent deletion is requested.',
  skill: { kind: 'local_md', path: '../skills/node_delete.md', version: 1 },
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
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeIds = Array.isArray(args.nodeIds)
        ? args.nodeIds.map(id => String(id).trim()).filter(Boolean)
        : [];
      if (!nodeIds.length) return { ok: false, error: 'At least one nodeId is required' };
      const permanent = Boolean(args.permanent);

      const nodesApi = new NodesApi(ctx.api);
      const deleted: string[] = [];
      const callTrace: Array<{
        method: 'DELETE';
        path: string;
        request: { query: { permanent: boolean } };
        responseBody: null;
      }> = [];
      for (const nodeId of nodeIds) {
        if (ctx.signal.aborted) throw new Error('Run was cancelled');
        await nodesApi.deleteNode(nodeId, { permanent });
        deleted.push(nodeId);
        callTrace.push({
          method: 'DELETE',
          path: getAlfrescoNodePath(nodeId),
          request: { query: { permanent } },
          responseBody: null,
        });
      }

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'DELETE',
            path: ALFRESCO_NODE_PATH_TEMPLATE,
            request: { query: { permanent }, nodeIds },
            responseBody: callTrace,
          },
          deleted,
          permanent,
          totalDeleted: deleted.length,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
