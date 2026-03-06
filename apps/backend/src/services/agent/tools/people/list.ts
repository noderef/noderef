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

import axios from 'axios';
import { getAlfrescoPeopleCollectionPath } from '../../../../lib/alfresco-endpoints.js';
import { normalizeBaseUrl } from '../../../../lib/alfresco-url.js';
import type { AgentExecutionContext } from '../../types.js';
import { buildAuthHeader } from '../helpers/authHeaders.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const peopleListTool: ToolDefinition = {
  name: 'people_list',
  description: 'List users with pagination, optionally filtered by partial person text.',
  skill: { kind: 'local_md', path: '../skills/people_list.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Optional filter string for partial user matching',
      },
      maxItems: {
        type: 'number',
        description: 'Page size (default 25, max 100)',
      },
      skipCount: {
        type: 'number',
        description: 'Paging offset (default 0)',
      },
    },
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filter = typeof args.filter === 'string' ? args.filter.trim() : '';
      const maxItemsRaw =
        typeof args.maxItems === 'number' && Number.isFinite(args.maxItems)
          ? Math.max(0, Math.min(Math.floor(args.maxItems), 100))
          : 25;
      const maxItems = Math.max(1, maxItemsRaw);
      const skipCount =
        typeof args.skipCount === 'number' && Number.isFinite(args.skipCount)
          ? Math.max(0, Math.floor(args.skipCount))
          : 0;

      const requestQuery: Record<string, unknown> = {
        skipCount,
        maxItems,
        ...(filter ? { filter } : {}),
      };

      const path = getAlfrescoPeopleCollectionPath();
      const url = `${normalizeBaseUrl(ctx.serverBaseUrl)}${path}`;

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }

      const response = await axios.get(url, {
        headers: {
          Accept: 'application/json',
          ...buildAuthHeader(ctx),
        },
        params: requestQuery,
        signal: ctx.signal,
      });

      const payload = response.data;
      const list = isRecord(payload?.list) ? payload.list : {};
      const pagination = isRecord(list.pagination) ? list.pagination : {};
      const entries = Array.isArray(list.entries) ? list.entries : [];

      const people = entries
        .map((item: unknown) => (isRecord((item as any)?.entry) ? (item as any).entry : null))
        .filter((entry: Record<string, unknown> | null): entry is Record<string, unknown> =>
          Boolean(entry)
        )
        .map((entry: Record<string, unknown>) => {
          const firstName = typeof entry.firstName === 'string' ? entry.firstName.trim() : '';
          const lastName = typeof entry.lastName === 'string' ? entry.lastName.trim() : '';
          const displayName =
            typeof entry.displayName === 'string' && entry.displayName.trim()
              ? entry.displayName
              : `${firstName} ${lastName}`.trim() ||
                (typeof entry.id === 'string' && entry.id.trim() ? entry.id : '');

          return {
            id: typeof entry.id === 'string' ? entry.id : null,
            displayName: displayName || null,
            email: typeof entry.email === 'string' ? entry.email : null,
            enabled: typeof entry.enabled === 'boolean' ? entry.enabled : null,
          };
        });

      const totalCount =
        typeof pagination.totalItems === 'number' && Number.isFinite(pagination.totalItems)
          ? pagination.totalItems
          : people.length;
      const hasMoreItems =
        typeof pagination.hasMoreItems === 'boolean'
          ? pagination.hasMoreItems
          : skipCount + people.length < totalCount;
      const nextSkipCount = hasMoreItems ? skipCount + people.length : null;

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
          people,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
