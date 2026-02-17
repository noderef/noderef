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
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId } from './withAuth.js';

const mentionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['node', 'person', 'group', 'server']),
  label: z.string().min(1),
  path: z.string().nullable().optional(),
});

export function registerAgentHandlers(routes: Routes, ctx: RpcContext): void {
  const { agentService } = ctx;

  routes['backend.agent.getManifest'] = {
    schema: z.object({}),
    handler: async () => agentService.getManifest(),
  };

  routes['backend.agent.listChats'] = {
    schema: z.object({
      serverId: z.number().optional(),
      skipCount: z.number().int().min(0).optional(),
      maxItems: z.number().int().min(1).max(100).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      return agentService.listChats(userId, params as any);
    },
  };

  routes['backend.agent.createChat'] = {
    schema: z.object({
      serverId: z.number().int().positive(),
      title: z.string().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, title } = params as { serverId: number; title?: string };
      return agentService.createChat(userId, serverId, title);
    },
  };

  routes['backend.agent.deleteChat'] = {
    schema: z.object({
      id: z.number().int().positive(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return agentService.deleteChat(userId, id);
    },
  };

  routes['backend.agent.listMessages'] = {
    schema: z.object({
      chatId: z.number().int().positive(),
      beforeId: z.number().int().positive().optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const typed = params as { chatId: number; beforeId?: number; maxItems?: number };
      return agentService.listMessages(userId, typed.chatId, {
        beforeId: typed.beforeId,
        maxItems: typed.maxItems,
      });
    },
  };

  routes['backend.agent.listRuns'] = {
    schema: z.object({
      chatId: z.number().int().positive(),
      skipCount: z.number().int().min(0).optional(),
      maxItems: z.number().int().min(1).max(100).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const typed = params as { chatId: number; skipCount?: number; maxItems?: number };
      return agentService.listRuns(userId, typed.chatId, {
        skipCount: typed.skipCount,
        maxItems: typed.maxItems,
      });
    },
  };

  routes['backend.agent.listRunEvents'] = {
    schema: z.object({
      runId: z.number().int().positive(),
      afterId: z.number().int().positive().optional(),
      maxItems: z.number().int().min(1).max(500).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const typed = params as { runId: number; afterId?: number; maxItems?: number };
      return agentService.listRunEvents(userId, typed.runId, {
        afterId: typed.afterId,
        maxItems: typed.maxItems,
      });
    },
  };

  routes['backend.agent.sendMessage'] = {
    schema: z.object({
      chatId: z.number().int().positive(),
      content: z.string().min(1),
      mentions: z.array(mentionSchema).max(30).optional(),
      aiProvider: z.string().min(1).optional(),
      aiModel: z.string().min(1).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      return agentService.sendMessage(userId, params as any);
    },
  };

  routes['backend.agent.cancelRun'] = {
    schema: z.object({
      runId: z.number().int().positive(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { runId } = params as { runId: number };
      return agentService.cancelRun(userId, runId);
    },
  };

  routes['backend.agent.confirmStep'] = {
    schema: z.object({
      runId: z.number().int().positive(),
      stepId: z.number().int().positive(),
      confirmationToken: z.string().min(1),
      approved: z.boolean(),
      confirmationText: z.string().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      return agentService.confirmStep(userId, params as any);
    },
  };

  routes['backend.agent.searchMentions'] = {
    schema: z.object({
      serverId: z.number().int().positive(),
      query: z.string().min(1),
      types: z.array(z.enum(['node', 'person', 'group'])).optional(),
      skipCount: z.number().int().min(0).optional(),
      maxItems: z.number().int().min(1).max(50).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      return agentService.searchMentions(userId, params as any);
    },
  };
}
