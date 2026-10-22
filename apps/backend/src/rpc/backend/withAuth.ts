/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
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
import type { Capability, PublicServer } from '@app/contracts';
import { hasCapability } from '@app/contracts';
import { AppErrors } from '../../lib/errors.js';
import { getAuthenticatedClientWithRefresh } from '../../services/alfresco/authenticationHelper.js';
import { ensureCapabilityProfile } from '../../services/alfresco/capabilityPersistence.js';
import { getCurrentUserId } from '../../services/userBootstrap.js';
import type { RpcContext } from './types.js';

function assertCapability(server: PublicServer, capability: Capability): void {
  if (!hasCapability(server.capabilities, capability)) {
    AppErrors.permissionDenied(
      `Your Alfresco account does not have permission for this action (${capability})`
    );
  }
}

/**
 * Execute a function with authenticated Alfresco API client
 */
export async function withAuth<T>(
  ctx: RpcContext,
  serverId: number,
  fn: (api: AlfrescoApi, server: PublicServer) => Promise<T>
): Promise<T> {
  const userId = await getCurrentUserId();

  const server = await ctx.serverService.findById(userId, serverId);
  if (!server) {
    return AppErrors.notFound('Server', serverId);
  }

  const api = await getAuthenticatedClientWithRefresh(userId, serverId, server.baseUrl, ctx.prisma);
  if (!api) {
    return AppErrors.unauthorized('No stored credentials found for server');
  }

  const resolved = await ensureCapabilityProfile(ctx.serverService, userId, serverId, api, server);
  return fn(api, resolved);
}

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

  const server = await ctx.serverService.findById(userId, serverId);
  if (!server) {
    return AppErrors.notFound('Server', serverId);
  }

  const creds = await ctx.serverService.getCredentialsForBackend(userId, serverId);
  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    return AppErrors.unauthorized('No stored credentials found for server');
  }

  const api = await getAuthenticatedClientWithRefresh(userId, serverId, server.baseUrl, ctx.prisma);
  if (!api) {
    return AppErrors.unauthorized('Failed to authenticate with server');
  }

  const resolved = await ensureCapabilityProfile(ctx.serverService, userId, serverId, api, server);
  return fn({
    api,
    server: resolved,
    username: creds.username,
    token: creds.token,
    authType: creds.authType,
  });
}

export async function withCapability<T>(
  ctx: RpcContext,
  serverId: number,
  capability: Capability,
  fn: (api: AlfrescoApi, server: PublicServer) => Promise<T>
): Promise<T> {
  return withAuth(ctx, serverId, async (api, server) => {
    assertCapability(server, capability);
    return fn(api, server);
  });
}

export async function withCapabilityAndCredentials<T>(
  ctx: RpcContext,
  serverId: number,
  capability: Capability,
  fn: (params: {
    api: AlfrescoApi;
    server: PublicServer;
    username: string | null;
    token: string | null;
    authType: string | null;
  }) => Promise<T>
): Promise<T> {
  return withAuthAndCredentials(ctx, serverId, async params => {
    assertCapability(params.server, capability);
    return fn(params);
  });
}

export { getCurrentUserId };
