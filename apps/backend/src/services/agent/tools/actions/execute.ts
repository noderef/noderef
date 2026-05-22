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

import type { ActionBodyExec } from '@alfresco/js-api';
import { ActionsApi } from '@alfresco/js-api';
import { getAlfrescoActionExecutionsPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const actionExecuteTool: ToolDefinition = {
  name: 'action_execute',
  description:
    'Execute a repository action (POST /action-executions). Requires actionDefinitionId and usually targetId.',
  skill: { kind: 'local_md', path: '../skills/action_execute.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      actionDefinitionId: { type: 'string', description: 'Action id from action_list' },
      targetId: { type: 'string', description: 'Node id or entity id the action applies to' },
      params: {
        type: 'object',
        description: 'Optional action parameters (JSON object)',
      },
    },
    required: ['actionDefinitionId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const actionDefinitionId =
        typeof args.actionDefinitionId === 'string' ? args.actionDefinitionId.trim() : '';
      if (!actionDefinitionId) {
        return { ok: false, error: 'actionDefinitionId is required' };
      }
      const targetId = typeof args.targetId === 'string' ? args.targetId.trim() : '';
      const paramsRaw = args.params;
      const params = isRecord(paramsRaw) ? paramsRaw : undefined;

      const body: ActionBodyExec = {
        actionDefinitionId,
        ...(targetId ? { targetId } : {}),
        ...(params ? { params } : {}),
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const actionsApi = new ActionsApi(ctx.api);
      const path = getAlfrescoActionExecutionsPath();
      const result = await actionsApi.actionExec(body);

      return {
        ok: true,
        data: {
          apiTrace: { method: 'POST', path, request: { body }, responseBody: result },
          result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
