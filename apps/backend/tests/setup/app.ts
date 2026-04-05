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
 * Test Application Setup
 *
 * Creates a test-ready Express app with RPC handlers that use
 * repository layer directly, avoiding Alfresco service dependencies.
 */

import type { Server } from '@app/contracts';
import type { Express } from 'express';
import express from 'express';
import { z } from 'zod';

import { JsConsoleHistoryRepository } from '../../src/repositories/jsConsoleHistoryRepository.js';
import { LocalFileRepository } from '../../src/repositories/localFileRepository.js';
import { NodeHistoryRepository } from '../../src/repositories/nodeHistoryRepository.js';
import { SavedSearchRepository } from '../../src/repositories/savedSearchRepository.js';
import { SearchHistoryRepository } from '../../src/repositories/searchHistoryRepository.js';
import { ServerRepository } from '../../src/repositories/serverRepository.js';
import { UserRepository } from '../../src/repositories/userRepository.js';
import { InsightGraphService } from '../../src/services/insightGraphService.js';
import { InsightRangeDaysSchema } from '../../src/constants/insights.js';

import { prisma } from './database';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Routes = Record<string, { schema: z.ZodTypeAny; handler: (p: unknown) => Promise<unknown> }>;

// -----------------------------------------------------------------------------
// Test User Management
// -----------------------------------------------------------------------------

let testApp: Express | null = null;
let testUserId: number | null = null;
const routes: Routes = {};

async function getTestUserId(): Promise<number> {
  if (testUserId !== null) {
    return testUserId;
  }
  let user = await prisma.user.findUnique({ where: { username: 'testuser' } });
  if (!user) {
    user = await prisma.user.create({
      data: { username: 'testuser', email: 'test@example.com' },
    });
  }
  testUserId = user.id;
  return testUserId;
}

/**
 * Reset cached test user ID (call in beforeEach after cleanupTables)
 */
