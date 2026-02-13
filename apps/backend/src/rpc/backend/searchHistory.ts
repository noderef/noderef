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
 * Search History RPC handlers
 * Handles all backend.searchHistory.* RPC methods
 */

import { z } from 'zod';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';

/**
 * Register all search history related RPC handlers
 */
export function registerSearchHistoryHandlers(routes: Routes, ctx: RpcContext): void {
  const { searchHistoryService } = ctx;

  routes['backend.searchHistory.list'] = {
    schema: z.object({
      limit: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { limit } = params as { limit?: number };
      return searchHistoryService.list(userId, limit);
    },
  };

  routes['backend.searchHistory.create'] = {
    schema: z.object({
      query: z.string(),
      resultsCount: z.number().optional().nullable(),
      searchId: z.number().optional().nullable(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as {
        query: string;
        resultsCount?: number | null;
        searchId?: number | null;
      };
      return searchHistoryService.create(userId, data);
    },
  };
}
