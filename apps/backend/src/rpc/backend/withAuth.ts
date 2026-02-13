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
 * Authentication wrapper for RPC handlers
 * Eliminates repeated authentication boilerplate across domain handlers
 */

import type { AlfrescoApi } from '@alfresco/js-api';
import type { PublicServer } from '@app/contracts';
import { AppErrors } from '../../lib/errors.js';
import { getAuthenticatedClientWithRefresh } from '../../services/alfresco/authenticationHelper.js';
import { getCurrentUserId } from '../../services/userBootstrap.js';
import type { RpcContext } from './types.js';

/**
 * Execute a function with authenticated Alfresco API client
 * Handles all the boilerplate of:
 * 1. Getting current user ID
 * 2. Looking up server by ID (scoped to user)
 * 3. Authenticating with automatic token refresh
 * 4. Throwing appropriate errors if anything fails
 *
 * @param ctx - RPC context containing services
 * @param serverId - Server ID to authenticate against
 * @param fn - Function to execute with authenticated API client and server
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * routes['backend.repository.getNodeChildren'] = {
 *   schema: z.object({ serverId: z.number(), nodeId: z.string() }),
 *   handler: async params => {
 *     const { serverId, nodeId } = params as { serverId: number; nodeId: string };
 *     return withAuth(ctx, serverId, async (api, server) => {
 *       const nodesApi = new NodesApi(api);
 *       return nodesApi.listNodeChildren(nodeId);
 *     });
 *   },
 * };
 * ```
 */
export async function withAuth<T>(
  ctx: RpcContext,
  serverId: number,
  fn: (api: AlfrescoApi, server: PublicServer) => Promise<T>
): Promise<T> {
  const userId = await getCurrentUserId();

  // Look up server (scoped to user for security)
  const server = await ctx.serverService.findById(userId, serverId);
  if (!server) {
    return AppErrors.notFound('Server', serverId);
  }

  // Authenticate with automatic token refresh for OIDC
  const api = await getAuthenticatedClientWithRefresh(userId, serverId, server.baseUrl, ctx.prisma);
  if (!api) {
    return AppErrors.unauthorized('No stored credentials found for server');
  }

  return fn(api, server);
}

/**
 * Get credentials for direct HTTP calls (e.g., Slingshot API)
 * Use this when you need raw credentials instead of an AlfrescoApi client
 */
export async function withCredentials<T>(
  ctx: RpcContext,
  serverId: number,
  fn: (creds: {
    username: string | null;
    token: string | null;
    authType: string | null;
    server: PublicServer;
  }) => Promise<T>
): Promise<T> {
  const userId = await getCurrentUserId();

  // Look up server (scoped to user for security)
  const server = await ctx.serverService.findById(userId, serverId);
  if (!server) {
    return AppErrors.notFound('Server', serverId);
  }

  // Get decrypted credentials
  const creds = await ctx.serverService.getCredentialsForBackend(userId, serverId);
  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    return AppErrors.unauthorized('No stored credentials found for server');
  }

  return fn({
    username: creds.username,
    token: creds.token,
    authType: creds.authType,
    server,
  });
}

/**
 * Execute a function with both authenticated API client and raw credentials
 * Use this when you need both the SDK client and direct credentials (e.g., for username in runas)
 */
export async function withAuthAndCredentials<T>(
  ctx: RpcContext,
  serverId: number,
  fn: (params: {
    api: AlfrescoApi;
    server: PublicServer;
    username: string | null;
    token: string | null;
    authType: string | null;
  }) => Promise<T>
): Promise<T> {
  const userId = await getCurrentUserId();

  // Look up server (scoped to user for security)
  const server = await ctx.serverService.findById(userId, serverId);
  if (!server) {
    return AppErrors.notFound('Server', serverId);
  }

  // Get decrypted credentials
  const creds = await ctx.serverService.getCredentialsForBackend(userId, serverId);
  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    return AppErrors.unauthorized('No stored credentials found for server');
  }

  // Authenticate with automatic token refresh for OIDC
  const api = await getAuthenticatedClientWithRefresh(userId, serverId, server.baseUrl, ctx.prisma);
  if (!api) {
    return AppErrors.unauthorized('Failed to authenticate with server');
  }

  return fn({
    api,
    server,
    username: creds.username,
    token: creds.token,
    authType: creds.authType,
  });
}

/**
 * Get current user ID - convenience wrapper for handlers
 */
export { getCurrentUserId };
