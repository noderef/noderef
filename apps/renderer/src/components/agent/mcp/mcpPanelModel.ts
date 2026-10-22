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

import type {
  AgentGatewayStatus,
  AgentChatMcpSettings,
  McpCatalog,
  McpToolSummary,
} from '@app/contracts';

export function defaultMcpSelection(catalog: McpCatalog | null): AgentChatMcpSettings {
  if (!catalog || catalog.status !== 'connected') {
    return { enabled: false, tools: [] };
  }
  return {
    enabled: true,
    tools: catalog.tools.filter(tool => tool.policy === 'read').map(tool => tool.name),
  };
}

export function filterTools(tools: McpToolSummary[], query: string): McpToolSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return tools;
  const nameMatches: McpToolSummary[] = [];
  const descriptionMatches: McpToolSummary[] = [];
  for (const tool of tools) {
    const name = [tool.name, tool.modelName, tool.title ?? ''].join(' ').toLowerCase();
    if (name.includes(trimmed)) nameMatches.push(tool);
    else if (tool.description.toLowerCase().includes(trimmed)) descriptionMatches.push(tool);
  }
  return [...nameMatches, ...descriptionMatches];
}

// MCP prompt arguments carry no enum, so fixed choices for known prompts live here.
const KNOWN_PROMPT_ARG_OPTIONS: Record<string, Record<string, string[]>> = {
  alfresco_search_and_analyze: {
    analysisType: ['summary', 'detailed', 'trends', 'compliance'],
  },
};

export function promptArgOptions(promptName: string, argName: string): string[] | null {
  return KNOWN_PROMPT_ARG_OPTIONS[promptName]?.[argName] ?? null;
}

export interface McpToolGroup {
  prefix: string;
  toolNames: string[];
}

export function groupToolsByPrefix(tools: McpToolSummary[]): McpToolGroup[] {
  const groups = new Map<string, string[]>();
  for (const tool of tools) {
    const separator = tool.name.indexOf('_');
    const prefix = separator > 0 ? tool.name.slice(0, separator) : tool.name;
    const names = groups.get(prefix) ?? [];
    names.push(tool.name);
    groups.set(prefix, names);
  }
  return [...groups.entries()]
    .map(([prefix, toolNames]) => ({ prefix, toolNames }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
}

export function emptyStateForStatus(status: AgentGatewayStatus | null): string {
  switch (status) {
    case null:
    case 'not_configured':
      return 'notConfigured';
    case 'disabled':
      return 'disabled';
    case 'unauthorized':
      return 'unauthorized';
    case 'forbidden':
      return 'forbidden';
    case 'unreachable':
      return 'unreachable';
    case 'redirect_blocked':
      return 'redirectBlocked';
    case 'protocol_error':
      return 'protocolError';
    case 'missing_alfresco_credentials':
      return 'missingCredentials';
    case 'environment_mismatch':
      return 'environmentMismatch';
    case 'connected':
      return 'connected';
    default:
      return 'notConfigured';
  }
}

export function indicatorColor(status: AgentGatewayStatus | null, enabled: boolean): string {
  if (!enabled) return 'gray';
  if (status === 'connected') return 'green';
  if (status === 'not_configured' || status === 'disabled') return 'gray';
  return 'red';
}

export function schemaPropertyNames(schema: Record<string, unknown> | undefined): string[] {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return [];
  }
  return Object.keys(properties as Record<string, unknown>);
}
