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
 * Saved Search RPC handlers
 * Handles all backend.savedSearches.* RPC methods
 */

import { z } from 'zod';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';

/**
 * Register all saved search related RPC handlers
 */
export function registerSavedSearchesHandlers(routes: Routes, ctx: RpcContext): void {
  const { savedSearchService } = ctx;

  routes['backend.savedSearches.list'] = {
    schema: z.object({
      serverId: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId?: number };
      return savedSearchService.findAll(userId, serverId);
    },
  };

  routes['backend.savedSearches.get'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return savedSearchService.findById(userId, id);
    },
  };

  routes['backend.savedSearches.create'] = {
    schema: z.object({
      serverId: z.number(),
      name: z.string(),
      query: z.string(),
      columns: z.string().nullable().optional(),
      isDefault: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as {
        serverId: number;
        name: string;
        query: string;
        columns?: string | null;
        isDefault?: boolean;
      };
      return savedSearchService.create(userId, data);
    },
  };

  routes['backend.savedSearches.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      query: z.string().optional(),
      columns: z.string().nullable().optional(),
      isDefault: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, ...data } = params as {
        id: number;
        name?: string;
        query?: string;
        columns?: string | null;
        isDefault?: boolean;
      };
      return savedSearchService.update(userId, id, data);
    },
  };

  routes['backend.savedSearches.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await savedSearchService.delete(userId, id);
      return { success };
    },
  };
}
