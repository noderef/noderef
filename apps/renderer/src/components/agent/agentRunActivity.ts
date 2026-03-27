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
 * Agent run-activity builders — transform run events into a structured
 * list of activity items for the chat timeline, plus context-window snapshot
 * parsing for the utilisation indicator.
 *
 * Pure utility module with zero React dependencies.
 */

import type { AgentRunEvent } from '@/core/ipc/backend';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunActivityItem {
  kind: 'note' | 'execution';
  label: string;
  detail: string | null;
  level: 'info' | 'warn' | 'error';
  operation?: string;
}

export interface ContextWindowSnapshot {
  eventId: number;
  runId: number;
  provider: string;
  model: string;
  contextWindowSource: 'known' | 'default';
  contextWindowTokens: number;
  promptTokens: number;
  outputTokens: number | null;
  totalTokens: number;
  utilizationPctPrompt: number;
  utilizationPctTotal: number;
  remainingTokens: number;
  nearLimit: boolean;
  criticalLimit: boolean;
  removedHistoryMessages: number;
  trimmedToolResultBlocks: number;
}

export interface ContextWindowDisplayState {
  provider: string | null;
  model: string | null;
  source: 'known' | 'default';
  usedTokens: number;
  totalTokens: number;
  promptTokens: number;
  outputTokens: number | null;
  percentage: number;
  nearLimit: boolean;
  criticalLimit: boolean;
  removedHistoryMessages: number;
  trimmedToolResultBlocks: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const EXECUTION_EVENT_KEYS: Record<string, string> = {
  'step.completed': 'stepCompleted',
  'step.failed': 'stepFailed',
  'step.waiting_confirmation': 'stepAwaitingConfirmation',
  'step.confirmed': 'stepConfirmed',
  'step.rejected': 'stepRejected',
  'run.failed': 'stepFailed',
};

export const SKIP_EVENT_TYPES = new Set([
  'run.queued',
  'run.executing',
  'run.summarizing',
  'run.completed',
  'run.cancelled',
  'run.context',
]);

const MAX_EVENT_DETAIL_CHARS = 12_000;
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const humanizeOperation = (operation: string): string =>
  operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const resolveContextWindowFromModel = (
  model: string | null | undefined
): { tokens: number; source: 'known' | 'default' } => {
  const normalized = (model || '').toLowerCase();
  if (normalized.includes('claude')) {
    return { tokens: 200_000, source: 'known' };
  }
  return { tokens: DEFAULT_CONTEXT_WINDOW_TOKENS, source: 'default' };
};

// ── Context window snapshot ───────────────────────────────────────────────────

export const buildContextWindowSnapshot = (
  event: AgentRunEvent,
  runId: number
): ContextWindowSnapshot | null => {
  if (event.type !== 'run.context' || !event.payload) {
    return null;
  }

  const payload = event.payload;
  const phase = asString(payload.phase);
  if (phase !== 'post_call' && phase !== 'call_failed') {
    return null;
  }

  const provider = asString(payload.provider) ?? 'unknown';
  const model = asString(payload.model) ?? 'unknown';
  const contextWindowTokens = asNumber(payload.contextWindowTokens);
  if (!contextWindowTokens || contextWindowTokens <= 0) {
    return null;
  }
  const contextWindowSource =
    asString(payload.contextWindowSource) === 'known' ? 'known' : 'default';

  const promptTokensRaw = asNumber(payload.promptTokens);
  const estimatedPromptTokens = asNumber(
    (payload.estimated as Record<string, unknown> | undefined)?.promptTokens
  );
  const promptTokens = promptTokensRaw ?? estimatedPromptTokens ?? 0;

  const outputTokens = asNumber(payload.outputTokens);
  const totalTokensRaw = asNumber(payload.totalTokens);
  const totalTokens = totalTokensRaw ?? promptTokens + (outputTokens ?? 0);
  const utilizationPctPromptRaw = asNumber(payload.utilizationPctPrompt);
  const utilizationPctTotalRaw = asNumber(payload.utilizationPctTotal);
  const utilizationPctPrompt =
    utilizationPctPromptRaw ?? Math.round((promptTokens / contextWindowTokens) * 1000) / 10;
  const utilizationPctTotal =
    utilizationPctTotalRaw ?? Math.round((totalTokens / contextWindowTokens) * 1000) / 10;
  const remainingTokensRaw = asNumber(payload.remainingTokens);
  const remainingTokens = remainingTokensRaw ?? Math.max(0, contextWindowTokens - totalTokens);
  const compaction = payload.compaction as Record<string, unknown> | undefined;

  return {
    eventId: event.id,
    runId,
    provider,
    model,
    contextWindowSource,
    contextWindowTokens,
    promptTokens,
    outputTokens,
    totalTokens,
    utilizationPctPrompt,
    utilizationPctTotal,
    remainingTokens,
    nearLimit: Boolean(payload.nearLimit),
    criticalLimit: Boolean(payload.criticalLimit),
    removedHistoryMessages: asNumber(compaction?.removedHistoryMessages) ?? 0,
    trimmedToolResultBlocks: asNumber(compaction?.trimmedToolResultBlocks) ?? 0,
  };
};

// ── Event detail formatting ───────────────────────────────────────────────────

const stringifyTruncated = (value: unknown): string | null => {
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized.length <= MAX_EVENT_DETAIL_CHARS) {
      return serialized;
    }
    return `${serialized.slice(0, MAX_EVENT_DETAIL_CHARS)}\n... [truncated ${serialized.length - MAX_EVENT_DETAIL_CHARS} chars]`;
  } catch {
    return null;
  }
};

