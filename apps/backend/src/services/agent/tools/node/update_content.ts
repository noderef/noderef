/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodeContentPath, getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
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

export const nodeUpdateContentTool: ToolDefinition = {
  name: 'node_update_content',
  description:
    'Update file content for an existing node using PUT /nodes/{nodeId}/content. Useful after node_create when you need to set or replace text content. Requires explicit user confirmation.',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID of the file to update' },
      content: {
        oneOf: [{ type: 'string' }, { type: 'array' }, { type: 'object' }],
        description:
          'New node content. Prefer plain string, but arrays/objects are accepted and serialized to text.',
      },
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

      const candidate = extractContentCandidate(args);
      const normalizedContent = candidate
        ? normalizeContentArg(candidate.value, candidate.sourceType)
        : null;
      if (!normalizedContent) {
        return {
          ok: false,
          error: 'content is required and must be string/array/object (or provide text/value/body/data)',
        };
      }

      const content = normalizedContent.content;
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

      const readBackQuery = buildNodeMetadataQuery();
      const readBackResult = await nodesApi.getNode(nodeId, readBackQuery);
      const entry = (readBackResult as any)?.entry ?? readBackResult;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path: getAlfrescoNodeContentPath(nodeId),
            request: {
              body: buildContentRequestPreview(content, MAX_TRACE_CONTENT_CHARS),
              ...(Object.keys(requestQuery).length > 0 ? { query: requestQuery } : {}),
            },
            responseBody: updateResult,
            followUp: {
              method: 'GET',
              path: getAlfrescoNodePath(nodeId),
              request: { query: readBackQuery },
              responseBody: readBackResult,
            },
          },
          updated: toNodeSummary(entry),
          nodeId,
          contentChars: content.length,
          contentEmpty: content.length === 0,
          contentSourceType: normalizedContent.sourceType,
          contentTransformed: normalizedContent.transformed,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
