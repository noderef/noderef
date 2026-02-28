/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const normalizeNodePath = (p: string | undefined): string | null =>
  p?.trim().length ? p.trim() : null;

const CREATE_NODE_API_PATH_TEMPLATE = '/alfresco/api/-default-/public/alfresco/versions/1/nodes/{parentId}/children';
const GET_NODE_API_PATH_TEMPLATE = '/alfresco/api/-default-/public/alfresco/versions/1/nodes/{nodeId}';
const UPDATE_CONTENT_API_PATH_TEMPLATE = '/alfresco/api/-default-/public/alfresco/versions/1/nodes/{nodeId}/content';
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

export const nodeCreateTool: ToolDefinition = {
  name: 'node_create',
  description:
    'Create a node under a parent folder. Supports nodeType, properties, and optional initial text content. If content is provided, this tool performs two API calls: create node first, then PUT node content. Requires explicit user confirmation.',
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
      content: {
        type: 'string',
        description:
          'Optional initial text content. The tool first creates the node and then updates content via PUT /nodes/{id}/content.',
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
      const contentProvided = Object.prototype.hasOwnProperty.call(args, 'content');
      if (contentProvided && typeof args.content !== 'string') {
        return { ok: false, error: 'content must be a string when provided' };
      }
      const content = typeof args.content === 'string' ? args.content : null;
      if (contentProvided && nodeType === 'cm:folder') {
        return { ok: false, error: 'content cannot be provided when creating a folder (cm:folder)' };
      }

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
      const createResult = await (nodesApi as any).createNode(parentId, requestBody, requestQuery);
      const createdEntry = (createResult as any)?.entry ?? createResult;

      let finalEntry = createdEntry;
      let updateContentResult: unknown = null;
      let readBackResult: unknown = null;

      const createdId = typeof createdEntry?.id === 'string' ? createdEntry.id.trim() : '';
      if (contentProvided) {
        if (!createdId) {
          return { ok: false, error: 'Node was created but no id was returned; cannot update content' };
        }

        const readBackQuery = {
          fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
          include: ['path', 'properties'],
        };
        try {
          updateContentResult = await (nodesApi as any).updateNodeContent(createdId, content ?? '');
          readBackResult = await nodesApi.getNode(createdId, readBackQuery);
          finalEntry = (readBackResult as any)?.entry ?? readBackResult;
        } catch (contentErr) {
          const detail = contentErr instanceof Error ? contentErr.message : String(contentErr);
          return {
            ok: false,
            error: `Node ${createdId} was created, but content update failed: ${detail}`,
          };
        }
      }

      return {
        ok: true,
        data: {
          apiTrace: contentProvided
            ? {
                method: 'POST+PUT',
                path: [
                  CREATE_NODE_API_PATH_TEMPLATE.replace('{parentId}', parentId),
                  UPDATE_CONTENT_API_PATH_TEMPLATE.replace('{nodeId}', createdId || '{nodeId}'),
                ],
                steps: [
                  {
                    method: 'POST',
                    path: CREATE_NODE_API_PATH_TEMPLATE.replace('{parentId}', parentId),
                    request: { body: requestBody, query: requestQuery },
                    responseBody: createResult,
                  },
                  {
                    method: 'PUT',
                    path: UPDATE_CONTENT_API_PATH_TEMPLATE.replace('{nodeId}', createdId || '{nodeId}'),
                    request: { body: buildContentRequestPreview(content ?? '') },
                    responseBody: updateContentResult,
                  },
                  {
                    method: 'GET',
                    path: GET_NODE_API_PATH_TEMPLATE.replace('{nodeId}', createdId || '{nodeId}'),
                    request: {
                      query: {
                        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
                        include: ['path', 'properties'],
                      },
                    },
                    responseBody: readBackResult,
                  },
                ],
                request: {
                  create: { body: requestBody, query: requestQuery },
                  updateContent: { body: buildContentRequestPreview(content ?? '') },
                },
                responseBody: {
                  create: createResult,
                  updateContent: updateContentResult,
                  readBack: readBackResult,
                },
              }
            : {
                method: 'POST',
                path: CREATE_NODE_API_PATH_TEMPLATE.replace('{parentId}', parentId),
                request: { body: requestBody, query: requestQuery },
                responseBody: createResult,
              },
          created: {
            id: finalEntry?.id,
            name: finalEntry?.name,
            nodeType: finalEntry?.nodeType,
            isFolder: finalEntry?.isFolder,
            isFile: finalEntry?.isFile,
            path: normalizeNodePath(finalEntry?.path?.name),
            mimeType: finalEntry?.content?.mimeType ?? null,
            properties: finalEntry?.properties ?? null,
          },
          parentId,
          autoRename,
          contentUpdated: contentProvided,
          contentChars: contentProvided ? (content ?? '').length : 0,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
