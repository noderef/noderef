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
 * Route registration barrel export
 */

import type { Express } from 'express';
import type { z } from 'zod';
import { createAiRouter } from '../ai/index.js';
import type { RepositoryJsLibService } from '../services/repositoryJsLibService.js';
import { log } from '../lib/logger.js';
import { ServerService } from '../services/serverService.js';
import { healthHandler, type HealthRouteOptions } from './health.js';
import { oauthCallbackHandler } from './oauth.js';
import { registerPingRoute, rpcDebugHandler, rpcHandler, type Routes } from './rpc.js';
import { createUploadMiddleware, rpcBinaryHandler } from './rpcBinary.js';
import { agentRunStreamHandler } from './agentRunStream.js';
import { rpcStreamHandler } from './rpcStream.js';
import {
  webAuthLoginHandler,
  webAuthLoginRateLimiter,
  webAuthStatusHandler,
  webPasswordGateMiddleware,
} from './webAuth.js';

export type { Routes } from './rpc.js';

export interface RegisterRoutesOptions {
  app: Express;
  routes: Routes;
  contracts: any;
  serverService: ServerService;
  repositoryJsLibService: RepositoryJsLibService;
  version: string;
  buildId: string;
  exposeDebug: boolean;
}

/**
 * Register all route handlers on the Express app
 */
export async function registerRoutes({
  app,
  routes,
  contracts,
  serverService,
  repositoryJsLibService,
  version,
  buildId,
  exposeDebug,
}: RegisterRoutesOptions): Promise<void> {
  // Health check endpoint
  app.get('/health', healthHandler({ version, buildId }));

  // Optional Docker web password gate endpoints
  app.get('/web-auth/status', webAuthStatusHandler());
  app.post('/web-auth/login', webAuthLoginRateLimiter(), webAuthLoginHandler());

  // Protect backend APIs when the optional web password gate is active
  app.use(webPasswordGateMiddleware());

  // OAuth callback endpoint
  app.get('/auth/callback', oauthCallbackHandler());

  // Register ping route if schema is loaded
  if (contracts?.PingRequestSchema) {
    registerPingRoute(routes, contracts.PingRequestSchema as z.ZodTypeAny);
  }

  // Register Alfresco RPC methods
  try {
    const { registerAlfrescoRpc } = await import('../rpc/alfresco/index.js');
    registerAlfrescoRpc(routes, contracts);
    const alfrescoMethods = Object.keys(routes).filter(k => k.startsWith('alfresco.'));
    log.info(
      { methodCount: alfrescoMethods.length, methods: alfrescoMethods },
      'Alfresco RPC methods registered'
    );
  } catch (err) {
    log.error({ err }, 'Failed to register Alfresco RPC methods');
    throw err;
  }

  // Register Backend data services RPC methods
  try {
    const { registerBackendRpc } = await import('../rpc/backend/index.js');
    await registerBackendRpc(routes, contracts);
    const backendMethods = Object.keys(routes).filter(k => k.startsWith('backend.'));
    log.info(
      { methodCount: backendMethods.length, methods: backendMethods },
      'Backend data services RPC methods registered'
    );
  } catch (err) {
    log.error({ err }, 'Failed to register Backend RPC methods');
    throw err;
  }

  // Debug endpoint - expose in dev, Neutralino mode, or when explicitly enabled
  if (exposeDebug) {
    app.get('/debug/rpc-methods', rpcDebugHandler(routes));
  }

  // Main RPC POST endpoint
  app.post('/rpc', rpcHandler(routes));

  // Binary upload endpoint
  const upload = createUploadMiddleware();
  app.post(
    '/rpc-binary',
    upload.single('filedata'),
    rpcBinaryHandler({ serverService, contracts })
  );

  // Stream download endpoint
  app.get('/rpc-stream', rpcStreamHandler({ serverService, contracts }));

  const { getPrismaClient } = await import('../lib/prisma.js');
  const prisma = await getPrismaClient();
  const { AgentService } = await import('../services/agent/AgentService.js');
  const agentService = new AgentService(prisma, serverService);
  app.get(
    '/rpc/agent/runs/:runId/stream',
    agentRunStreamHandler({
      getRunSummary: (userId, runId) => agentService.getRunSummary(userId, runId),
    })
  );

  // AI endpoints for JS console assistance
  app.use('/rpc/ai', createAiRouter({ repositoryJsLibService }));
}
