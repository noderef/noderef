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
 * User bootstrap helper
 * Ensures exactly one system user exists on first launch (desktop MVP)
 * Multi-user ready for future cloud deployment
 */

import type { PrismaClient } from '@prisma/client';
import { applyPendingPrismaMigrations } from '../lib/migrations.js';
import { log } from '../lib/logger.js';
import { getPrismaClient } from '../lib/prisma.js';

function isMissingTableError(error: unknown): boolean {
  return Boolean((error as any)?.code === 'P2021'); // Prisma "table does not exist"
}

/**
 * Ensure system user exists
 * Creates a default user if none exists (desktop single-user mode)
 * Returns the user ID to use for all operations
 */
export async function ensureSystemUser(prisma?: PrismaClient): Promise<number> {
  const client = prisma || (await getPrismaClient());

  // Check if any users exist
  let existingUser;
  try {
    existingUser = await client.user.findFirst();
  } catch (error) {
    if (isMissingTableError(error)) {
      try {
        await applyPendingPrismaMigrations(client);
        existingUser = await client.user.findFirst();
      } catch (migrationError) {
        log.error(
          { err: migrationError },
          'Failed to auto-run Prisma migrations for system user bootstrap'
        );
        throw migrationError;
      }
    } else {
      throw error;
    }
  }

  if (existingUser) {
    return existingUser.id;
  }

  // Create default system user for desktop MVP
  const user = await client.user.create({
    data: {
      username: 'system',
      email: null,
    },
  });

  return user.id;
}

/**
 * Get the current user ID
 * For desktop MVP, this always returns the single system user
 * In cloud deployment, this would extract user from authentication context
 */
export async function getCurrentUserId(): Promise<number> {
  return ensureSystemUser();
}
