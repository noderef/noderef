/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NodesApi, VersionsApi } from '@alfresco/js-api';
import {
  getAlfrescoNodePath,
  getAlfrescoNodeVersionsPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import { parseSkipMax, summarizeAlfrescoListPagination } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const nodeVersionsTool: ToolDefinition = {
  name: 'node_versions',
  description: 'List version history for a node with pagination and modification metadata.',
  skill: { kind: 'local_md', path: '../skills/node_versions.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'Node ID (UUID) to inspect version history for',
      },
      maxItems: {
        type: 'number',
        description: 'Page size (default 25, max 100)',
      },
      skipCount: {
        type: 'number',
        description: 'Paging offset (default 0)',
      },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }

      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 25, maxCap: 100 });
      const nodeQuery = {
        fields: ['id', 'name'],
      };
      const versionsQuery = {
        skipCount,
        maxItems,
        fields: ['id', 'name', 'modifiedAt', 'modifiedByUser', 'content', 'versionComment'],
      };

      const nodesApi = new NodesApi(ctx.api);
      const versionsApi = new VersionsApi(ctx.api);

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }
      const nodeResult = await nodesApi.getNode(nodeId, nodeQuery);

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }
      const versionsResult = await versionsApi.listVersionHistory(nodeId, versionsQuery);

      const nodeEntry = (nodeResult as any)?.entry ?? nodeResult;
      const list = isRecord((versionsResult as any)?.list) ? (versionsResult as any).list : {};
      const entries = Array.isArray(list.entries) ? list.entries : [];
      const paginationRaw = isRecord(list.pagination) ? list.pagination : {};

      const versions = entries
        .map((item: unknown) => (isRecord((item as any)?.entry) ? (item as any).entry : null))
        .filter((entry: Record<string, unknown> | null): entry is Record<string, unknown> =>
          Boolean(entry)
        )
        .map((entry: Record<string, unknown>) => {
          const modifiedByUser = isRecord(entry.modifiedByUser) ? entry.modifiedByUser : {};
          const content = isRecord(entry.content) ? entry.content : {};

          return {
            id: typeof entry.id === 'string' ? entry.id : null,
            name: typeof entry.name === 'string' ? entry.name : null,
            modifiedAt: entry.modifiedAt ?? null,
            modifiedByUser:
              typeof modifiedByUser.displayName === 'string'
                ? modifiedByUser.displayName
                : typeof modifiedByUser.id === 'string'
                  ? modifiedByUser.id
                  : null,
            content: {
              mimeType: typeof content.mimeType === 'string' ? content.mimeType : null,
              sizeInBytes:
                typeof content.sizeInBytes === 'number' && Number.isFinite(content.sizeInBytes)
                  ? content.sizeInBytes
                  : null,
            },
            versionComment: typeof entry.versionComment === 'string' ? entry.versionComment : null,
          };
        });

      const { totalCount, hasMoreItems, nextSkipCount } = summarizeAlfrescoListPagination(
        paginationRaw,
        versions.length,
        skipCount
      );

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoNodeVersionsPath(nodeId),
            request: {
              query: versionsQuery,
            },
            responseBody: versionsResult,
            followUp: {
              method: 'GET',
              path: getAlfrescoNodePath(nodeId),
              request: { query: nodeQuery },
              responseBody: nodeResult,
            },
          },
          nodeId: typeof nodeEntry?.id === 'string' ? nodeEntry.id : nodeId,
          nodeName: typeof nodeEntry?.name === 'string' ? nodeEntry.name : null,
          pagination: {
            totalCount,
            hasMoreItems,
            skipCount,
            maxItems,
            nextSkipCount,
          },
          versions,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