export function resetTestUserId(): void {
  testUserId = null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Strip credentials from server for public response */
function toPublicServer(server: Server) {
  return {
    ...server,
    token: undefined,
    refreshToken: undefined,
    username: undefined,
    hasCredentials: !!(server.username || server.token),
  };
}

/** Simple RPC handler for tests */
function rpcHandler(routes: Routes) {
  return async (req: express.Request, res: express.Response) => {
    const { method, params } = req.body ?? {};

    if (typeof method !== 'string' || !routes[method]) {
      return res.status(404).json({ error: 'Unknown method' });
    }

    try {
      const route = routes[method];
      const parsed = route.schema.parse(params);
      const result = await route.handler(parsed);
      return res.json(result);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Validation error' });
      }
      console.error('RPC Error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  };
}

// -----------------------------------------------------------------------------
// Handler Registration
// -----------------------------------------------------------------------------

function registerServerHandlers(routes: Routes, repo: ServerRepository): void {
  const insightRangeDaysSchema = InsightRangeDaysSchema;

  routes['backend.servers.list'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getTestUserId();
      return (await repo.findAll(userId)).map(toPublicServer);
    },
  };

  routes['backend.servers.get'] = {
    schema: z.object({ id: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      const server = await repo.findById(userId, (p as { id: number }).id);
      return server ? toPublicServer(server) : null;
    },
  };

  routes['backend.servers.create'] = {
    schema: z.object({
      name: z.string(),
      baseUrl: z.string(),
      serverType: z.string().optional(),
      authType: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      insightRangeDays: insightRangeDaysSchema.optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { name, baseUrl, serverType, authType, username, insightRangeDays } = p as any;
      const server = await repo.create({
        userId,
        name,
        baseUrl,
        isAdmin: true,
        serverType: serverType ?? 'alfresco',
        authType,
        username,
        insightRangeDays,
      });
      return toPublicServer(server);
    },
  };

  routes['backend.servers.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      baseUrl: z.string().optional(),
      label: z.string().nullable().optional(),
      insightRangeDays: insightRangeDaysSchema.optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { id, ...data } = p as any;
      const server = await repo.update(userId, id, data);
      return server ? toPublicServer(server) : null;
    },
  };

  routes['backend.servers.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      return { success: await repo.delete(userId, (p as { id: number }).id) };
    },
  };

  routes['backend.servers.reorder'] = {
    schema: z.object({
      orders: z.array(z.object({ id: z.number(), displayOrder: z.number() })),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      await repo.reorder(userId, (p as any).orders);
      return {};
    },
  };
}

function registerSavedSearchHandlers(routes: Routes, repo: SavedSearchRepository): void {
  routes['backend.savedSearches.list'] = {
    schema: z.object({ serverId: z.number().optional() }),
    handler: async p => {
      const userId = await getTestUserId();
      return repo.findAll(userId, (p as { serverId?: number }).serverId);
    },
  };

  routes['backend.savedSearches.get'] = {
    schema: z.object({ id: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      return repo.findById(userId, (p as { id: number }).id);
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
    handler: async p => {
      const userId = await getTestUserId();
      const { serverId, name, query, columns, isDefault } = p as any;
      return repo.create({ userId, serverId, name, query, columns, isDefault });
    },
  };

  routes['backend.savedSearches.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      query: z.string().optional(),
      columns: z.string().nullable().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { id, ...data } = p as any;
      return repo.update(userId, id, data);
    },
  };

  routes['backend.savedSearches.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      return { success: await repo.delete(userId, (p as { id: number }).id) };
    },
  };
}

function registerUserHandlers(routes: Routes, repo: UserRepository): void {
  routes['backend.user.get'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getTestUserId();
      const user = await repo.findById(userId);
      if (!user) throw new Error('User not found');
      return {
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        fullName: user.fullName ?? null,
        thumbnail: null,
      };
    },
  };

  routes['backend.user.update'] = {
    schema: z.object({ fullName: z.string().nullable().optional() }),
    handler: async p => {
      const userId = await getTestUserId();
      await repo.updateProfile(userId, { fullName: (p as any).fullName });
      return { success: true };
    },
  };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Get or create the test Express app (singleton)
 */
export async function getTestApp(): Promise<Express> {
  if (testApp) return testApp;

  testApp = express();
  testApp.use(express.json());

  // Create repositories using test database
  const serverRepo = new ServerRepository(prisma);
  const savedSearchRepo = new SavedSearchRepository(prisma);
  const userRepo = new UserRepository(prisma);
  const searchHistoryRepo = new SearchHistoryRepository(prisma);
  const localFileRepo = new LocalFileRepository(prisma);
  const nodeHistoryRepo = new NodeHistoryRepository(prisma);
  const jsConsoleHistoryRepo = new JsConsoleHistoryRepository(prisma);

  // Register all test handlers
  registerServerHandlers(routes, serverRepo);
  registerSavedSearchHandlers(routes, savedSearchRepo);
  registerUserHandlers(routes, userRepo);
  registerSearchHistoryHandlers(routes, searchHistoryRepo);
  registerLocalFileHandlers(routes, localFileRepo);
  registerNodeHistoryHandlers(routes, nodeHistoryRepo);
  registerJsConsoleHistoryHandlers(routes, jsConsoleHistoryRepo);

  const insightGraphService = new InsightGraphService(prisma);
  registerInsightGraphHandlers(routes, insightGraphService);

  testApp.post('/rpc', rpcHandler(routes));

  return testApp;
}

// -----------------------------------------------------------------------------
// Additional Handlers
// -----------------------------------------------------------------------------

function registerSearchHistoryHandlers(routes: Routes, repo: SearchHistoryRepository): void {
  routes['backend.searchHistory.list'] = {
    schema: z.object({ limit: z.number().optional() }),
    handler: async p => {
      const userId = await getTestUserId();
      return repo.list(userId, (p as any).limit ?? 10);
    },
  };

  routes['backend.searchHistory.create'] = {
    schema: z.object({
      query: z.string(),
      searchId: z.number().nullable().optional(),
      resultsCount: z.number().nullable().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { query, searchId, resultsCount } = p as any;
      return repo.create({ userId, query, searchId, resultsCount });
    },
  };
}

function registerLocalFileHandlers(routes: Routes, repo: LocalFileRepository): void {
  routes['backend.localFiles.list'] = {
    schema: z.object({
      search: z.string().optional(),
      skip: z.number().optional(),
      take: z.number().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { search, skip, take } = p as any;
      return repo.list(userId, { search, skip, take });
    },
  };

  routes['backend.localFiles.create'] = {
    schema: z.object({
      name: z.string(),
      type: z.string().optional(),
      content: z.string().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { name, type, content } = p as any;
      return repo.create(userId, { name, type, content });
    },
  };

  routes['backend.localFiles.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      content: z.string().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { id, ...data } = p as any;
      return repo.update(userId, id, data);
    },
  };

  routes['backend.localFiles.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      return { success: await repo.softDelete(userId, (p as { id: number }).id) };
    },
  };
}

function registerNodeHistoryHandlers(routes: Routes, repo: NodeHistoryRepository): void {
  routes['backend.nodeHistory.activity'] = {
    schema: z.object({
      serverId: z.number().optional(),
      days: z.number().optional(),
      limit: z.number().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { serverId, days, limit } = p as any;
      return repo.getActivitySummary(userId, { serverId, days, limit });
    },
  };
}

function registerJsConsoleHistoryHandlers(routes: Routes, repo: JsConsoleHistoryRepository): void {
  routes['backend.jsconsole.getHistory'] = {
    schema: z.object({
      serverId: z.number().optional(),
      limit: z.number().optional(),
      cursor: z.number().optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { serverId, limit, cursor } = p as any;
      return repo.list(userId, { serverId, limit, cursor });
    },
  };
}

function registerInsightGraphHandlers(routes: Routes, service: InsightGraphService): void {
  routes['backend.serverInsights.listGraphs'] = {
    schema: z.object({ serverId: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      return service.findAllByServer(userId, (p as { serverId: number }).serverId);
    },
  };

  routes['backend.serverInsights.createGraph'] = {
    schema: z.object({
      serverId: z.number(),
      title: z.string().min(1),
      filterQuery: z.string().min(1),
      dateField: z.string().min(1),
      color: z.string().optional(),
      columnSpan: z.number().min(1).max(2).optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const data = p as any;
      return service.create(userId, data);
    },
  };

  routes['backend.serverInsights.updateGraph'] = {
    schema: z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      filterQuery: z.string().min(1).optional(),
      dateField: z.string().min(1).optional(),
      color: z.string().optional(),
      displayOrder: z.number().optional(),
      columnSpan: z.number().min(1).max(2).optional(),
    }),
    handler: async p => {
      const userId = await getTestUserId();
      const { id, ...data } = p as any;
      return service.update(userId, id, data);
    },
  };

  routes['backend.serverInsights.deleteGraph'] = {
    schema: z.object({ id: z.number() }),
    handler: async p => {
      const userId = await getTestUserId();
      return { success: await service.delete(userId, (p as { id: number }).id) };
    },
  };
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

/**
 * Helper to construct RPC request body
 */
export function rpc(method: string, params: Record<string, unknown> = {}) {
  return { method, params };
}
