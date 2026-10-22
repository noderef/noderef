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
  McpCatalog,
  McpPromptSummary,
  McpResourceSummary,
  McpToolAnnotations,
  McpToolSummary,
} from '@app/contracts';
import { assignMcpModelNames } from './mcpNames.js';
import { resolveMcpToolPolicy } from './mcpPolicy.js';
import { MAX_TOOL_SCHEMA_BYTES } from './types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stripSchemaMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const next = { ...schema };
  delete next.$schema;
  delete next.$id;
  return next;
}

export function mapToolAnnotations(raw: unknown): McpToolAnnotations | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const annotations: McpToolAnnotations = {};
  if (typeof record.readOnlyHint === 'boolean') annotations.readOnlyHint = record.readOnlyHint;
  if (typeof record.destructiveHint === 'boolean')
    annotations.destructiveHint = record.destructiveHint;
  if (typeof record.idempotentHint === 'boolean')
    annotations.idempotentHint = record.idempotentHint;
  if (typeof record.openWorldHint === 'boolean') annotations.openWorldHint = record.openWorldHint;
  return Object.keys(annotations).length ? annotations : null;
}

export function mapTools(
  tools: Array<{
    name: string;
    title?: string;
    description?: string;
    inputSchema?: unknown;
    annotations?: unknown;
  }>,
  localToolNames: Set<string>
): { tools: McpToolSummary[]; dropped: string[] } {
  const names = tools.map(tool => tool.name);
  const modelNames = assignMcpModelNames(names, localToolNames);
  const dropped: string[] = [];
  const mapped: McpToolSummary[] = [];

  for (const tool of tools) {
    const schema = asRecord(tool.inputSchema) ?? { type: 'object', properties: {} };
    if (schema.type !== 'object') {
      dropped.push(tool.name);
      continue;
    }
    const cleaned = stripSchemaMeta(schema);
    if (Buffer.byteLength(JSON.stringify(cleaned), 'utf8') > MAX_TOOL_SCHEMA_BYTES) {
      dropped.push(tool.name);
      continue;
    }
    const annotations = mapToolAnnotations(tool.annotations);
    const policy = resolveMcpToolPolicy(annotations);
    mapped.push({
      name: tool.name,
      modelName: modelNames.get(tool.name) ?? `mcp_${tool.name}`,
      title: tool.title ?? null,
      description: tool.description ?? '',
      inputSchema: cleaned,
      annotations,
      policy: policy.policy,
    });
  }

  return { tools: mapped, dropped };
}

export function mapPrompts(
  prompts: Array<{
    name: string;
    title?: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>
): McpPromptSummary[] {
  return prompts.map(prompt => ({
    name: prompt.name,
    title: prompt.title ?? null,
    description: prompt.description ?? null,
    arguments: (prompt.arguments ?? []).map(arg => ({
      name: arg.name,
      description: arg.description,
      required: arg.required,
    })),
  }));
}

/** MCP Apps UI templates (`ui://`) render tool output; they are not readable data. */
function isMcpAppUiResource(resource: { uri: string; mimeType?: string }): boolean {
  return (
    resource.uri.startsWith('ui://') || Boolean(resource.mimeType?.includes('profile=mcp-app'))
  );
}

export function mapResources(
  resources: Array<{
    uri: string;
    name?: string;
    title?: string;
    description?: string;
    mimeType?: string;
  }>
): McpResourceSummary[] {
  return resources
    .filter(resource => !isMcpAppUiResource(resource))
    .map(resource => ({
      uri: resource.uri,
      name: resource.name ?? null,
      title: resource.title ?? null,
      description: resource.description ?? null,
      mimeType: resource.mimeType ?? null,
    }));
}

export function emptyCatalog(status: McpCatalog['status']): McpCatalog {
  return {
    status,
    serverInfo: null,
    protocolVersion: null,
    capabilities: { tools: false, prompts: false, resources: false },
    tools: [],
    prompts: [],
    resources: [],
    fetchedAt: null,
    truncated: false,
  };
}
