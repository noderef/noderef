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

/**
 * Server Insights RPC handlers
 * Handles all backend.serverInsights.* RPC methods
 */

import { z } from 'zod';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';
import { withAuth } from './withAuth.js';
import { VALID_RANGE_DAYS } from '../../services/insightGraphService.js';

const VALID_RANGE_DAYS_ARRAY = [...VALID_RANGE_DAYS] as const;
const VALID_GRAPH_TYPES = ['area'] as const;

/**
 * Register all server insights related RPC handlers
 */
export function registerServerInsightsHandlers(routes: Routes, ctx: RpcContext): void {
  const { insightGraphService } = ctx;

  routes['backend.serverInsights.listGraphs'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId: number };
      return insightGraphService.findAllByServer(userId, serverId);
    },
  };

  routes['backend.serverInsights.createGraph'] = {
    schema: z.object({
      serverId: z.number(),
      title: z.string().min(1),
      type: z.enum(VALID_GRAPH_TYPES).optional(),
      filterQuery: z.string().min(1),
      dateField: z.string().min(1),
      color: z.string().optional(),
      columnSpan: z.number().min(1).max(2).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as {
        serverId: number;
        title: string;
        type?: 'area';
        filterQuery: string;
        dateField: string;
        color?: string;
        columnSpan?: number;
      };
      return insightGraphService.create(userId, data);
    },
  };

  routes['backend.serverInsights.updateGraph'] = {
    schema: z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      type: z.enum(VALID_GRAPH_TYPES).optional(),
      isPinned: z.boolean().optional(),
      filterQuery: z.string().min(1).optional(),
      dateField: z.string().min(1).optional(),
      color: z.string().optional(),
      displayOrder: z.number().optional(),
      columnSpan: z.number().min(1).max(2).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, ...data } = params as {
        id: number;
        title?: string;
        type?: 'area';
        isPinned?: boolean;
        filterQuery?: string;
        dateField?: string;
        color?: string;
        displayOrder?: number;
        columnSpan?: number;
      };
      return insightGraphService.update(userId, id, data);
    },
  };

  routes['backend.serverInsights.deleteGraph'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await insightGraphService.delete(userId, id);
      return { success };
    },
  };

  routes['backend.serverInsights.getDashboard'] = {
    schema: z.object({
      serverId: z.number(),
      rangeDays: z.number().refine(v => VALID_RANGE_DAYS.has(v), {
        message: `rangeDays must be one of: ${VALID_RANGE_DAYS_ARRAY.join(', ')}`,
      }),
    }),
    handler: async params => {
      const { serverId, rangeDays } = params as { serverId: number; rangeDays: number };
      const userId = await getCurrentUserId();

      // Use withAuth to get authenticated Alfresco API client
      return withAuth(ctx, serverId, async api => {
        const { SearchApi } = await import('@alfresco/js-api');
        const searchApi = new SearchApi(api);
        const searchFn = searchApi.search.bind(searchApi) as any;
        return insightGraphService.getDashboard(userId, serverId, rangeDays, searchFn);
      });
    },
  };

  routes['backend.serverInsights.getPinnedDashboard'] = {
    schema: z.object({
      rangesByServer: z.record(
        z.string(),
        z.number().refine(v => VALID_RANGE_DAYS.has(v), {
          message: `rangeDays must be one of: ${VALID_RANGE_DAYS_ARRAY.join(', ')}`,
        })
      ),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { rangesByServer } = params as { rangesByServer: Record<string, number> };
      const normalizedRanges = Object.fromEntries(
        Object.entries(rangesByServer).map(([serverId, rangeDays]) => [Number(serverId), rangeDays])
      ) as Record<number, number>;

      return insightGraphService.getPinnedDashboard(userId, normalizedRanges, async serverId =>
        withAuth(ctx, serverId, async (api, server) => {
          const { SearchApi } = await import('@alfresco/js-api');
          const searchApi = new SearchApi(api);
          return {
            searchFn: searchApi.search.bind(searchApi) as any,
            serverName: server.name,
            serverLabel: server.label ?? null,
          };
        })
      );
    },
  };
}
