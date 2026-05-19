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

import type { RevertBody } from '@alfresco/js-api';
import { VersionsApi } from '@alfresco/js-api';
import { getAlfrescoNodeVersionRevertPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const versionRevertTool: ToolDefinition = {
  name: 'version_revert',
  description:
    'Revert a file node to a historical version (POST /nodes/{nodeId}/versions/{versionId}/revert).',
  skill: { kind: 'local_md', path: '../skills/version_revert.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'File node UUID' },
      versionId: { type: 'string', description: 'Version id from node_versions' },
      majorVersion: { type: 'boolean', description: 'If true, bump as major version' },
      comment: { type: 'string', description: 'Optional version comment' },
    },
    required: ['nodeId', 'versionId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      const versionId = typeof args.versionId === 'string' ? args.versionId.trim() : '';
      if (!nodeId || !versionId) {
        return { ok: false, error: 'nodeId and versionId are required' };
      }

      const revertBody: RevertBody = {};
      if (typeof args.majorVersion === 'boolean') {
        revertBody.majorVersion = args.majorVersion;
      }
      if (typeof args.comment === 'string' && args.comment.trim()) {
        revertBody.comment = args.comment.trim();
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const versionsApi = new VersionsApi(ctx.api);
      const path = getAlfrescoNodeVersionRevertPath(nodeId, versionId);
      const result = await versionsApi.revertVersion(nodeId, versionId, revertBody, {});

      return {
        ok: true,
        data: {
          apiTrace: { method: 'POST', path, request: { body: revertBody }, responseBody: result },
          nodeId,
          version: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
