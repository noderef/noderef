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

import type { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);
`;

type MigrationFile = {
  checksum: string;
  filePath: string;
  name: string;
  sql: string;
};

type AppliedMigrationRow = {
  checksum: string;
};

export type MigrationRunResult = {
  applied: string[];
  skipped: string[];
};

function resolveMigrationsDir(): string {
  const directCandidates = [
    path.resolve(__dirname, '../../prisma/migrations'),
    path.resolve(process.cwd(), 'apps/backend/prisma/migrations'),
    path.resolve(process.cwd(), 'resources/node-src/prisma/migrations'),
    path.resolve(process.cwd(), 'prisma/migrations'),
  ];

  for (const candidate of directCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  let cur = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(cur, 'prisma', 'migrations');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  throw new Error(`Could not locate prisma/migrations from ${__dirname}`);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '-' && next === '-') {
        current += ch + next;
        i++;
        inLineComment = true;
        continue;
      }

      if (ch === '/' && next === '*') {
        current += ch + next;
        i++;
        inBlockComment = true;
        continue;
      }
    }

    if (ch === "'" && !inDouble && !inBacktick) {
      if (inSingle && next === "'") {
        current += ch + next;
        i++;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle && !inBacktick) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (ch === '`' && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (ch === ';' && !inSingle && !inDouble && !inBacktick) {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
}

function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const migrations: MigrationFile[] = [];

  for (const migrationName of migrationDirs) {
    const migrationSqlPath = path.join(migrationsDir, migrationName, 'migration.sql');
    if (!existsSync(migrationSqlPath)) {
      continue;
    }

    const sql = readFileSync(migrationSqlPath, 'utf8').replace(/^\uFEFF/, '');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    migrations.push({
      checksum,
      filePath: migrationSqlPath,
      name: migrationName,
      sql,
    });
  }

  return migrations;
}

async function ensureMigrationsTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(MIGRATIONS_TABLE_SQL);
}

async function getAppliedMigration(
  prisma: PrismaClient,
  migrationName: string
): Promise<AppliedMigrationRow | null> {
  const rows = await prisma.$queryRawUnsafe<AppliedMigrationRow[]>(
    `SELECT "checksum" FROM "_prisma_migrations" WHERE "migration_name" = ? AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL LIMIT 1`,
    migrationName
  );

  return rows[0] ?? null;
}

async function executeMigrationSql(prisma: PrismaClient, sql: string): Promise<number> {
  const statements = splitSqlStatements(sql);
  if (!statements.length) return 0;

  await prisma.$executeRawUnsafe('BEGIN');
  try {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    await prisma.$executeRawUnsafe('COMMIT');
  } catch (error) {
    await prisma.$executeRawUnsafe('ROLLBACK');
    throw error;
  }

  return statements.length;
}

export async function applyPendingPrismaMigrations(
  prisma: PrismaClient
): Promise<MigrationRunResult> {
  const migrationsDir = resolveMigrationsDir();
  const migrationFiles = loadMigrationFiles(migrationsDir);

  await ensureMigrationsTable(prisma);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrationFiles) {
    const alreadyApplied = await getAppliedMigration(prisma, migration.name);
    if (alreadyApplied) {
      if (alreadyApplied.checksum !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.name}. ` +
            `Applied checksum=${alreadyApplied.checksum}, file checksum=${migration.checksum}`
        );
      }
      skipped.push(migration.name);
      continue;
    }

    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, 0)`,
      id,
      migration.checksum,
      migration.name,
      new Date().toISOString()
    );

    try {
      const appliedSteps = await executeMigrationSql(prisma, migration.sql);
      await prisma.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET "finished_at" = CURRENT_TIMESTAMP, "applied_steps_count" = ? WHERE "id" = ?`,
        appliedSteps,
        id
      );
      applied.push(migration.name);
    } catch (error) {
      const logs = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      await prisma.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET "logs" = ?, "rolled_back_at" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        logs.slice(0, 1000000),
        id
      );
      throw new Error(`Failed to apply migration "${migration.name}" (${migration.filePath}): ${logs}`);
    }
  }

  return { applied, skipped };
}
