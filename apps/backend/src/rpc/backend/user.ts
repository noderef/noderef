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
 * User RPC handlers
 * Handles all backend.user.* RPC methods
 */

import { z } from 'zod';
import { AppErrors } from '../../lib/errors.js';
import { getUser, updateUserProfile } from '../../services/userSettings.js';
import type { Routes } from './types.js';
import { getCurrentUserId } from './withAuth.js';

/**
 * Register all user-related RPC handlers
 */
export function registerUserHandlers(routes: Routes): void {
  routes['backend.user.get'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const user = await getUser(userId);
      if (!user) {
        AppErrors.notFound('User');
      }
      // TypeScript doesn't recognize never-return, so we assert user is defined
      const userDefined = user!;
      return {
        id: userDefined.id,
        username: userDefined.username,
        fullName: userDefined.fullName,
        email: userDefined.email,
        thumbnail: userDefined.thumbnail ?? null,
      };
    },
  };

  routes['backend.user.update'] = {
    schema: z.object({
      fullName: z.string().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { fullName, thumbnail } = params as {
        fullName?: string | null;
        thumbnail?: string | null;
      };
      await updateUserProfile(userId, {
        fullName: fullName === undefined ? undefined : fullName,
        thumbnail: thumbnail === undefined ? undefined : thumbnail,
      });
      return { success: true, thumbnail: thumbnail ?? null };
    },
  };
}
