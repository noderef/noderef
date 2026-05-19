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

const VISIBILITY = ['PUBLIC', 'PRIVATE', 'MODERATED'] as const;

export const siteUpdateTool: ToolDefinition = {
  name: 'site_update',
  description: 'Update site title, description, and/or visibility.',
  skill: { kind: 'local_md', path: '../skills/site_update.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      siteId: { type: 'string', description: 'Site short name / id' },
      title: { type: 'string', description: 'New title' },
      description: { type: 'string', description: 'New description' },
      visibility: {
        type: 'string',
        enum: [...VISIBILITY],
        description: 'New visibility',
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

      const body: Record<string, unknown> = {};
      if (typeof args.title === 'string' && args.title.trim()) {
        body.title = args.title.trim();
      }
      if (typeof args.description === 'string') {
        body.description = args.description;
      }
      if (typeof args.visibility === 'string') {
        const v = args.visibility.trim().toUpperCase();
        if ((VISIBILITY as readonly string[]).includes(v)) {
          body.visibility = v;
        }
      }

      if (!Object.keys(body).length) {
        return { ok: false, error: 'Provide at least one of title, description, visibility' };
      }

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const sitesApi = new SitesApi(ctx.api);
      const path = getAlfrescoSitePath(siteId);
      const result = await sitesApi.updateSite(siteId, body as any);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path,
            request: { body },
            responseBody: result,
          },
          site: (result as any)?.entry ?? result,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
