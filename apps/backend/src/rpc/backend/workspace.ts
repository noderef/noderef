/**
 * Copyright 2025 NodeRef
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
 * Workspace and Node History RPC handlers
 * Handles backend.workspace.* and backend.nodeHistory.* RPC methods
 */

import { z } from 'zod';
import { getUser } from '../../services/userSettings.js';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';

/**
 * Register all workspace and node history related RPC handlers
 */
export function registerWorkspaceHandlers(routes: Routes, ctx: RpcContext): void {
  const {
    serverService,
    savedSearchService,
    nodeHistoryService,
    localFileService,
    jsConsoleHistoryService,
  } = ctx;

  routes['backend.workspace.load'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const [servers, localFilesPage, savedSearches, user, nodeHistory, recentJsConsoleHistory] =
        await Promise.all([
          serverService.findAll(userId),
          localFileService.list(userId, { take: 20 }),
          savedSearchService.findAll(userId),
          getUser(userId),
          nodeHistoryService.getActivitySummary(userId, { limit: 20 }),
          jsConsoleHistoryService.list(userId, { limit: 20 }),
        ]);

      const localFiles = {
        items: localFilesPage.items,
        pagination: {
          totalItems: localFilesPage.total,
          skipCount: localFilesPage.skip,
          maxItems: localFilesPage.take,
          hasMoreItems: localFilesPage.hasMoreItems,
        },
      };

      return {
        servers,
        localFiles,
        savedSearches,
        recentNodeHistory: nodeHistory.timeline,
        recentJsConsoleHistory: recentJsConsoleHistory.items,
        user: user
          ? {
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              thumbnail: user.thumbnail ?? null,
            }
          : null,
      };
    },
  };

  routes['backend.nodeHistory.activity'] = {
    schema: z.object({
      serverId: z.number().int().positive().optional(),
      days: z.number().int().min(7).max(366).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, days, limit, offset } = params as {
        serverId?: number;
        days?: number;
        limit?: number;
        offset?: number;
      };

      return nodeHistoryService.getActivitySummary(userId, {
        serverId,
        days,
        limit,
        offset,
      });
    },
  };
}
