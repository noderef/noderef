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

import { z } from 'zod';
import { AgentGatewayService } from '../../services/agentGateway/agentGatewayService.js';
import { getAgentGatewayRuntime } from '../../services/agentGateway/gatewayRuntime.js';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';

export function registerAgentGatewayHandlers(routes: Routes, ctx: RpcContext): void {
  const runtime = getAgentGatewayRuntime(ctx.prisma, ctx.serverService);
  const service = new AgentGatewayService(
    ctx.prisma,
    ctx.serverService,
    runtime.config,
    runtime.credentials,
    runtime.sessions
  );

  routes['backend.agentGateway.getConfig'] = {
    schema: z.object({ serverId: z.number().int().positive() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId: number };
      return service.getConfig(userId, serverId);
    },
  };

  routes['backend.agentGateway.saveConfig'] = {
    schema: z.object({
      serverId: z.number().int().positive(),
      enabled: z.boolean(),
      endpointUrl: z.string().nullable().optional(),
      apiKey: z.string().optional(),
      clearApiKey: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, ...input } = params as {
        serverId: number;
        enabled: boolean;
        endpointUrl?: string | null;
        apiKey?: string;
        clearApiKey?: boolean;
      };
      return service.saveConfig(userId, serverId, input);
    },
  };

  routes['backend.agentGateway.testConnection'] = {
    schema: z.object({
      serverId: z.number().int().positive(),
      enabled: z.boolean().optional(),
      endpointUrl: z.string().nullable().optional(),
      apiKey: z.string().optional(),
      clearApiKey: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, ...overrides } = params as {
        serverId: number;
        enabled?: boolean;
        endpointUrl?: string | null;
        apiKey?: string;
        clearApiKey?: boolean;
      };
      return service.testConnection(userId, serverId, overrides);
    },
  };

  routes['backend.agentGateway.verifyEnvironment'] = {
    schema: z.object({ serverId: z.number().int().positive() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId: number };
      return service.verifyEnvironment(userId, serverId);
    },
  };

  routes['backend.agentGateway.getCatalog'] = {
    schema: z.object({
      serverId: z.number().int().positive(),
      refresh: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, refresh } = params as { serverId: number; refresh?: boolean };
      return service.getCatalog(userId, serverId, refresh);
    },
  };

  routes['backend.agentGateway.getPrompt'] = {
    schema: z
      .object({
        chatId: z.number().int().positive().optional(),
        serverId: z.number().int().positive().optional(),
        name: z.string().min(1),
        arguments: z.record(z.unknown()).optional(),
      })
      .refine(value => Boolean(value.chatId || value.serverId), {
        message: 'chatId or serverId is required',
      }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const typed = params as {
        chatId?: number;
        serverId?: number;
        name: string;
        arguments?: Record<string, unknown>;
      };
      return service.getPrompt(
        userId,
        { chatId: typed.chatId, serverId: typed.serverId },
        typed.name,
        typed.arguments
      );
    },
  };
}
