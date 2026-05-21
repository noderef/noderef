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

export type AgentMessageRole = 'user' | 'assistant' | 'system';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunStepStatus =
  | 'pending'
  | 'running'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentMention {
  id: string;
  type: 'node' | 'person' | 'group' | 'server';
  label: string;
  path?: string | null;
}

export interface AgentChatSummary {
  id: number;
  userId: number;
  serverId: number;
  title: string;
  chatIcon: string;
  hasActiveRun: boolean;
  hasWaitingConfirmation: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMessage {
  id: number;
  chatId: number;
  userId: number;
  role: AgentMessageRole;
  content: string;
  mentions: AgentMention[];
  createdAt: Date;
}

export interface AgentRun {
  id: number;
  chatId: number;
  userId: number;
  serverId: number;
  triggerMessageId: number | null;
  status: AgentRunStatus;
  manifestVersion: string;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRunStep {
  id: number;
  runId: number;
  ordinal: number;
  operation: string;
  status: AgentRunStepStatus;
  summary: string | null;
  requiresConfirmation: boolean;
  confirmationToken: string | null;
  confirmedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface AgentRunEvent {
  id: number;
  runId: number;
  stepId: number | null;
  type: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AgentMentionSuggestion {
  id: string;
  type: 'node' | 'person' | 'group';
  label: string;
  path?: string | null;
  displayPath?: string | null;
  isContainer?: boolean;
  isFile?: boolean;
  mimeType?: string | null;
  title?: string | null;
  description?: string | null;
  subtitle?: string | null;
}

/** Run summary returned by listRuns and run.status SSE snapshots. */
export interface AgentRunSummary {
  id: number;
  chatId: number;
  userId: number;
  serverId: number;
  triggerMessageId: number | null;
  status: AgentRunStatus;
  manifestVersion: string;
  plan: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pendingStep: AgentRunStep | null;
}

// ── Agent run SSE stream ─────────────────────────────────────────────────────

export type AgentStreamEventType =
  | 'run.status'
  | 'run.event'
  | 'step.started'
  | 'step.completed'
  | 'assistant.delta'
  | 'assistant.clear'
  | 'assistant.done'
  | 'error';

export interface AgentStreamAssistantDelta {
  runId: number;
  sequence: number;
  delta: string;
  text: string;
}

export interface AgentStreamAssistantDone {
  runId: number;
  messageId: number;
  content: string;
  stopReason?: string | null;
}

export interface AgentStreamStepStarted {
  runId: number;
  stepId: number;
  operation: string;
  summary: string | null;
}

export interface AgentStreamStepCompleted {
  runId: number;
  stepId: number;
  operation: string;
  status: 'completed' | 'failed';
  durationMs?: number | null;
}

export interface AgentStreamError {
  runId: number;
  message: string;
  code?: string | null;
}

export type AgentStreamEvent =
  | { type: 'run.status'; run: AgentRunSummary }
  | { type: 'run.event'; event: AgentRunEvent }
  | { type: 'step.started'; step: AgentStreamStepStarted }
  | { type: 'step.completed'; step: AgentStreamStepCompleted }
  | { type: 'assistant.delta'; delta: AgentStreamAssistantDelta }
  | { type: 'assistant.clear'; clear: { runId: number } }
  | { type: 'assistant.done'; done: AgentStreamAssistantDone }
  | { type: 'error'; error: AgentStreamError };
