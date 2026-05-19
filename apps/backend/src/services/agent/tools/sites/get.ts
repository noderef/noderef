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
import {
  getAlfrescoSiteContainersPath,
  getAlfrescoSiteMembersPath,
  getAlfrescoSitePath,
} from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { parseSkipMax } from '../helpers/paginationArgs.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const siteGetTool: ToolDefinition = {
  name: 'site_get',
  description:
    'Get one site by siteId, including document library containers. Optionally list site members (paged).',
  skill: { kind: 'local_md', path: '../skills/site_get.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      siteId: { type: 'string', description: 'Site short name / id' },
      includeMembers: {
        type: 'boolean',
        description: 'If true, also return first page of site members (default false)',
      },
      membersMaxItems: {
        type: 'number',
        description: 'When includeMembers: page size (default 25, max 100)',
      },
      membersSkipCount: { type: 'number', description: 'When includeMembers: paging offset' },
    },
    required: ['siteId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const siteId = typeof args.siteId === 'string' ? args.siteId.trim() : '';
      if (!siteId) {
        return { ok: false, error: 'siteId is required' };
      }
      const includeMembers = Boolean(args.includeMembers);
      const memberPaging = parseSkipMax(
        {
          maxItems: args.membersMaxItems,
          skipCount: args.membersSkipCount,
        },
        { defaultMax: 25, maxCap: 100 }
      );

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const sitesApi = new SitesApi(ctx.api);
      const sitePath = getAlfrescoSitePath(siteId);
      const siteEntry = await sitesApi.getSite(siteId, {});

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const containersPath = getAlfrescoSiteContainersPath(siteId);
      const containers = await sitesApi.listSiteContainers(siteId, {
        skipCount: 0,
        maxItems: 100,
      });

      let membersPayload: unknown = null;
      const membersPath = getAlfrescoSiteMembersPath(siteId);
      if (includeMembers) {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }
        membersPayload = await sitesApi.listSiteMemberships(siteId, {
          skipCount: memberPaging.skipCount,
          maxItems: memberPaging.maxItems,
        });
      }

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: sitePath,
            request: { siteId, includeMembers },
            responseBody: {
              site: siteEntry,
              containers,
              ...(includeMembers ? { members: membersPayload } : {}),
            },
          },
          siteId,
          site: (siteEntry as any)?.entry ?? siteEntry,
          containers,
          ...(includeMembers ? { members: membersPayload } : {}),
          paths: {
            site: sitePath,
            containers: containersPath,
            ...(includeMembers ? { members: membersPath } : {}),
          },
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
