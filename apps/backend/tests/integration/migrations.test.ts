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

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { applyPendingPrismaMigrations } from '../../src/lib/migrations';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n/g)
    .map(statement => statement.trim())
    .filter(Boolean);
}

describe('applyPendingPrismaMigrations', () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map(target => fs.rm(target, { recursive: true, force: true })));
  });

  it('upgrades a legacy database that has schema tables but no _prisma_migrations rows', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noderef-migrations-'));
    cleanupPaths.push(tempDir);

    const dbPath = path.join(tempDir, 'legacy.db');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${dbPath}`,
        },
      },
      log: ['error'],
    });

    try {
      await prisma.$connect();

      const initMigrationPath = path.join(
        __dirname,
        '../../prisma/migrations/20251105220620_init/migration.sql'
      );
      const initSql = await fs.readFile(initMigrationPath, 'utf8');
      for (const statement of splitSqlStatements(initSql)) {
        await prisma.$executeRawUnsafe(statement);
      }

      const result = await applyPendingPrismaMigrations(prisma);

      expect(result.applied).toEqual([
        '20251105220620_init',
        '20260216213900_agent',
      ]);

      const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_%' ORDER BY name`
      );
      expect(tables.map(row => row.name)).toEqual([
        'agent_chat',
        'agent_message',
        'agent_operation_audit',
        'agent_run',
        'agent_run_event',
        'agent_run_step',
      ]);

      const appliedMigrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "migration_name"`
      );
      expect(appliedMigrations.map(row => row.migration_name)).toEqual([
        '20251105220620_init',
        '20260216213900_agent',
      ]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
