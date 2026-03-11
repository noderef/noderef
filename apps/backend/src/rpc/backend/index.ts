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
 * Backend RPC Registration Orchestrator
 *
 * This module is the entry point for registering all backend.* RPC methods.
 * It creates the shared context and delegates to domain-specific handlers.
 *
 * Domain handlers:
 * - servers.ts     → backend.servers.*
 * - savedSearches.ts → backend.savedSearches.*
 * - searchHistory.ts → backend.searchHistory.*
 * - localFiles.ts  → backend.localFiles.*
 * - repository.ts  → backend.repository.*
 * - jsconsole.ts   → backend.jsconsole.*
 * - agent.ts       → backend.agent.*
 * - ai.ts          → backend.ai.*
 * - user.ts        → backend.user.*
 * - workspace.ts   → backend.workspace.* + backend.nodeHistory.*
 */

import { JsConsoleHistoryService } from '../../services/jsConsoleHistoryService.js';
import { LocalFileService } from '../../services/localFileService.js';
import { NodeHistoryService } from '../../services/nodeHistoryService.js';
import { SavedSearchService } from '../../services/savedSearchService.js';
import { SearchHistoryService } from '../../services/searchHistoryService.js';
import { ServerService } from '../../services/serverService.js';
import { AgentService } from '../../services/agent/AgentService.js';
import { InsightGraphService } from '../../services/insightGraphService.js';

// Domain handlers
import { registerAiHandlers } from './ai.js';
import { registerAgentHandlers } from './agent.js';
import { registerJsConsoleHandlers } from './jsconsole.js';
import { registerLocalFilesHandlers } from './localFiles.js';
import { registerRepositoryHandlers } from './repository.js';
import { registerSavedSearchesHandlers } from './savedSearches.js';
import { registerSearchHistoryHandlers } from './searchHistory.js';
import { registerServersHandlers } from './servers.js';
import type { Routes, RpcContext } from './types.js';
import { registerUserHandlers } from './user.js';
import { registerWorkspaceHandlers } from './workspace.js';
import { registerServerInsightsHandlers } from './serverInsights.js';

/**
 * Register all backend data service RPC methods
 * @param routes The routes object to register methods on
 * @param _contracts The contracts module (unused but kept for API compatibility)
 */
export async function registerBackendRpc(
  routes: Routes,
  _contracts: typeof import('@app/contracts')
): Promise<void> {
  // Initialize Prisma and services
  const { getPrismaClient } = await import('../../lib/prisma.js');
  const prisma = await getPrismaClient();
  const serverService = new ServerService(prisma);

  // Create shared context for all domain handlers
  const ctx: RpcContext = {
    prisma,
    serverService,
    savedSearchService: new SavedSearchService(prisma),
    searchHistoryService: new SearchHistoryService(prisma),
    nodeHistoryService: new NodeHistoryService(prisma),
    localFileService: new LocalFileService(prisma),
    jsConsoleHistoryService: new JsConsoleHistoryService(prisma),
    agentService: new AgentService(prisma, serverService),
    insightGraphService: new InsightGraphService(prisma),
  };

  // Register all domain handlers
  registerServersHandlers(routes, ctx);
  registerSavedSearchesHandlers(routes, ctx);
  registerSearchHistoryHandlers(routes, ctx);
  registerLocalFilesHandlers(routes, ctx);
  registerRepositoryHandlers(routes, ctx);
  registerJsConsoleHandlers(routes, ctx);
  registerAgentHandlers(routes, ctx);
  registerAiHandlers(routes);
  registerUserHandlers(routes);
  registerWorkspaceHandlers(routes, ctx);
  registerServerInsightsHandlers(routes, ctx);
}
