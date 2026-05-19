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

import { SitesApi } from '@alfresco/js-api';
import { getAlfrescoSitePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const siteDeleteTool: ToolDefinition = {
  name: 'site_delete',
  description:
    'Delete a site. Use permanent=true to remove backing store immediately when supported.',
  skill: { kind: 'local_md', path: '../skills/site_delete.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      siteId: { type: 'string', description: 'Site short name / id' },
      permanent: {
        type: 'boolean',
        description: 'Permanent delete flag (server-dependent; default false)',
      },
    },
    required: ['siteId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const siteId = typeof args.siteId === 'string' ? args.siteId.trim() : '';
      if (!siteId) {
        return { ok: false, error: 'siteId is required' };
      }
      const permanent = Boolean(args.permanent);

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const sitesApi = new SitesApi(ctx.api);
      const path = getAlfrescoSitePath(siteId);
      await sitesApi.deleteSite(siteId, { permanent });

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'DELETE',
            path,
            request: { query: { permanent } },
            responseBody: null,
          },
          siteId,
          permanent,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
