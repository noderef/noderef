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
  return tools.filter(tool =>
    [tool.name, tool.modelName, tool.title ?? '', tool.description]
      .join(' ')
      .toLowerCase()
      .includes(trimmed)
  );
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
