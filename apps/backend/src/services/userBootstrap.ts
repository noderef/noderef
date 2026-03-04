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
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { getDatabasePath } from '../lib/paths';
import { log } from '../lib/logger.js';
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
CREATE TABLE IF NOT EXISTS "agent_chat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "chatIcon" TEXT NOT NULL DEFAULT 'hash',
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_chat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "agent_chat" ADD COLUMN "chatIcon" TEXT NOT NULL DEFAULT 'hash';
CREATE TABLE IF NOT EXISTS "agent_message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "agent_chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "agent_run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "triggerMessageId" INTEGER,
    "status" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "planJson" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_run_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "agent_chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_run_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_run_triggerMessageId_fkey" FOREIGN KEY ("triggerMessageId") REFERENCES "agent_message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "agent_run_step" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmationToken" TEXT,
    "confirmedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_run_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "agent_run_event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_run_event_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_run_event_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "agent_run_step" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "agent_operation_audit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetSummary" TEXT,
    "requestMessageId" INTEGER,
    "confirmationMessageId" INTEGER,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_operation_audit_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "agent_run_step" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_requestMessageId_fkey" FOREIGN KEY ("requestMessageId") REFERENCES "agent_message" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_confirmationMessageId_fkey" FOREIGN KEY ("confirmationMessageId") REFERENCES "agent_message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE INDEX IF NOT EXISTS "agent_chat_userId_serverId_updatedAt_idx" ON "agent_chat"("userId", "serverId", "updatedAt");
CREATE INDEX IF NOT EXISTS "agent_chat_userId_updatedAt_idx" ON "agent_chat"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "agent_message_chatId_id_idx" ON "agent_message"("chatId", "id");
CREATE INDEX IF NOT EXISTS "agent_message_chatId_createdAt_idx" ON "agent_message"("chatId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_run_chatId_createdAt_idx" ON "agent_run"("chatId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_run_userId_status_createdAt_idx" ON "agent_run"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_run_serverId_status_idx" ON "agent_run"("serverId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_run_step_runId_ordinal_key" ON "agent_run_step"("runId", "ordinal");
CREATE INDEX IF NOT EXISTS "agent_run_step_runId_createdAt_idx" ON "agent_run_step"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_run_event_runId_id_idx" ON "agent_run_event"("runId", "id");
CREATE INDEX IF NOT EXISTS "agent_run_event_runId_createdAt_idx" ON "agent_run_event"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_operation_audit_runId_stepId_createdAt_idx" ON "agent_operation_audit"("runId", "stepId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_operation_audit_userId_createdAt_idx" ON "agent_operation_audit"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_operation_audit_operation_createdAt_idx" ON "agent_operation_audit"("operation", "createdAt");
`;

function isIgnorableEmbeddedSchemaError(statement: string, error: unknown): boolean {
  const normalizedStatement = statement.toLowerCase().replace(/\s+/g, ' ').trim();
  const message = String((error as any)?.message || '').toLowerCase();

  const isAddColumn =
    normalizedStatement.startsWith('alter table') && normalizedStatement.includes(' add column ');
  if (isAddColumn && message.includes('duplicate column name')) {
    return true;
  }

  return false;
}

async function applyEmbeddedSchema(client: PrismaClient) {
  const statements = EMBEDDED_SCHEMA_SQL.split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  for (const stmt of statements) {
    try {
      await client.$executeRawUnsafe(`${stmt};`);
    } catch (error) {
      if (isIgnorableEmbeddedSchemaError(stmt, error)) {
        continue;
      }
      throw error;
    }
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
      log.error({ err }, 'Prisma migrate deploy failed (dev path)');
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
        log.error(
          { err: migrationError },
          'Failed to auto-run migrations for system user bootstrap'
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
