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

import { CategoriesApi, CategoryBody, CategoryLinkBody } from '@alfresco/js-api';
import {
  getAlfrescoCategoryPath,
  getAlfrescoCategorySubcategoriesPath,
  getAlfrescoNodeCategoryLinkPath,
  getAlfrescoNodeCategoryLinksPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

type CategoryAction =
  | 'create_subcategory'
  | 'update_category'
  | 'delete_category'
  | 'link_node'
  | 'unlink_node';

export const categoryManageTool: ToolDefinition = {
  name: 'category_manage',
  description:
    'Create subcategories, update/delete categories, or link/unlink nodes to categories (taxonomy).',
  skill: { kind: 'local_md', path: '../skills/category_manage.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'create_subcategory',
          'update_category',
          'delete_category',
          'link_node',
          'unlink_node',
        ],
        description: 'Operation',
      },
      parentCategoryId: {
        type: 'string',
        description: 'Parent category id for create_subcategory',
      },
      categoryId: {
        type: 'string',
        description: 'Target category id (update/delete/link target)',
      },
      name: { type: 'string', description: 'Display name for create_subcategory or update_category' },
      nodeId: { type: 'string', description: 'Node id for link_node / unlink_node' },
    },
    required: ['action'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const action = (typeof args.action === 'string' ? args.action.trim() : '') as CategoryAction;
      const valid: CategoryAction[] = [
        'create_subcategory',
        'update_category',
        'delete_category',
        'link_node',
        'unlink_node',
      ];
      if (!valid.includes(action)) {
        return { ok: false, error: `action must be one of: ${valid.join(', ')}` };
      }

      const categoriesApi = new CategoriesApi(ctx.api);

      if (action === 'create_subcategory') {
        const parentCategoryId =
          typeof args.parentCategoryId === 'string' ? args.parentCategoryId.trim() : '';
        const name = typeof args.name === 'string' ? args.name.trim() : '';
        if (!parentCategoryId || !name) {
          return {
            ok: false,
            error: 'parentCategoryId and name are required for create_subcategory',
          };
        }
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoCategorySubcategoriesPath(parentCategoryId);
        const body: CategoryBody[] = [{ name }];
        const result = await categoriesApi.createSubcategories(parentCategoryId, body);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'POST',
              path,
              request: { body },
              responseBody: result,
            },
            action,
            category: (result as any)?.entry ?? result,
          },
        };
      }

      if (action === 'update_category') {
        const categoryId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
        const name = typeof args.name === 'string' ? args.name.trim() : '';
        if (!categoryId || !name) {
          return { ok: false, error: 'categoryId and name are required for update_category' };
        }
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoCategoryPath(categoryId);
        const body: CategoryBody = { name };
        const result = await categoriesApi.updateCategory(categoryId, body);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'PUT',
              path,
              request: { body },
              responseBody: result,
            },
            action,
            category: (result as any)?.entry ?? result,
          },
        };
      }

      if (action === 'delete_category') {
        const categoryId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
        if (!categoryId) {
          return { ok: false, error: 'categoryId is required for delete_category' };
        }
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoCategoryPath(categoryId);
        await categoriesApi.deleteCategory(categoryId);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'DELETE',
              path,
              request: {},
              responseBody: null,
            },
            action,
            categoryId,
          },
        };
      }

      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      const categoryId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
      if (!nodeId || !categoryId) {
        return { ok: false, error: 'nodeId and categoryId are required for link_node and unlink_node' };
      }

      if (action === 'unlink_node') {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoNodeCategoryLinkPath(nodeId, categoryId);
        await categoriesApi.unlinkNodeFromCategory(nodeId, categoryId);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'DELETE',
              path,
              request: {},
              responseBody: null,
            },
            action,
            nodeId,
            categoryId,
          },
        };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }
      const path = getAlfrescoNodeCategoryLinksPath(nodeId);
      const linkBodies: CategoryLinkBody[] = [new CategoryLinkBody({ categoryId })];
      const result = await categoriesApi.linkNodeToCategory(nodeId, linkBodies);
      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path,
            request: { body: [{ categoryId }] },
            responseBody: result,
          },
          action: 'link_node',
          nodeId,
          categoryId,
          category: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
