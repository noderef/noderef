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
 * Local Files RPC handlers
 * Handles all backend.localFiles.* RPC methods
 */

import { z } from 'zod';
import { AppErrors } from '../../lib/errors.js';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';

/**
 * Register all local files related RPC handlers
 */
export function registerLocalFilesHandlers(routes: Routes, ctx: RpcContext): void {
  const { localFileService } = ctx;

  routes['backend.localFiles.list'] = {
    schema: z.object({
      query: z.string().optional(),
      skipCount: z.number().int().min(0).optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
      sortBy: z.enum(['name', 'lastModified', 'createdAt', 'type']).optional(),
      sortDir: z.enum(['asc', 'desc']).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { query, skipCount, maxItems, sortBy, sortDir } = params as {
        query?: string;
        skipCount?: number;
        maxItems?: number;
        sortBy?: 'name' | 'lastModified' | 'createdAt' | 'type';
        sortDir?: 'asc' | 'desc';
      };
      const result = await localFileService.list(userId, {
        search: query,
        skip: skipCount,
        take: maxItems,
        sortBy,
        sortDir,
      });
      return {
        items: result.items,
        pagination: {
          totalItems: result.total,
          skipCount: result.skip,
          maxItems: result.take,
          hasMoreItems: result.hasMoreItems,
        },
      };
    },
  };

  routes['backend.localFiles.create'] = {
    schema: z.object({
      name: z.string().min(1).max(255),
      type: z.string().max(255).nullable().optional(),
      content: z.string().nullable().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { name, type, content } = params as {
        name: string;
        type?: string | null;
        content?: string | null;
      };

      return localFileService.create(userId, {
        name,
        type: type ?? null,
        content: content ?? '',
      });
    },
  };

  routes['backend.localFiles.update'] = {
    schema: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255).optional(),
      type: z.string().max(255).nullable().optional(),
      content: z.string().nullable().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, name, type, content } = params as {
        id: number;
        name?: string;
        type?: string | null;
        content?: string | null;
      };

      const payload: {
        name?: string;
        type?: string | null;
        content?: string | null;
      } = {
        name,
        type: type ?? null,
      };

      if (Object.prototype.hasOwnProperty.call(params as object, 'content')) {
        payload.content = content ?? '';
      }

      const updated = await localFileService.update(userId, id, payload);

      if (!updated) {
        AppErrors.notFound('Local file', id);
      }

      return updated;
    },
  };

  routes['backend.localFiles.delete'] = {
    schema: z.object({
      id: z.number().int().positive(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await localFileService.softDelete(userId, id);
      return { success };
    },
  };
}
