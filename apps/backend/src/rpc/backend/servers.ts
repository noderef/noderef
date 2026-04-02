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
 * Server RPC handlers
 * Handles all backend.servers.* RPC methods
 */

import type { CreateServer, UpdateServer } from '@app/contracts';
import { z } from 'zod';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId, withAuth } from './withAuth.js';
import { InsightRangeDaysSchema } from '../../constants/insights.js';

type RpcCreateServerInput = Omit<CreateServer, 'userId' | 'insightRangeDays'> & {
  insightRangeDays?: number;
  tokenExpiry?: string | Date | null;
};

type RpcUpdateServerInput = Omit<UpdateServer, 'insightRangeDays'> & {
  insightRangeDays?: number;
  tokenExpiry?: string | Date | null;
};

/**
 * Register all server-related RPC handlers
 */
export function registerServersHandlers(routes: Routes, ctx: RpcContext): void {
  const { serverService } = ctx;

  routes['backend.servers.list'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      return serverService.findAll(userId);
    },
  };

  routes['backend.servers.get'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return serverService.findById(userId, id);
    },
  };

  routes['backend.servers.create'] = {
    schema: z.object({
      name: z.string(),
      baseUrl: z.string(),
      serverType: z.string().optional(),
      authType: z.string().nullable().optional(),
      isAdmin: z.boolean().optional(),
      username: z.string().nullable().optional(),
      token: z.string().nullable().optional(),
      refreshToken: z.string().nullable().optional(),
      tokenExpiry: z.string().nullable().optional(), // ISO date string
      oidcHost: z.string().nullable().optional(),
      oidcRealm: z.string().nullable().optional(),
      oidcClientId: z.string().nullable().optional(),
      jsconsoleEndpoint: z.string().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      displayOrder: z.number().optional(),
      insightRangeDays: InsightRangeDaysSchema.optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as RpcCreateServerInput;
      // Convert tokenExpiry string to Date if provided
      const processedData = {
        ...data,
        tokenExpiry:
          data.tokenExpiry && typeof data.tokenExpiry === 'string'
            ? new Date(data.tokenExpiry)
            : data.tokenExpiry,
      };
      return serverService.create(userId, processedData);
    },
  };

  routes['backend.servers.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      baseUrl: z.string().optional(),
      serverType: z.string().optional(),
      authType: z.string().nullable().optional(),
      isAdmin: z.boolean().optional(),
      username: z.string().nullable().optional(),
      token: z.string().nullable().optional(),
      refreshToken: z.string().nullable().optional(),
      tokenExpiry: z.string().nullable().optional(), // ISO date string
      oidcHost: z.string().nullable().optional(),
      oidcRealm: z.string().nullable().optional(),
      oidcClientId: z.string().nullable().optional(),
      jsconsoleEndpoint: z.string().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      displayOrder: z.number().optional(),
      insightRangeDays: InsightRangeDaysSchema.optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, ...rawData } = params as { id: number } & RpcUpdateServerInput;
      // Convert tokenExpiry string to Date if provided
      const data = {
        ...rawData,
        tokenExpiry:
          rawData.tokenExpiry && typeof rawData.tokenExpiry === 'string'
            ? new Date(rawData.tokenExpiry)
            : rawData.tokenExpiry,
      };
      return serverService.update(userId, id, data);
    },
  };

  routes['backend.servers.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await serverService.delete(userId, id);
      return { success };
    },
  };

  routes['backend.servers.reorder'] = {
    schema: z.object({
      orders: z.array(
        z.object({
          id: z.number(),
          displayOrder: z.number(),
        })
      ),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { orders } = params as { orders: Array<{ id: number; displayOrder: number }> };
      await serverService.reorder(userId, orders);
      return {};
    },
  };

  routes['backend.servers.updateLastAccessed'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      await serverService.updateLastAccessed(userId, id);
      return {};
    },
  };

  routes['backend.servers.refreshTokens'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return serverService.refreshOAuthTokens(userId, id);
    },
  };

  routes['backend.servers.updateOidcTokens'] = {
    schema: z.object({
      id: z.number(),
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresIn: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, accessToken, refreshToken, expiresIn } = params as {
        id: number;
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
      };

      // Calculate token expiry
      const tokenExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      // Update server with new tokens
      return serverService.update(userId, id, {
        token: accessToken,
        refreshToken,
        tokenExpiry,
      });
    },
  };

  routes['backend.servers.getAuthTicket'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const { serverId } = params as { serverId: number };

      return withAuth(ctx, serverId, async api => {
        // Get the authentication ticket
        const ticket = api.config?.ticketEcm || api.getTicket();

        return {
          ticket: ticket || null,
        };
      });
    },
  };
}
