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

import type { AgentChatMcpSettings, McpCatalog } from '@app/contracts';
import type { AgentToolSchema } from '../../../ai/anthropic.js';
import { getAgentGatewayRuntime } from '../../agentGateway/gatewayRuntime.js';
import { toMcpToolDefinition } from '../../agentGateway/mcpToolAdapter.js';
import { MAX_MCP_TOOLS_PER_RUN } from '../../agentGateway/types.js';
import type { ServerService } from '../../serverService.js';
import type { PrismaClient } from '@prisma/client';
import { ALL_TOOLS, getToolByName, resolveToolName } from './registry.js';
import { toAnthropicSchema, type ToolDefinition } from './types.js';

export interface RunToolsetSnapshot {
  enabled: boolean;
  tools: string[];
  fingerprint?: string;
}

export interface RunToolset {
  schemas: AgentToolSchema[];
  resolve(name: string): ToolDefinition | undefined;
  mcpSnapshot: RunToolsetSnapshot | null;
  warnings: string[];
  catalog: McpCatalog | null;
}

const SCRIPT_TOOL_NAME = 'script_execute';

export async function buildRunToolset(input: {
  prisma: PrismaClient;
  serverService: ServerService;
  userId: number;
  serverId: number;
  chatMcp: AgentChatMcpSettings | null;
  planMcp?: RunToolsetSnapshot | null;
  allowScriptExecution: boolean;
}): Promise<RunToolset> {
  const localTools = input.allowScriptExecution
    ? ALL_TOOLS
    : ALL_TOOLS.filter(tool => tool.name !== SCRIPT_TOOL_NAME);
  const tools = new Map<string, ToolDefinition>(localTools.map(tool => [tool.name, tool]));
  const warnings: string[] = [];
  let catalog: McpCatalog | null = null;
  let mcpSnapshot: RunToolsetSnapshot | null = null;

  const chatEnabled = Boolean(input.chatMcp?.enabled);
  const planEnabled = input.planMcp ? Boolean(input.planMcp.enabled) : chatEnabled;
  if (chatEnabled && planEnabled) {
    const runtime = getAgentGatewayRuntime(input.prisma, input.serverService);
    const gateway = runtime.config;
    const config = await gateway.getDecrypted(input.userId, input.serverId);
    const view = await gateway.getView(input.userId, input.serverId);
    if (!config?.enabled || !config.endpointUrl || !config.apiKey) {
      warnings.push('Agent Gateway is not configured; continuing with local tools only.');
    } else if (view.verification.status === 'mismatch') {
      warnings.push('Agent Gateway environment does not match this Alfresco server; continuing with local tools only.');
    } else {
      const server = await input.serverService.findById(input.userId, input.serverId);
      try {
        catalog = await runtime.sessions.getCatalog(
          {
            userId: input.userId,
            serverId: input.serverId,
            serverBaseUrl: server?.baseUrl ?? '',
            endpointUrl: config.endpointUrl,
            apiKey: config.apiKey,
            apiKeyCiphertext: config.apiKeyCiphertext,
            configVersion: config.configVersion,
            mode: 'withAlfresco',
          },
          false
        );
      } catch {
        warnings.push('Agent Gateway catalog could not be loaded; continuing with local tools only.');
      }

      if (catalog?.status === 'connected') {
        const selected = new Set(input.chatMcp?.tools ?? []);
        const planSelected = input.planMcp ? new Set(input.planMcp.tools) : selected;
        const allowed = catalog.tools.filter(
          tool => selected.has(tool.name) && planSelected.has(tool.name)
        );
        const limited = allowed.slice(0, MAX_MCP_TOOLS_PER_RUN);
        if (allowed.length > MAX_MCP_TOOLS_PER_RUN) {
          warnings.push(
            `Agent Gateway tool list was capped at ${MAX_MCP_TOOLS_PER_RUN} tools for this run.`
          );
        }
        for (const tool of limited) {
          if (tools.has(tool.modelName)) {
            continue;
          }
          tools.set(
            tool.modelName,
            toMcpToolDefinition(tool, runtime.sessions, {
              userId: input.userId,
              serverId: input.serverId,
              serverBaseUrl: server?.baseUrl ?? '',
              endpointUrl: config.endpointUrl,
              apiKey: config.apiKey,
              apiKeyCiphertext: config.apiKeyCiphertext,
              configVersion: config.configVersion,
              mode: 'withAlfresco',
            })
          );
        }
        mcpSnapshot = {
          enabled: true,
          tools: limited.map(tool => tool.name),
          fingerprint: `${config.configVersion}:${config.endpointUrl}`,
        };
      } else if (catalog) {
        warnings.push(`Agent Gateway is ${catalog.status}; continuing with local tools only.`);
      }
    }
  }

  const resolve = (name: string): ToolDefinition | undefined => {
    return tools.get(name) ?? tools.get(resolveToolName(name)) ?? getToolByName(name);
  };

  return {
    schemas: [...tools.values()].map(toAnthropicSchema),
    resolve,
    mcpSnapshot,
    warnings,
    catalog,
  };
}
