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

import { CommentsApi } from '@alfresco/js-api';
import { getAlfrescoNodeCommentsPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { sliceAlfrescoPagedList } from '../helpers/alfrescoListResponse.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const commentListTool: ToolDefinition = {
  name: 'comment_list',
  description: 'List comments on a node (GET /nodes/{nodeId}/comments).',
  skill: { kind: 'local_md', path: '../skills/comment_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node UUID' },
      maxItems: { type: 'number', description: 'Page size (default 25, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset' },
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

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const commentsApi = new CommentsApi(ctx.api);
      const path = getAlfrescoNodeCommentsPath(nodeId);
      const query = { skipCount, maxItems };
      const payload = await commentsApi.listComments(nodeId, query);
      const { entries, pagination } = sliceAlfrescoPagedList(payload, skipCount, maxItems);

      return {
        ok: true,
        data: {
          apiTrace: { method: 'GET', path, request: { query }, responseBody: payload },
          nodeId,
          pagination,
          entries,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
