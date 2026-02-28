/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const normalizeNodePath = (p: string | undefined): string | null =>
  p?.trim().length ? p.trim() : null;

const CONTENT_API_PATH_TEMPLATE = '/alfresco/api/-default-/public/alfresco/versions/1/nodes/{nodeId}/content';
const NODE_API_PATH_TEMPLATE = '/alfresco/api/-default-/public/alfresco/versions/1/nodes/{nodeId}';
const MAX_TRACE_CONTENT_CHARS = 4000;

function buildContentRequestPreview(content: string): Record<string, unknown> {
  if (content.length <= MAX_TRACE_CONTENT_CHARS) {
    return { content, chars: content.length, truncated: false };
  }
  return {
    contentPreview: content.slice(0, MAX_TRACE_CONTENT_CHARS),
    chars: content.length,
    truncated: true,
    truncatedChars: content.length - MAX_TRACE_CONTENT_CHARS,
  };
}

export const nodeUpdateContentTool: ToolDefinition = {
  name: 'node_update_content',
  description:
    'Update file content for an existing node using PUT /nodes/{nodeId}/content. Useful after node_create when you need to set or replace text content. Requires explicit user confirmation.',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID of the file to update' },
      content: { type: 'string', description: 'New text content for the node' },
      majorVersion: {
        type: 'boolean',
        description: 'Optional versioning hint. If true, store as a major version when supported.',
      },
      comment: {
        type: 'string',
        description: 'Optional version comment when updating content.',
      },
    },
    required: ['nodeId', 'content'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }
      if (typeof args.content !== 'string') {
        return { ok: false, error: 'content must be a string' };
      }

      const content = args.content;
      const requestQuery: Record<string, unknown> = {};
      if (typeof args.majorVersion === 'boolean') {
        requestQuery.majorVersion = args.majorVersion;
      }
      if (typeof args.comment === 'string' && args.comment.trim()) {
        requestQuery.comment = args.comment.trim();
      }

      const nodesApi = new NodesApi(ctx.api);
      const updateResult =
        Object.keys(requestQuery).length > 0
          ? await (nodesApi as any).updateNodeContent(nodeId, content, requestQuery)
          : await (nodesApi as any).updateNodeContent(nodeId, content);

      const readBackQuery = {
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
        include: ['path', 'properties'],
      };
      const readBackResult = await nodesApi.getNode(nodeId, readBackQuery);
      const entry = (readBackResult as any)?.entry ?? readBackResult;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path: CONTENT_API_PATH_TEMPLATE.replace('{nodeId}', nodeId),
            request: {
              body: buildContentRequestPreview(content),
              ...(Object.keys(requestQuery).length > 0 ? { query: requestQuery } : {}),
            },
            responseBody: updateResult,
            followUp: {
              method: 'GET',
              path: NODE_API_PATH_TEMPLATE.replace('{nodeId}', nodeId),
              request: { query: readBackQuery },
              responseBody: readBackResult,
            },
          },
          updated: {
            id: entry?.id,
            name: entry?.name,
            nodeType: entry?.nodeType,
            isFolder: entry?.isFolder,
            isFile: entry?.isFile,
            path: normalizeNodePath(entry?.path?.name),
            mimeType: entry?.content?.mimeType ?? null,
            properties: entry?.properties ?? null,
          },
          nodeId,
          contentChars: content.length,
          contentEmpty: content.length === 0,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