const buildMarkdownDetail = (
  summaryLines: string[],
  sections: Array<{ title: string; value: unknown }>
): string => {
  const lines: string[] = [];
  if (summaryLines.length) {
    lines.push(...summaryLines, '');
  }
  for (const section of sections) {
    const json = stringifyTruncated(section.value);
    if (!json) continue;
    lines.push(`### ${section.title}`);
    lines.push('```json');
    lines.push(json);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n').trim();
};

const formatEventDetail = (event: AgentRunEvent): string | null => {
  const payload = event.payload;
  if (!payload) return null;

  if (event.type === 'step.completed' || event.type === 'step.failed') {
    const output = payload.output as Record<string, unknown> | undefined;
    const toolName = typeof payload.operation === 'string' ? payload.operation : null;
    const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : null;
    const status =
      typeof payload.status === 'string'
        ? payload.status
        : event.type === 'step.failed'
          ? 'failed'
          : 'completed';
    if (!output && !payload.error && !toolName && durationMs === null) return null;

    const summaryLines = [
      `**Tool:** ${toolName || 'unknown'}`,
      `**Status:** ${status}`,
      ...(durationMs !== null ? [`**Duration:** ${durationMs} ms`] : []),
    ];

    const sections: Array<{ title: string; value: unknown }> = [];
    if (output) {
      sections.push({ title: 'Result', value: output });
    } else if (payload.error) {
      sections.push({ title: 'Result', value: { error: String(payload.error) } });
    }

    return buildMarkdownDetail(summaryLines, sections);
  }

  if (event.type === 'step.waiting_confirmation') {
    const args = (payload.output as Record<string, unknown> | undefined)?.args;
    const summary =
      typeof payload.summary === 'string' && payload.summary.trim()
        ? payload.summary.trim()
        : typeof payload.operation === 'string'
          ? humanizeOperation(payload.operation)
          : null;
    return buildMarkdownDetail(
      ['**Status:** awaiting confirmation', `**Action:** ${summary || 'unknown'}`],
      args ? [{ title: 'Arguments', value: args }] : []
    );
  }

  if (event.type === 'run.failed') {
    return buildMarkdownDetail(
      ['**Status:** failed'],
      [
        {
          title: 'Error',
          value: { error: payload.error ? String(payload.error) : 'Unknown run failure' },
        },
      ]
    );
  }

  if (payload.error) {
    return buildMarkdownDetail(
      ['**Status:** error'],
      [{ title: 'Error', value: { error: String(payload.error) } }]
    );
  }

  return null;
};

// ── Build run activity list ───────────────────────────────────────────────────

export const buildRunActivity = (events: AgentRunEvent[]): RunActivityItem[] => {
  const items: RunActivityItem[] = [];

  for (const event of events) {
    if (SKIP_EVENT_TYPES.has(event.type)) continue;

    if (event.type === 'run.note') {
      const text = (event.payload?.text as string) || '';
      if (text) {
        items.push({ kind: 'note', label: text, detail: null, level: 'info' });
      }
      continue;
    }

    const key = EXECUTION_EVENT_KEYS[event.type];
    const label = key ? `__i18n:${key}` : event.type;
    const detail = formatEventDetail(event);
    const level = event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'info';
    const operation =
      typeof event.payload?.summary === 'string' && event.payload.summary.trim()
        ? event.payload.summary.trim()
        : typeof event.payload?.operation === 'string'
          ? humanizeOperation(event.payload.operation)
          : undefined;
    items.push({ kind: 'execution', label, detail, level, operation });
  }

  return items;
};
