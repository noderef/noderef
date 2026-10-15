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

export type AgentGatewayVerificationStatus = 'verified' | 'mismatch' | 'unverified' | 'unsupported';

export type AgentGatewayStatus =
  | 'not_configured'
  | 'disabled'
  | 'connected'
  | 'unauthorized'
  | 'forbidden'
  | 'unreachable'
  | 'redirect_blocked'
  | 'protocol_error'
  | 'missing_alfresco_credentials'
  | 'environment_mismatch';

export type McpToolPolicy = 'read' | 'write' | 'destructive_or_unknown';

export interface AgentGatewayVerificationView {
  status: AgentGatewayVerificationStatus;
  repositoryId?: string | null;
  verifiedAt?: Date | string | null;
}

export interface AgentGatewayConfigView {
  serverId: number;
  enabled: boolean;
  endpointUrl: string | null;
  hasApiKey: boolean;
  verification: AgentGatewayVerificationView;
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolSummary {
  name: string;
  modelName: string;
  title?: string | null;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations | null;
  policy: McpToolPolicy;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptSummary {
  name: string;
  title?: string | null;
  description?: string | null;
  arguments: McpPromptArgument[];
}

export interface McpResourceSummary {
  uri: string;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
}

export interface McpServerInfo {
  name?: string | null;
  title?: string | null;
  version?: string | null;
}

export interface McpCatalogCapabilities {
  tools: boolean;
  prompts: boolean;
  resources: boolean;
}

export interface McpCatalog {
  status: AgentGatewayStatus;
  serverInfo: McpServerInfo | null;
  protocolVersion: string | null;
  capabilities: McpCatalogCapabilities;
  tools: McpToolSummary[];
  prompts: McpPromptSummary[];
  resources: McpResourceSummary[];
  fetchedAt: string | null;
  truncated: boolean;
}

export interface AgentChatMcpSettings {
  enabled: boolean;
  tools: string[];
}

export interface AgentGatewayConnectionTestResult {
  status: AgentGatewayStatus;
  serverInfo: McpServerInfo | null;
  protocolVersion: string | null;
  toolCount: number;
  promptCount: number;
  truncated: boolean;
}

export interface AgentGatewayVerifyResult {
  status: AgentGatewayVerificationStatus;
  repositoryId?: string | null;
  alfrescoRepositoryId?: string | null;
  verifiedAt?: string | null;
}

export interface McpPromptPreview {
  name: string;
  description?: string | null;
  text: string;
  truncated: boolean;
}
