/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AlfrescoApi } from '@alfresco/js-api';
import type { AgentMention } from '@app/contracts';

// ── Manifest types (used by agentManifest.ts) ─────────────────────────────────

export type ActionKind = 'read' | 'write';
export type OperationName =
  | 'search'
  | 'node_get'
  | 'node_get_content'
  | 'node_list_children'
  | 'node_create'
  | 'node_update'
  | 'node_update_content'
  | 'node_move'
  | 'node_copy'
  | 'node_delete'
  | 'script_execute';

export interface ActionDefinition {
  description: string;
  tags: string[];
  kind: ActionKind;
  inputSchema: Record<string, unknown>;
  requiresConfirmation?: boolean;
  confirmation?: { type: 'phrase'; phrase: string };
  executor: OperationName;
}

export interface LibDefinition {
  description: string;
  tags: string[];
}

export interface AgentManifest {
  libs: Record<string, LibDefinition>;
  actions: Record<string, ActionDefinition>;
}

// ── Runtime types ─────────────────────────────────────────────────────────────
export interface AgentExecutionContext {
  api: AlfrescoApi;
  serverBaseUrl: string;
  jsconsoleEndpoint: string | null;
  authType: string | null;
  username: string | null;
  token: string | null;
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

export interface StructuredPrompt {
  system: string;
  user: string;
  prefill: string;
}
