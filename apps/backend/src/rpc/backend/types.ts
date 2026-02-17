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
 * Shared types for backend RPC handlers
 * Centralizes type definitions to avoid repetition across domain modules
 */

import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type { JsConsoleHistoryService } from '../../services/jsConsoleHistoryService.js';
import type { LocalFileService } from '../../services/localFileService.js';
import type { AgentService } from '../../services/agentService.js';
import type { NodeHistoryService } from '../../services/nodeHistoryService.js';
import type { SavedSearchService } from '../../services/savedSearchService.js';
import type { SearchHistoryService } from '../../services/searchHistoryService.js';
import type { ServerService } from '../../services/serverService.js';

/**
 * Type alias for Zod schema
 */
export type ZSchema = z.ZodType<unknown>;

/**
 * RPC route definition with schema validation and handler
 */
export type Routes = Record<string, { schema: ZSchema; handler: (p: unknown) => Promise<unknown> }>;

/**
 * Shared context passed to RPC domain handlers
 * Contains all services and the Prisma client needed for operations
 */
export interface RpcContext {
  prisma: PrismaClient;
  serverService: ServerService;
  savedSearchService: SavedSearchService;
  searchHistoryService: SearchHistoryService;
  nodeHistoryService: NodeHistoryService;
  localFileService: LocalFileService;
  jsConsoleHistoryService: JsConsoleHistoryService;
  agentService: AgentService;
}

/**
 * Function signature for registering domain-specific RPC handlers
 */
export type RegisterDomainHandlers = (routes: Routes, ctx: RpcContext) => void | Promise<void>;
