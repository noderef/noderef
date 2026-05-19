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
import { getAlfrescoSitesCollectionPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const VISIBILITY = ['PUBLIC', 'PRIVATE', 'MODERATED'] as const;

export const siteCreateTool: ToolDefinition = {
  name: 'site_create',
  description:
    'Create a new Alfresco site (short name, title, visibility). Optional flags skip doclib setup or favorites.',
  skill: { kind: 'local_md', path: '../skills/site_create.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Human-readable site title' },
      id: {
        type: 'string',
        description: 'Optional site short name; server generates if omitted',
      },
      description: { type: 'string', description: 'Optional description' },
      visibility: {
        type: 'string',
        enum: [...VISIBILITY],
        description: 'Site visibility (default PUBLIC)',
      },
      skipConfiguration: {
        type: 'boolean',
        description: 'If true, skip default site folder setup (default false)',
      },
      skipAddToFavorites: {
        type: 'boolean',
        description: 'If true, do not add site to creator favorites (default false)',
      },
    },
    required: ['title'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (!title) {
        return { ok: false, error: 'title is required' };
      }
      const idRaw = typeof args.id === 'string' ? args.id.trim() : '';
      const description =
        typeof args.description === 'string' ? args.description.trim() : undefined;
      const visRaw =
        typeof args.visibility === 'string' ? args.visibility.trim().toUpperCase() : '';
      const visibility = (VISIBILITY as readonly string[]).includes(visRaw)
        ? (visRaw as (typeof VISIBILITY)[number])
        : 'PUBLIC';

      const body: Record<string, unknown> = {
        title,
        visibility,
        ...(idRaw ? { id: idRaw } : {}),
        ...(description !== undefined && description !== '' ? { description } : {}),
      };

      const opts = {
        skipConfiguration: Boolean(args.skipConfiguration),
        skipAddToFavorites: Boolean(args.skipAddToFavorites),
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const sitesApi = new SitesApi(ctx.api);
      const path = getAlfrescoSitesCollectionPath();
      const result = await sitesApi.createSite(body as any, opts);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path,
            request: { body, opts },
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
