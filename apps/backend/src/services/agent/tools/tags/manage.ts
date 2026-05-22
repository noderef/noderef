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

import { TagBody, TagsApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeTagPath,
  getAlfrescoNodeTagsPath,
  getAlfrescoTagPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

type TagAction = 'add_to_node' | 'remove_from_node' | 'rename_global' | 'delete_global';

export const tagManageTool: ToolDefinition = {
  name: 'tag_manage',
  description: 'Create/remove tags on a node, or rename/delete a tag globally in the tag service.',
  skill: { kind: 'local_md', path: '../skills/tag_manage.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add_to_node', 'remove_from_node', 'rename_global', 'delete_global'],
        description: 'Operation to perform',
      },
      nodeId: { type: 'string', description: 'Required for add_to_node / remove_from_node' },
      tag: {
        type: 'string',
        description: 'Tag text for add_to_node, or new name for rename_global',
      },
      tagId: {
        type: 'string',
        description: 'Tag id for remove_from_node / rename_global / delete_global',
      },
    },
    required: ['action'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const action = (typeof args.action === 'string' ? args.action.trim() : '') as TagAction;
      const valid: TagAction[] = [
        'add_to_node',
        'remove_from_node',
        'rename_global',
        'delete_global',
      ];
      if (!valid.includes(action)) {
        return { ok: false, error: `action must be one of: ${valid.join(', ')}` };
      }

      const tagsApi = new TagsApi(ctx.api);

      if (action === 'add_to_node') {
        const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
        const tag = typeof args.tag === 'string' ? args.tag.trim() : '';
        if (!nodeId) {
          return { ok: false, error: 'nodeId is required for add_to_node' };
        }
        if (!tag) {
          return { ok: false, error: 'tag is required for add_to_node' };
        }
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoNodeTagsPath(nodeId);
        const body = new TagBody({ tag });
        const result = await tagsApi.createTagForNode(nodeId, body as any);
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'POST',
              path,
              request: { body: { tag } },
              responseBody: result,
            },
            action,
            tag: (result as any)?.entry ?? result,
          },
        };
      }

      if (action === 'remove_from_node') {
        const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
        const tagId = typeof args.tagId === 'string' ? args.tagId.trim() : '';
        if (!nodeId || !tagId) {
          return { ok: false, error: 'nodeId and tagId are required for remove_from_node' };
        }
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoNodeTagPath(nodeId, tagId);
        await tagsApi.deleteTagFromNode(nodeId, tagId);
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
            tagId,
          },
        };
      }

      const tagId = typeof args.tagId === 'string' ? args.tagId.trim() : '';
      if (!tagId) {
        return { ok: false, error: 'tagId is required for rename_global and delete_global' };
      }

      if (action === 'delete_global') {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        const path = getAlfrescoTagPath(tagId);
        await tagsApi.deleteTag(tagId);
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
            tagId,
          },
        };
      }

      const newTag = typeof args.tag === 'string' ? args.tag.trim() : '';
      if (!newTag) {
        return { ok: false, error: 'tag (new name) is required for rename_global' };
      }
      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }
      const path = getAlfrescoTagPath(tagId);
      const body = new TagBody({ tag: newTag });
      const result = await tagsApi.updateTag(tagId, body as any);
      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path,
            request: { body: { tag: newTag } },
            responseBody: result,
          },
          action,
          tagId,
          tag: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
