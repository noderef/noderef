/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeChildrenPath,
  getAlfrescoNodeContentPath,
  getAlfrescoNodePath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import {
  buildContentRequestPreview,
  extractContentCandidate,
  normalizeContentArg,
} from '../helpers/contentNormalization.js';
import {
  buildNodeMetadataQuery,
  toNodeSummary,
} from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const MAX_TRACE_CONTENT_CHARS = 4000;

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
        oneOf: [{ type: 'string' }, { type: 'array' }, { type: 'object' }],
        description:
          'Optional initial node content. Prefer string, but arrays/objects are accepted and serialized to text. The tool first creates the node and then updates content via PUT /nodes/{id}/content.',
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
      const contentCandidate = extractContentCandidate(args);
      const contentProvided = Boolean(contentCandidate);
      const normalizedContent = contentCandidate
        ? normalizeContentArg(contentCandidate.value, contentCandidate.sourceType)
        : null;
      if (contentProvided && !normalizedContent) {
        return {
          ok: false,
          error: 'content must be serializable when provided',
        };
      }
      const content = normalizedContent?.content ?? null;
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
        ...buildNodeMetadataQuery(),
      };

      const nodesApi = new NodesApi(ctx.api);
      const createResult = await (nodesApi as any).createNode(parentId, requestBody, requestQuery);
      const createdEntry = (createResult as any)?.entry ?? createResult;

      let finalEntry = createdEntry;
      let updateContentResult: unknown = null;
      let readBackResult: unknown = null;
      const readBackQuery = buildNodeMetadataQuery();

      const createdId = typeof createdEntry?.id === 'string' ? createdEntry.id.trim() : '';
      if (contentProvided) {
        if (!createdId) {
          return { ok: false, error: 'Node was created but no id was returned; cannot update content' };
        }

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
                  getAlfrescoNodeChildrenPath(parentId),
                  getAlfrescoNodeContentPath(createdId || '{nodeId}'),
                ],
                steps: [
                  {
                    method: 'POST',
                    path: getAlfrescoNodeChildrenPath(parentId),
                    request: { body: requestBody, query: requestQuery },
                    responseBody: createResult,
                  },
                  {
                    method: 'PUT',
                    path: getAlfrescoNodeContentPath(createdId || '{nodeId}'),
                    request: {
                      body: buildContentRequestPreview(content ?? '', MAX_TRACE_CONTENT_CHARS),
                    },
                    responseBody: updateContentResult,
                  },
                  {
                    method: 'GET',
                    path: getAlfrescoNodePath(createdId || '{nodeId}'),
                    request: { query: readBackQuery },
                    responseBody: readBackResult,
                  },
                ],
                request: {
                  create: { body: requestBody, query: requestQuery },
                  updateContent: {
                    body: buildContentRequestPreview(content ?? '', MAX_TRACE_CONTENT_CHARS),
                  },
                },
                responseBody: {
                  create: createResult,
                  updateContent: updateContentResult,
                  readBack: readBackResult,
                },
              }
            : {
                method: 'POST',
                path: getAlfrescoNodeChildrenPath(parentId),
                request: { body: requestBody, query: requestQuery },
                responseBody: createResult,
              },
          created: toNodeSummary(finalEntry),
          parentId,
          autoRename,
          contentUpdated: contentProvided,
          contentChars: contentProvided ? (content ?? '').length : 0,
          contentSourceType: normalizedContent?.sourceType ?? null,
          contentTransformed: normalizedContent?.transformed ?? false,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
