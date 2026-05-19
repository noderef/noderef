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
import { parseSkipMax } from '../helpers/paginationArgs.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const siteListTool: ToolDefinition = {
  name: 'site_list',
  description:
    'List Alfresco sites with paging. Supports optional CMIS-style where filter (e.g. visibility).',
  skill: { kind: 'local_md', path: '../skills/site_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      where: {
        type: 'string',
        description:
          'Optional predicate (Alfresco where clause), e.g. (visibility=\'PUBLIC\')',
      },
      maxItems: { type: 'number', description: 'Page size (default 25, max 100)' },
      skipCount: { type: 'number', description: 'Paging offset (default 0)' },
    },
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { skipCount, maxItems } = parseSkipMax(args, { defaultMax: 25, maxCap: 100 });
      const where = typeof args.where === 'string' ? args.where.trim() : '';

      const requestQuery: Record<string, unknown> = {
        skipCount,
        maxItems,
        ...(where ? { where } : {}),
      };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const sitesApi = new SitesApi(ctx.api);
      const path = getAlfrescoSitesCollectionPath();
      const payload = await sitesApi.listSites(requestQuery as any);
      const list = isRecord((payload as any)?.list) ? (payload as any).list : {};
      const pagination = isRecord(list.pagination) ? list.pagination : {};
      const entries = Array.isArray(list.entries) ? list.entries : [];

      const totalCount =
        typeof pagination.totalItems === 'number' && Number.isFinite(pagination.totalItems)
          ? pagination.totalItems
          : entries.length;
      const hasMoreItems =
        typeof pagination.hasMoreItems === 'boolean'
          ? pagination.hasMoreItems
          : skipCount + entries.length < totalCount;
      const nextSkipCount = hasMoreItems ? skipCount + entries.length : null;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path,
            request: { query: requestQuery },
            responseBody: payload,
          },
          pagination: {
            totalCount,
            hasMoreItems,
            skipCount,
            maxItems,
            nextSkipCount,
          },
          sites: entries,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
