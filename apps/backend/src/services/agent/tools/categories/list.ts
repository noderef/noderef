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

import { CategoriesApi } from '@alfresco/js-api';
import {
  getAlfrescoCategoryPath,
  getAlfrescoCategorySubcategoriesPath,
  getAlfrescoNodeCategoryLinksPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { sliceAlfrescoPagedList } from '../helpers/alfrescoListResponse.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const categoryListTool: ToolDefinition = {
  name: 'category_list',
  description:
    'List category links on a node, fetch one category by id, or list subcategories under a parent category.',
  skill: { kind: 'local_md', path: '../skills/category_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['node_links', 'category', 'subcategories'],
        description:
          'node_links: GET /nodes/{nodeId}/category-links; category: GET /categories/{id}; subcategories: GET /categories/{id}/subcategories',
      },
      nodeId: { type: 'string', description: 'Required when mode=node_links' },
      categoryId: {
        type: 'string',
        description: 'Required when mode is category or subcategories (taxonomy node id)',
      },
      maxItems: { type: 'number', description: 'Paging for lists (default 25, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset' },
    },
    required: ['mode'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const mode = typeof args.mode === 'string' ? args.mode.trim() : '';
      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 25, maxCap: 100 });

      if (!['node_links', 'category', 'subcategories'].includes(mode)) {
        return {
          ok: false,
          error: 'mode must be node_links, category, or subcategories',
        };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const categoriesApi = new CategoriesApi(ctx.api);

      if (mode === 'node_links') {
        const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
        if (!nodeId) {
          return { ok: false, error: 'nodeId is required for node_links' };
        }
        const path = getAlfrescoNodeCategoryLinksPath(nodeId);
        const payload = await categoriesApi.getCategoryLinksForNode(nodeId, {
          skipCount,
          maxItems,
        });
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'GET',
              path,
              request: { query: { skipCount, maxItems } },
              responseBody: payload,
            },
            mode,
            nodeId,
            list: (payload as any)?.list ?? payload,
          },
        };
      }

      const categoryId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
      if (!categoryId) {
        return { ok: false, error: 'categoryId is required for category and subcategories modes' };
      }

      if (mode === 'category') {
        const path = getAlfrescoCategoryPath(categoryId);
        const payload = await categoriesApi.getCategory(categoryId, {});
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'GET',
              path,
              request: {},
              responseBody: payload,
            },
            mode,
            categoryId,
            category: (payload as any)?.entry ?? payload,
          },
        };
      }

      const path = getAlfrescoCategorySubcategoriesPath(categoryId);
      const payload = await categoriesApi.getSubcategories(categoryId, { skipCount, maxItems });
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
          mode,
          categoryId,
          pagination,
          entries,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
