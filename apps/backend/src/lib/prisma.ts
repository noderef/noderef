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

// apps/backend/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { getDatabasePath } from './paths';

let prisma: PrismaClient | null = null;

const SCHEMA_ENGINE_FILES: Record<string, string[]> = {
  darwin: ['schema-engine-darwin'],
  'darwin-arm64': ['schema-engine-darwin-arm64'],
  windows: ['schema-engine-windows.exe'],
  'debian-openssl-3.0.x': ['schema-engine-debian-openssl-3.0.x'],
  'linux-arm64-openssl-3.0.x': ['schema-engine-linux-arm64-openssl-3.0.x'],
};

/**
 * Prisma binary targets we bundle for the current runtime platform.
 * Used for resolving schema/query engines inside packaged apps.
 */
export function prismaBinaryTargetsForCurrentPlatform(): string[] {
  if (process.platform === 'win32') {
    return ['windows'];
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64'
      ? ['linux-arm64-openssl-3.0.x', 'debian-openssl-3.0.x']
      : ['debian-openssl-3.0.x', 'linux-arm64-openssl-3.0.x'];
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? ['darwin-arm64', 'darwin'] : ['darwin', 'darwin-arm64'];
  }
  return [];
}

/**
 * Locate the bundled schema engine for the current platform within backendRoot.
 */
export function findSchemaEngineBinary(backendRoot: string): string | null {
  const prismaDir = path.join(backendRoot, 'node_modules', 'prisma');
  if (!existsSync(prismaDir)) return null;

  try {
    const files = readdirSync(prismaDir);
    for (const target of prismaBinaryTargetsForCurrentPlatform()) {
      const match = SCHEMA_ENGINE_FILES[target]?.find(name => files.includes(name));
      if (match) return path.join(prismaDir, match);
    }
    const fallback = files.find(f => f.startsWith('schema-engine'));
    return fallback ? path.join(prismaDir, fallback) : null;
  } catch {
    return null;
  }
}

/**
 * Get a singleton instance of PrismaClient with dynamic database path
 * In development, always uses the project root dev.db to prevent Prisma from
 * creating databases in the wrong location (e.g., apps/backend/prisma/dev.db)
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  if (!prisma) {
    // In development, always override DATABASE_URL to use project root
    // This prevents Prisma from creating databases in apps/backend/prisma/dev.db
    // when .env has a relative path like "file:./dev.db"
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    if (isDev) {
      const dbPath = getDatabasePath();
      process.env.DATABASE_URL = `file:${dbPath}`;
    } else if (!process.env.DATABASE_URL) {
      // Production: use DATABASE_URL from env if set, otherwise use dynamic path
      const dbPath = getDatabasePath();
      process.env.DATABASE_URL = `file:${dbPath}`;
    }

    prisma = new PrismaClient({
      log: ['error', 'warn'],
    });

    // Ensure connection is established
    await prisma.$connect();
  }

  return prisma;
}

/**
 * Disconnect Prisma client
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
