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
 * Test Database Setup
 *
 * This module configures Prisma to use an isolated test.db
 * and provides helpers for cleaning up between test suites.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '../../test.db');

// Force DATABASE_URL to point to test.db
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;

// Create a dedicated Prisma client for tests
export const prisma = new PrismaClient({
  log: ['error'],
});

/**
 * Clean up all tables (reset state between test suites)
 */
export async function cleanupTables(): Promise<void> {
  // Delete in correct order to respect foreign key constraints
  await prisma.jsConsoleHistory.deleteMany();
  await prisma.nodeHistory.deleteMany();
  await prisma.searchHistory.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.localFile.deleteMany();
  await prisma.userAiSettings.deleteMany();
  await prisma.server.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Ensure test user exists for all tests
 */
export async function ensureTestUser(): Promise<{ id: number; username: string }> {
  let user = await prisma.user.findUnique({ where: { username: 'testuser' } });
  if (!user) {
    user = await prisma.user.create({
      data: { username: 'testuser', email: 'test@example.com' },
    });
  }
  return { id: user.id, username: user.username };
}

// Global setup: run migrations and connect
beforeAll(async () => {
  // Run migrations to ensure test.db schema is up to date
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
      stdio: 'pipe',
    });
  } catch (error) {
    console.error('Failed to initialize test database:', error);
  }

  await prisma.$connect();
  await cleanupTables();
});

// Global teardown: disconnect
afterAll(async () => {
  await prisma.$disconnect();
});
