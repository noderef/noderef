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

import { TagsApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeTagsPath,
  getAlfrescoTagsCollectionPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { sliceAlfrescoPagedList } from '../helpers/alfrescoListResponse.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const tagListTool: ToolDefinition = {
  name: 'tag_list',
  description:
    'List tags globally or for a specific node. Global list supports optional exact tag filter.',
  skill: { kind: 'local_md', path: '../skills/tag_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'If set, list tags on this node; otherwise list repository tags',
      },
      tag: {
        type: 'string',
        description: 'When listing globally: filter by tag text (see matching)',
      },
      matching: {
        type: 'boolean',
        description:
          'When tag is set on global list: if true use partial match predicate (default false = exact)',
      },
      maxItems: { type: 'number', description: 'Page size (default 25, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset' },
    },
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 25, maxCap: 100 });
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const tagsApi = new TagsApi(ctx.api);

      if (nodeId) {
        const path = getAlfrescoNodeTagsPath(nodeId);
        const payload = await tagsApi.listTagsForNode(nodeId, { skipCount, maxItems });
        const { entries, pagination } = sliceAlfrescoPagedList(payload, skipCount, maxItems);

        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'GET',
              path,
              request: { query: { skipCount, maxItems } },
              responseBody: payload,
            },
            scope: 'node',
            nodeId,
            pagination,
            entries,
          },
        };
      }

      const tagFilter = typeof args.tag === 'string' ? args.tag.trim() : '';
      const matching = Boolean(args.matching);
      const path = getAlfrescoTagsCollectionPath();
      const listOpts: Record<string, unknown> = {
        skipCount,
        maxItems,
        ...(tagFilter ? { tag: tagFilter, matching } : {}),
      };
      const payload = await tagsApi.listTags(listOpts as any);
      const { entries, pagination } = sliceAlfrescoPagedList(payload, skipCount, maxItems);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path,
            request: { query: listOpts },
            responseBody: payload,
          },
          scope: 'global',
          pagination,
          entries,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
