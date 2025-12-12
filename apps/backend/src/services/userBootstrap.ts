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
 * User bootstrap helper
 * Ensures exactly one system user exists on first launch (desktop MVP)
 * Multi-user ready for future cloud deployment
 */

import type { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { getDatabasePath } from '../lib/paths';
import { findSchemaEngineBinary, getPrismaClient } from '../lib/prisma.js';

function isMissingTableError(error: unknown): boolean {
  return Boolean((error as any)?.code === 'P2021'); // Prisma "table does not exist"
}

const EMBEDDED_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "fullName" TEXT,
    "thumbnail" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiAssistantEnabled" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "server" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "serverType" TEXT NOT NULL DEFAULT 'alfresco',
    "authType" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "token" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" DATETIME,
    "oidcHost" TEXT,
    "oidcRealm" TEXT,
    "oidcClientId" TEXT,
    "jsconsoleEndpoint" TEXT,
    "thumbnail" BLOB,
    "color" TEXT,
    "label" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "lastAccessed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "saved_search" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "columns" TEXT,
    "lastAccessed" DATETIME,
    "lastDiffCount" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "saved_search_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "search_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "searchId" INTEGER,
    "query" TEXT NOT NULL,
    "resultsCount" INTEGER,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "search_history_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "saved_search" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "local_file" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "content" TEXT,
    "deletedAt" DATETIME,
    "lastModified" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "local_file_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "node_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "nodeRef" TEXT NOT NULL,
    "parentRef" TEXT,
    "name" TEXT,
    "path" TEXT,
    "type" TEXT,
    "mimetype" TEXT,
    "accessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "node_history_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "jsconsole_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER,
    "script" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jsconsole_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "jsconsole_history_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "user_ai_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_ai_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_key" ON "user"("username");
CREATE INDEX IF NOT EXISTS "server_userId_displayOrder_idx" ON "server"("userId", "displayOrder");
CREATE INDEX IF NOT EXISTS "saved_search_userId_serverId_idx" ON "saved_search"("userId", "serverId");
CREATE INDEX IF NOT EXISTS "search_history_userId_searchId_idx" ON "search_history"("userId", "searchId");
CREATE INDEX IF NOT EXISTS "local_file_userId_idx" ON "local_file"("userId");
CREATE INDEX IF NOT EXISTS "node_history_userId_serverId_idx" ON "node_history"("userId", "serverId");
CREATE INDEX IF NOT EXISTS "jsconsole_history_userId_idx" ON "jsconsole_history"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_ai_settings_userId_provider_key" ON "user_ai_settings"("userId", "provider");
CREATE INDEX IF NOT EXISTS "user_ai_settings_userId_provider_idx" ON "user_ai_settings"("userId", "provider");
`;

async function applyEmbeddedSchema(client: PrismaClient) {
  const statements = EMBEDDED_SCHEMA_SQL.split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  for (const stmt of statements) {
    await client.$executeRawUnsafe(`${stmt};`);
  }
}

async function runMigrations(prismaForFallback?: PrismaClient) {
  // In production we do not bundle Prisma CLI; rely on embedded schema if needed.
  const isDev = existsSync(path.resolve(process.cwd(), 'apps/backend'));

  if (isDev || process.env.PRISMA_RUN_MIGRATIONS === '1') {
    const backendRoot = path.resolve(process.cwd(), 'apps/backend');
    const prismaCmd = process.platform === 'win32' ? 'npx prisma.cmd' : 'npx prisma';
    try {
      execFileSync(prismaCmd, ['migrate', 'deploy'], {
        stdio: 'inherit',
        cwd: backendRoot,
      });
      return;
    } catch (err) {
      console.error('Prisma migrate deploy failed (dev path):', err);
    }
  }

  // Fallback: embedded schema
  if (prismaForFallback) {
    await applyEmbeddedSchema(prismaForFallback);
    return;
  }

  throw new Error('Prisma migrations unavailable and embedded schema fallback not provided');
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
        await runMigrations(client);
        existingUser = await client.user.findFirst();
      } catch (migrationError) {
        console.error('Failed to auto-run migrations for system user bootstrap:', migrationError);
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
