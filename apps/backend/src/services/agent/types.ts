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
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AlfrescoApi } from '@alfresco/js-api';
import type { AgentMention } from '@app/contracts';

// ── Manifest types (used by agentManifest.ts) ─────────────────────────────────

type ActionKind = 'read' | 'write';
type OperationName =
  | 'search'
  | 'search_export_text'
  | 'text_write_begin'
  | 'text_write_append'
  | 'text_write_status'
  | 'text_write_abort'
  | 'text_write_commit'
  | 'node_get'
  | 'node_get_content'
  | 'node_list_children'
  | 'node_create'
  | 'node_update'
  | 'node_update_content'
  | 'node_move'
  | 'node_copy'
  | 'node_versions'
  | 'node_delete'
  | 'permissions_get'
  | 'permissions_set'
  | 'people_get'
  | 'people_list'
  | 'group_get'
  | 'group_members'
  | 'script_create'
  | 'script_execute';

interface ActionDefinition {
  description: string;
  tags: string[];
  kind: ActionKind;
  inputSchema: Record<string, unknown>;
  requiresConfirmation?: boolean;
  confirmation?: { type: 'phrase'; phrase: string };
  executor: OperationName;
}

interface LibDefinition {
  description: string;
  tags: string[];
}

interface AgentManifest {
  libs: Record<string, LibDefinition>;
  actions: Record<string, ActionDefinition>;
}

// ── Runtime types ─────────────────────────────────────────────────────────────
export interface AgentExecutionContext {
  api: AlfrescoApi;
  serverId: number;
  serverBaseUrl: string;
  jsconsoleEndpoint: string | null;
  authType: string | null;
  username: string | null;
  token: string | null;
  userId?: number;
  aiRuntime?: ResolvedAiRuntime;
  signal: AbortSignal;
}

export interface RunInput {
  runId: number;
  chatId: number;
  serverId: number;
  userId: number;
  content: string;
  mentions: AgentMention[];
  chatTitle: string;
  chatIcon: string;
  triggerMessageId: number;
  preferredLanguage?: string;
  autoApproveConfirmations?: boolean;
}

export interface ResolvedAiRuntime {
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
  temperature: number;
}

interface StructuredPrompt {
  system: string;
  user: string;
  prefill: string;
}
