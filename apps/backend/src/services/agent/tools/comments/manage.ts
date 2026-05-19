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

import type { CommentBody } from '@alfresco/js-api';
import { CommentsApi } from '@alfresco/js-api';
import {
  getAlfrescoNodeCommentPath,
  getAlfrescoNodeCommentsPath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

type CommentAction = 'add' | 'update' | 'delete';

export const commentManageTool: ToolDefinition = {
  name: 'comment_manage',
  description: 'Add, update, or delete a comment on a node.',
  skill: { kind: 'local_md', path: '../skills/comment_manage.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'update', 'delete'] },
      nodeId: { type: 'string', description: 'Node UUID' },
      commentId: { type: 'string', description: 'Required for update and delete' },
      content: { type: 'string', description: 'Comment text for add/update' },
    },
    required: ['action', 'nodeId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const action = (typeof args.action === 'string' ? args.action.trim() : '') as CommentAction;
      if (!['add', 'update', 'delete'].includes(action)) {
        return { ok: false, error: 'action must be add, update, or delete' };
      }

      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const commentsApi = new CommentsApi(ctx.api);

      if (action === 'add') {
        const content = typeof args.content === 'string' ? args.content : '';
        if (!content.trim()) {
          return { ok: false, error: 'content is required for add' };
        }
        const path = getAlfrescoNodeCommentsPath(nodeId);
        const body: CommentBody = { content };
        const result = await commentsApi.createComment(nodeId, body);
        return {
          ok: true,
          data: {
            apiTrace: { method: 'POST', path, request: { body }, responseBody: result },
            action,
            comment: (result as any)?.entry ?? result,
          },
        };
      }

      const commentId = typeof args.commentId === 'string' ? args.commentId.trim() : '';
      if (!commentId) {
        return { ok: false, error: 'commentId is required for update and delete' };
      }

      if (action === 'delete') {
        const path = getAlfrescoNodeCommentPath(nodeId, commentId);
        await commentsApi.deleteComment(nodeId, commentId);
        return {
          ok: true,
          data: {
            apiTrace: { method: 'DELETE', path, request: {}, responseBody: null },
            action,
            nodeId,
            commentId,
          },
        };
      }

      const content = typeof args.content === 'string' ? args.content : '';
      if (!content.trim()) {
        return { ok: false, error: 'content is required for update' };
      }
      const path = getAlfrescoNodeCommentPath(nodeId, commentId);
      const body: CommentBody = { content };
      const result = await commentsApi.updateComment(nodeId, commentId, body);
      return {
        ok: true,
        data: {
          apiTrace: { method: 'PUT', path, request: { body }, responseBody: result },
          action,
          comment: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
