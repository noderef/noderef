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
 *
 * Agent Run Engine — native tool-use loop.
 *
 * Pipeline (for any provider — Anthropic, MiniMax, future):
 *
 *   messages = [user message + conversation history]
 *   loop:
 *     response = callWithTools(system, messages, tools)
 *     if response.type === 'text'  → save final answer, done
 *     if response.type === 'tool_calls':
 *       for each call:
 *         if requiresConfirmation → pause, await user confirm, return
 *         else execute → collect result
 *       append tool_use + tool_results to messages → continue
 */

import { NodesApi } from '@alfresco/js-api';
import { randomUUID } from 'crypto';
import {
  callAnthropic,
  callWithTools,
  type AgentCallResult,
  type AgentMessageParam,
  type AgentToolSchema,
} from '../../ai/anthropic.js';
import { createLogger } from '../../lib/logger.js';
import type { AgentRepository } from '../../repositories/agentRepository.js';
import {
  detokenizeText,
  maskPayload,
  maskString,
  type LlmMaskingConfig,
} from '../ai/maskingEngine.js';
import { getMaskingSettings } from '../ai/maskingSettings.js';
import { emitRunEvent, formatConversationHistory, stripHorizontalRules } from './agentUtils.js';
import { buildDescriptionNote, type ProgressNote } from './progressMessages.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { getAllToolSchemas, getToolByName, resolveToolName } from './tools/registry.js';
import type { AgentExecutionContext, ResolvedAiRuntime, RunInput } from './types.js';

const log = createLogger('agent.engine');

const MAX_LOOP_STEPS = 8;
const CALL_TIMEOUT_MS = (() => {
  const configured = Number(process.env.AGENT_CALL_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 5_000 && configured <= 300_000) {
    return Math.floor(configured);
  }
  return 60_000;
})();
const DEFAULT_AGENT_MAX_TOKENS = (() => {
  const configured = Number(process.env.AGENT_MAX_TOKENS);
  if (Number.isFinite(configured) && configured >= 512 && configured <= 16_384) {
    return Math.floor(configured);
  }
  return 2048;
})();
const LARGE_TEXT_AGENT_MAX_TOKENS = (() => {
  const configured = Number(process.env.AGENT_LARGE_TEXT_MAX_TOKENS);
  if (
    Number.isFinite(configured) &&
    configured >= DEFAULT_AGENT_MAX_TOKENS &&
    configured <= 16_384
  ) {
    return Math.floor(configured);
  }
  return Math.max(DEFAULT_AGENT_MAX_TOKENS, 8192);
})();
const MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL = 60_000;
const MAX_API_TRACE_ENTRIES_PREVIEW = 10;
const MAX_API_TRACE_RESPONSE_CHARS_FOR_MODEL = 4_000;
const MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL = 40;
const MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL = 80;
const MAX_SEARCH_NAMES_FOR_MODEL = 120;
const MAX_STEP_SUMMARY_CHARS = 180;
const AVG_CHARS_PER_TOKEN = 4;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
const CONTEXT_NEAR_LIMIT_RATIO = 0.85;
const CONTEXT_CRITICAL_LIMIT_RATIO = 0.95;
const CONTEXT_TARGET_AFTER_COMPACTION_RATIO = 0.75;
const MAX_COMPACTED_TOOL_RESULT_CHARS = 3_000;
const SCRIPT_TOOL_NAME = 'script_execute';
const CHAT_TITLE_MAX_CHARS = 60;
const CHAT_TITLE_MAX_TOKENS = 48;
const CHAT_TITLE_CALL_TIMEOUT_MS = 8_000;
const CHAT_TITLE_PLACEHOLDER = 'new chat';
const DEFAULT_CHAT_ICON = 'hash';
const CHAT_ICON_OPTIONS = [
  'hash',
  'search',
  'file-pdf',
  'file',
  'file-text',
  'file-search',
  'folder',
  'edit',
  'list-check',
  'workflow',
  'code',
  'database',
] as const;
const CHAT_ICON_SET = new Set<string>(CHAT_ICON_OPTIONS);
const CHAT_TITLE_SYSTEM_PROMPT =
  'You generate a short chat title and select a chat icon. Return strict JSON only.';

const KNOWN_MODEL_CONTEXT_WINDOWS: Array<{ pattern: RegExp; tokens: number }> = [
  { pattern: /claude/i, tokens: 200_000 },
];

const EXPLICIT_SCRIPT_REQUEST_PATTERNS: RegExp[] = [
  /\bscript\b/i,
  /\bjavascript\b/i,
  /\bjs\s*console\b/i,
  /\brun\s+(?:a\s+)?script\b/i,
  /\bexecute\s+(?:a\s+)?script\b/i,
  /\bskript\b/i,
  /\bscript uitvoeren\b/i,
  /\bex[ée]cuter\s+un\s+script\b/i,
  /\bscript ausf[üu]hren\b/i,
];

const EXPLICIT_CONTENT_REQUEST_PATTERNS: RegExp[] = [
  /\b(geef|toon|laat\s+zien|open|lees)\b[\s\S]{0,80}\b(inhoud|content)\b/i,
  /\b(show|display|open|read|get)\b[\s\S]{0,80}\b(content|contents)\b/i,
  /\b(inhoud|file\s+content|file\s+contents)\b/i,
];

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let h: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      h = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (h) clearTimeout(h);
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);

const isExplicitContentRequest = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return EXPLICIT_CONTENT_REQUEST_PATTERNS.some(pattern => pattern.test(normalized));
};

const buildDirectNodeContentReply = (
  data: Record<string, unknown>,
  preferredLanguage?: string
): string | null => {
  const isTextBased = data.isTextBased === true;
  const node = isRecord(data.node) ? data.node : null;
  const nodeName = typeof node?.name === 'string' && node.name.trim() ? node.name.trim() : 'file';
  const isDutch = (preferredLanguage ?? '').toLowerCase().startsWith('nl');

  if (!isTextBased) {
    return isDutch
      ? `De inhoud van **${nodeName}** lijkt niet tekst-gebaseerd (binary).`
      : `The content of **${nodeName}** appears to be binary/non-text.`;
  }

  const codeBlock = typeof data.markdownCodeBlock === 'string' ? data.markdownCodeBlock : null;
  if (!codeBlock) {
    return null;
  }

  const hasMoreContent = data.hasMoreContent === true;
  const startChar =
    typeof data.startChar === 'number' && Number.isFinite(data.startChar) ? data.startChar : 0;
  const endCharExclusive =
    typeof data.endCharExclusive === 'number' && Number.isFinite(data.endCharExclusive)
      ? data.endCharExclusive
      : null;
  const totalChars =
    typeof data.totalChars === 'number' && Number.isFinite(data.totalChars)
      ? data.totalChars
      : null;

  if (!hasMoreContent) {
    return isDutch
      ? `Hier is de inhoud van **${nodeName}**:\n\n${codeBlock}`
      : `Here is the content of **${nodeName}**:\n\n${codeBlock}`;
  }

  const rangeText =
    endCharExclusive !== null && totalChars !== null
      ? `${startChar + 1}-${endCharExclusive} / ${totalChars}`
      : null;

  const continuation = isDutch
    ? rangeText
      ? `Dit is een deelweergave (${rangeText}). Vraag om het volgende deel om verder te gaan.`
      : 'Dit is een deelweergave. Vraag om het volgende deel om verder te gaan.'
    : rangeText
      ? `This is a partial view (${rangeText}). Ask for the next part to continue.`
      : 'This is a partial view. Ask for the next part to continue.';

  return isDutch
    ? `Hier is (een deel van) de inhoud van **${nodeName}**.\n\n${continuation}\n\n${codeBlock}`
    : `Here is (part of) the content of **${nodeName}**.\n\n${continuation}\n\n${codeBlock}`;
};

const toTokenEstimate = (text: string): number =>
  Math.ceil(Math.max(text.length, 1) / AVG_CHARS_PER_TOKEN);

const truncateText = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
};

const normalizeSummaryText = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/[`*_#]+/g, '')
    .trim();

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const formatOperationLabel = (operation: string): string =>
  operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

const buildFallbackStepSummary = (operation: string, args: Record<string, unknown>): string => {
  switch (operation) {
    case 'node_create': {
      const name = toNonEmptyString(args.name);
      const parentId = toNonEmptyString(args.parentId);
      if (name && parentId) return `Create "${name}" in folder ${parentId}`;
      if (name) return `Create "${name}"`;
      return 'Create a new node';
    }
    case 'node_update': {
      const nodeId = toNonEmptyString(args.nodeId);
      const name = toNonEmptyString(args.name);
      if (name && nodeId) return `Rename node ${nodeId} to "${name}"`;
      if (nodeId) return `Update node ${nodeId}`;
      return 'Update node metadata';
    }
    case 'node_update_content': {
      const nodeId = toNonEmptyString(args.nodeId);
      if (nodeId) return `Update content for node ${nodeId}`;
      return 'Update node content';
    }
    case 'node_move': {
      const sourceNodeId = toNonEmptyString(args.sourceNodeId);
      const targetParentId = toNonEmptyString(args.targetParentId);
      if (sourceNodeId && targetParentId) {
        return `Move node ${sourceNodeId} to folder ${targetParentId}`;
      }
      return 'Move a node to another folder';
    }
    case 'node_copy': {
      const sourceNodeId = toNonEmptyString(args.sourceNodeId);
      const targetParentId = toNonEmptyString(args.targetParentId);
      if (sourceNodeId && targetParentId) {
        return `Copy node ${sourceNodeId} to folder ${targetParentId}`;
      }
      return 'Copy a node to another folder';
    }
    case 'node_delete': {
      const nodeIds = Array.isArray(args.nodeIds)
        ? args.nodeIds.map(id => String(id).trim()).filter(Boolean)
        : [];
      if (nodeIds.length === 1) return `Delete node ${nodeIds[0]}`;
      if (nodeIds.length > 1) return `Delete ${nodeIds.length} nodes`;
      return 'Delete node(s)';
    }
    case 'script_execute': {
      const script = toNonEmptyString(args.script);
      if (script) {
        const preview = script.split(/\r?\n/).find(line => line.trim()) || script;
        return `Execute script: ${truncateText(preview.trim(), 90)}`;
      }
      return 'Execute a server script';
    }
    case 'script_create': {
      const request = toNonEmptyString(args.request);
      if (request) return `Generate script: ${truncateText(request, 90)}`;
      return 'Generate a JavaScript Console script';
    }
    case 'search': {
      const query = toNonEmptyString(args.query);
      if (query) return `Search for "${truncateText(query, 80)}"`;
      return 'Search the repository';
    }
    case 'search_export_text': {
      const query = toNonEmptyString(args.query);
      const fileName = toNonEmptyString(args.fileName);
      if (query && fileName)
        return `Export text file "${fileName}" from search "${truncateText(query, 60)}"`;
      if (query) return `Export text from search "${truncateText(query, 80)}"`;
      if (fileName) return `Export search results to text file "${fileName}"`;
      return 'Export search results to text file';
    }
    case 'text_write_begin': {
      const nodeId = toNonEmptyString(args.nodeId);
      const parentId = toNonEmptyString(args.parentId);
      const fileName = toNonEmptyString(args.fileName);
      if (nodeId) return `Begin large text write to node ${nodeId}`;
      if (parentId && fileName)
        return `Begin large text write for "${fileName}" in folder ${parentId}`;
      return 'Begin large text write session';
    }
    case 'text_write_append': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Append chunk to write session ${sessionId}`;
      return 'Append chunk to write session';
    }
    case 'text_write_status': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Check write session ${sessionId} status`;
      return 'Check write session status';
    }
    case 'text_write_abort': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Abort write session ${sessionId}`;
      return 'Abort write session';
    }
    case 'text_write_commit': {
      const sessionId = toNonEmptyString(args.sessionId);
      if (sessionId) return `Commit write session ${sessionId} to Alfresco`;
      return 'Commit write session to Alfresco';
    }
    default:
      return `Run ${formatOperationLabel(operation)}`;
  }
};

const buildStepSummary = ({
  operation,
  args,
  reasoning,
  callIndex,
  totalCalls,
}: {
  operation: string;
  args: Record<string, unknown>;
  reasoning: string | null;
  callIndex: number;
  totalCalls: number;
}): string => {
  const normalizedReasoning = reasoning ? normalizeSummaryText(reasoning) : '';
  if (normalizedReasoning && (totalCalls === 1 || callIndex === 0)) {
    return truncateText(normalizedReasoning, MAX_STEP_SUMMARY_CHARS);
  }

  const fallback = buildFallbackStepSummary(operation, args);
  return truncateText(normalizeSummaryText(fallback), MAX_STEP_SUMMARY_CHARS);
};

const isExplicitScriptExecutionRequested = (content: string): boolean => {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }
  return EXPLICIT_SCRIPT_REQUEST_PATTERNS.some(pattern => pattern.test(normalized));
};

const toPercent = (value: number): number => Math.max(0, Math.round(value * 10) / 10);

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

const trimOuterQuotes = (text: string): string => {
  let value = text.trim();
  while (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('`') && value.endsWith('`')) ||
    (value.startsWith('“') && value.endsWith('”')) ||
    (value.startsWith('‘') && value.endsWith('’'))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
};

const capitalizeFirstLetter = (text: string): string => {
  const match = text.match(/\p{L}/u);
  if (!match || match.index === undefined) {
    return text;
  }
  const i = match.index;
  return `${text.slice(0, i)}${text.charAt(i).toLocaleUpperCase()}${text.slice(i + 1)}`;
};

const sanitizeChatTitle = (raw: string, maxChars = CHAT_TITLE_MAX_CHARS): string => {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? '';
  const noMarkdownPrefix = firstLine.replace(/^[#>*\-\s]+/, '');
  const noOuterQuotes = trimOuterQuotes(noMarkdownPrefix);
  const noTrailingPunctuation = noOuterQuotes.replace(/[.!?;:,]+$/g, '');
  const compact = collapseWhitespace(noTrailingPunctuation);
  if (!compact) {
    return '';
  }
  const truncated = compact.length <= maxChars ? compact : compact.slice(0, maxChars).trimEnd();
  const cleaned = truncated.replace(/[.!?;:,]+$/g, '').trim();
  if (!cleaned) {
    return '';
  }
  return capitalizeFirstLetter(cleaned);
};

const buildLegacyTitleSnippet = (content: string, maxChars: number): string =>
  collapseWhitespace(content)
    .slice(0, maxChars)
    .replace(/[.!?]+$/g, '')
    .trim();

const normalizeChatIcon = (value: unknown): string => {
  if (typeof value !== 'string') {
    return DEFAULT_CHAT_ICON;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  const aliasMap: Record<string, string> = {
    pdf: 'file-pdf',
    'pdf-file': 'file-pdf',
    'file-pdf-icon': 'file-pdf',
    filetext: 'file-text',
    filetexticon: 'file-text',
    filesearch: 'file-search',
    filesearchicon: 'file-search',
    listcheck: 'list-check',
    checklist: 'list-check',
  };
  const resolved = aliasMap[normalized] ?? normalized;
  return CHAT_ICON_SET.has(resolved) ? resolved : DEFAULT_CHAT_ICON;
};

const normalizeChatTitleForCompare = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[.!?;:,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const resolveChatPresentationUpdate = ({
  existingTitle,
  existingIcon,
  content,
  hasHistory,
}: {
  existingTitle: string;
  existingIcon: string;
  content: string;
  hasHistory: boolean;
}): { shouldUpdateTitle: boolean; shouldUpdateIcon: boolean } => {
  if (hasHistory) {
    return { shouldUpdateTitle: false, shouldUpdateIcon: false };
  }

  const normalizedTitle = normalizeChatTitleForCompare(existingTitle);
  let shouldUpdateTitle = false;
  if (!normalizedTitle || normalizedTitle === CHAT_TITLE_PLACEHOLDER) {
    shouldUpdateTitle = true;
  } else {
    const legacy60 = normalizeChatTitleForCompare(buildLegacyTitleSnippet(content, 60));
    const legacy80 = normalizeChatTitleForCompare(buildLegacyTitleSnippet(content, 80));
    shouldUpdateTitle = normalizedTitle === legacy60 || normalizedTitle === legacy80;
  }

  const shouldUpdateIcon = normalizeChatIcon(existingIcon) === DEFAULT_CHAT_ICON;
  return { shouldUpdateTitle, shouldUpdateIcon };
};

const buildFallbackChatTitle = (content: string): string =>
  sanitizeChatTitle(buildLegacyTitleSnippet(content, CHAT_TITLE_MAX_CHARS), CHAT_TITLE_MAX_CHARS);

const buildChatPresentationPrompt = (content: string, preferredLanguage?: string): string => {
  const languageLine = preferredLanguage
    ? `Write the title in language code "${preferredLanguage}".`
    : 'Use the same language as the user message.';

  return [
    'Create a concise topic title and choose the best icon for the user message.',
    languageLine,
    'Rules:',
    '- 2 to 6 words.',
    '- Start with a capital letter.',
    '- No markdown, no surrounding quotes.',
    '- No trailing punctuation.',
    `- Maximum ${CHAT_TITLE_MAX_CHARS} characters.`,
    `- Icon must be one of: ${CHAT_ICON_OPTIONS.join(', ')}.`,
    '- Use "hash" if no icon clearly matches.',
    '- Return strict JSON only with keys: title, icon.',
    '- Example: {"title":"Find PDF metadata","icon":"file-pdf"}',
    '',
    'User message:',
    `"""${content}"""`,
  ].join('\n');
};

const parseModelJsonObject = (raw: string): Record<string, unknown> | null => {
  const direct = raw.trim();
  try {
    const parsed = JSON.parse(direct) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim()) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1).trim();
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  return null;
};

const parseChatPresentationFromModel = (
  raw: string,
  content: string
): { title: string; chatIcon: string } => {
  const parsed = parseModelJsonObject(raw);
  const modelTitle = sanitizeChatTitle(
    typeof parsed?.title === 'string' ? parsed.title : parsed ? '' : raw
  );
  const title = modelTitle || buildFallbackChatTitle(content);
  const chatIcon = normalizeChatIcon(parsed?.icon);
  return { title, chatIcon };
};

interface ContextWindowResolution {
  tokens: number;
  source: 'known' | 'default';
}

interface ContextTokenEstimate {
  systemTokens: number;
  messagesTokens: number;
  toolsTokens: number;
  promptTokens: number;
}

interface ContextCompactionResult {
  removedHistoryMessages: number;
  trimmedToolResultBlocks: number;
  beforePromptTokens: number;
  afterPromptTokens: number;
  applied: boolean;
}

const resolveModelContextWindow = (model: string): ContextWindowResolution => {
  for (const candidate of KNOWN_MODEL_CONTEXT_WINDOWS) {
    if (candidate.pattern.test(model)) {
      return { tokens: candidate.tokens, source: 'known' };
    }
  }
  return { tokens: DEFAULT_CONTEXT_WINDOW_TOKENS, source: 'default' };
};

const estimateMessageContentTokens = (content: unknown): number => {
  if (typeof content === 'string') {
    return toTokenEstimate(content);
  }

  if (!Array.isArray(content)) {
    try {
      return toTokenEstimate(JSON.stringify(content));
    } catch {
      return 0;
    }
  }

  let tokens = 0;
  for (const block of content) {
    if (!isRecord(block)) {
      tokens += 4;
      continue;
    }

    if (block.type === 'text' && typeof block.text === 'string') {
      tokens += toTokenEstimate(block.text) + 4;
      continue;
    }

    if (block.type === 'tool_use') {
      const toolName = typeof block.name === 'string' ? block.name : '';
      tokens += toTokenEstimate(toolName) + 6;
      if (isRecord(block.input)) {
        tokens += toTokenEstimate(JSON.stringify(block.input));
      }
      continue;
    }

    if (block.type === 'tool_result') {
      if (typeof block.content === 'string') {
        tokens += toTokenEstimate(block.content) + 6;
      } else {
        try {
          tokens += toTokenEstimate(JSON.stringify(block.content)) + 6;
        } catch {
          tokens += 6;
        }
      }
      continue;
    }

    try {
      tokens += toTokenEstimate(JSON.stringify(block));
    } catch {
      tokens += 8;
    }
  }

  return tokens;
};

const estimatePromptTokens = (
  systemPrompt: string,
  messages: AgentMessageParam[],
  tools: AgentToolSchema[]
): ContextTokenEstimate => {
  const systemTokens = toTokenEstimate(systemPrompt);
  const messagesTokens = messages.reduce((sum, message) => {
    const messageContent = (message as { content?: unknown }).content;
    return sum + estimateMessageContentTokens(messageContent) + 6;
  }, 0);
  const toolsTokens = toTokenEstimate(JSON.stringify(tools));
  return {
    systemTokens,
    messagesTokens,
    toolsTokens,
    promptTokens: systemTokens + messagesTokens + toolsTokens + 32,
  };
};

const trimHistoricalToolResults = (messages: AgentMessageParam[]): number => {
  let trimmedCount = 0;

  // Preserve the most recent two turns intact.
  for (let index = 0; index < Math.max(0, messages.length - 2); index += 1) {
    const message = messages[index] as { content?: unknown };
    if (!Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content) {
      if (!isRecord(block) || block.type !== 'tool_result' || typeof block.content !== 'string') {
        continue;
      }
      if (block.content.length <= MAX_COMPACTED_TOOL_RESULT_CHARS) {
        continue;
      }

      const removed = block.content.length - MAX_COMPACTED_TOOL_RESULT_CHARS;
      block.content = `${block.content.slice(0, MAX_COMPACTED_TOOL_RESULT_CHARS)}\n... [trimmed ${removed} chars to preserve context window]`;
      trimmedCount += 1;
    }
  }

  return trimmedCount;
};

const compactApiTraceResponseBodyForModel = (body: unknown): unknown => {
  if (isRecord(body) && isRecord(body.list)) {
    const list = body.list as Record<string, unknown>;
    const entries = Array.isArray(list.entries) ? list.entries : [];
    const entriesPreview = entries.slice(0, MAX_API_TRACE_ENTRIES_PREVIEW).map(item => {
      if (isRecord(item) && isRecord(item.entry)) {
        const e = item.entry as Record<string, unknown>;
        return {
          id: e.id ?? null,
          name: e.name ?? null,
          nodeType: e.nodeType ?? null,
          isFolder: e.isFolder ?? null,
          isFile: e.isFile ?? null,
        };
      }
      return item;
    });

    return {
      list: {
        pagination: list.pagination ?? null,
        returned: entries.length,
        entriesPreview,
      },
    };
  }

  try {
    const serialized = JSON.stringify(body);
    if (serialized.length <= MAX_API_TRACE_RESPONSE_CHARS_FOR_MODEL) {
      return body;
    }
    return {
      omitted: true,
      reason: 'responseBody too large for model context',
      originalSizeChars: serialized.length,
    };
  } catch {
    return {
      omitted: true,
      reason: 'responseBody could not be serialized for model context',
    };
  }
};

const compactSearchSampleEntryForModel = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return value;
  }

  return {
    id: value.id ?? null,
    name: value.name ?? null,
    nodeType: value.nodeType ?? null,
    isFolder: value.isFolder ?? null,
    isFile: value.isFile ?? null,
    path: value.path ?? null,
    mimeType: value.mimeType ?? null,
    modifiedAt: value.modifiedAt ?? null,
  };
};

const compactToolDataForModel = (data: Record<string, unknown>): Record<string, unknown> => {
  let cloned: Record<string, unknown>;
  try {
    cloned = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return data;
  }

  if (
    isRecord(cloned.apiTrace) &&
    Object.prototype.hasOwnProperty.call(cloned.apiTrace, 'responseBody')
  ) {
    cloned.apiTrace.responseBody = compactApiTraceResponseBodyForModel(
      cloned.apiTrace.responseBody
    );
  }
  if (
    isRecord(cloned.alfrescoSearchApi) &&
    Object.prototype.hasOwnProperty.call(cloned.alfrescoSearchApi, 'responseBody')
  ) {
    cloned.alfrescoSearchApi.responseBody = compactApiTraceResponseBodyForModel(
      cloned.alfrescoSearchApi.responseBody
    );
  }

  if (Array.isArray(cloned.sample) && cloned.sample.length > MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL) {
    const originalLength = cloned.sample.length;
    cloned.sample = cloned.sample
      .slice(0, MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL)
      .map(compactSearchSampleEntryForModel);
    cloned.sampleTruncated = originalLength - MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL;
  } else if (Array.isArray(cloned.sample)) {
    cloned.sample = cloned.sample.map(compactSearchSampleEntryForModel);
  }

  if (
    Array.isArray(cloned.projectedItems) &&
    cloned.projectedItems.length > MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL
  ) {
    const originalLength = cloned.projectedItems.length;
    cloned.projectedItems = cloned.projectedItems.slice(0, MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL);
    cloned.projectedItemsTruncated = originalLength - MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL;
  }

  if (
    Array.isArray(cloned.verifiedNames) &&
    cloned.verifiedNames.length > MAX_SEARCH_NAMES_FOR_MODEL
  ) {
    const originalLength = cloned.verifiedNames.length;
    cloned.verifiedNames = cloned.verifiedNames.slice(0, MAX_SEARCH_NAMES_FOR_MODEL);
    cloned.verifiedNamesTruncated = originalLength - MAX_SEARCH_NAMES_FOR_MODEL;
  }

  if (
    Array.isArray(cloned.uniqueVerifiedNames) &&
    cloned.uniqueVerifiedNames.length > MAX_SEARCH_NAMES_FOR_MODEL
  ) {
    const originalLength = cloned.uniqueVerifiedNames.length;
    cloned.uniqueVerifiedNames = cloned.uniqueVerifiedNames.slice(0, MAX_SEARCH_NAMES_FOR_MODEL);
    cloned.uniqueVerifiedNamesTruncated = originalLength - MAX_SEARCH_NAMES_FOR_MODEL;
  }

  return cloned;
};

export class AgentRunEngine {
  constructor(
    private repository: AgentRepository,
    private runtime: ResolvedAiRuntime,
    private execCtx: AgentExecutionContext,
    private signal: AbortSignal
  ) {}

  async execute(input: RunInput): Promise<void> {
    // ── Conversation history → prepended as assistant/user turns ──────────────
    const recentMessages = await this.repository.getRecentMessages(input.chatId, {
      maxItems: 20,
      excludeMessageId: input.triggerMessageId,
    });
    const historyText = formatConversationHistory(recentMessages);

    // ── Resolve @mention nodes for context ────────────────────────────────────
    const mentionContext = await this.resolveMentionContext(input);

    await this.maybeGenerateInitialChatPresentation(input, recentMessages.length > 0);

    // ── Build initial message list ─────────────────────────────────────────────
    const systemPrompt = await buildSystemPrompt(mentionContext, input.preferredLanguage);
    const allTools = getAllToolSchemas();
    const allowScriptExecution = isExplicitScriptExecutionRequested(input.content);
    const tools = allowScriptExecution
      ? allTools
      : allTools.filter(schema => resolveToolName(schema.name) !== SCRIPT_TOOL_NAME);

    // Inject conversation history as a prior assistant message if available
    const messages: AgentMessageParam[] = [];
    if (historyText.trim()) {
      messages.push({ role: 'user', content: '<conversation_history>' });
      messages.push({ role: 'assistant', content: historyText });
    }
    messages.push({ role: 'user', content: input.content });

    // ── Tool-use loop ─────────────────────────────────────────────────────────
    let stepOrdinal = await this.repository.getMaxRunStepOrdinal(input.runId);
    const contextWindow = resolveModelContextWindow(this.runtime.model);
    let nextCallMaxTokens = DEFAULT_AGENT_MAX_TOKENS;

    // ── Load masking config once for the run ────────────────────────────────
    let maskingConfig: LlmMaskingConfig | null = null;
    try {
      maskingConfig = await getMaskingSettings(input.userId);
      if (!maskingConfig.enabled) maskingConfig = null;
    } catch {
      // Masking unavailable — proceed unmasked
    }
    const maskingTokenMap = maskingConfig?.mode === 'tokenize' ? new Map<string, string>() : null;

    for (let iteration = 0; iteration < MAX_LOOP_STEPS; iteration++) {
      this.checkAborted();

      const iterationIndex = iteration + 1;
      const preCompactionEstimate = estimatePromptTokens(systemPrompt, messages, tools);
      const compaction = this.compactMessagesForContextWindow(
        messages,
        systemPrompt,
        tools,
        contextWindow.tokens
      );
      const effectiveEstimate =
        compaction.applied && compaction.afterPromptTokens > 0
          ? estimatePromptTokens(systemPrompt, messages, tools)
          : preCompactionEstimate;
      const preCallPromptTokens = effectiveEstimate.promptTokens;
      const preCallPromptUtilization = preCallPromptTokens / contextWindow.tokens;

      await this.emitEvent(input.runId, 'run.context', 'info', {
        phase: 'pre_call',
        iteration: iterationIndex,
        provider: this.runtime.provider,
        model: this.runtime.model,
        contextWindowTokens: contextWindow.tokens,
        contextWindowSource: contextWindow.source,
        estimated: {
          systemTokens: effectiveEstimate.systemTokens,
          messagesTokens: effectiveEstimate.messagesTokens,
          toolsTokens: effectiveEstimate.toolsTokens,
          promptTokens: preCallPromptTokens,
        },
        utilizationPctPrompt: toPercent(preCallPromptUtilization * 100),
        nearLimit: preCallPromptUtilization >= CONTEXT_NEAR_LIMIT_RATIO,
        criticalLimit: preCallPromptUtilization >= CONTEXT_CRITICAL_LIMIT_RATIO,
        remainingTokens: Math.max(0, contextWindow.tokens - preCallPromptTokens),
        compaction,
      });

      let response: AgentCallResult;
      try {
        // ── Apply masking to outbound payload ──────────────────────────────
        let maskedSystem = systemPrompt;
        let maskedMessages = messages;
        if (maskingConfig) {
          maskedSystem = maskString(systemPrompt, maskingConfig).masked;
          const { masked } = maskPayload(messages, maskingConfig, {
            tokenMap: maskingTokenMap ?? undefined,
          });
          maskedMessages = masked as AgentMessageParam[];
        }

        response = await withTimeout(
          callWithTools({
            apiKey: this.runtime.apiKey,
            model: this.runtime.model,
            baseURL: this.runtime.baseURL,
            system: maskedSystem,
            messages: maskedMessages,
            tools,
            maxTokens: nextCallMaxTokens,
            temperature: this.runtime.temperature,
          }),
          CALL_TIMEOUT_MS,
          `Agent call (iteration ${iterationIndex})`
        );
      } catch (err) {
        await this.emitEvent(input.runId, 'run.context', 'warn', {
          phase: 'call_failed',
          iteration: iterationIndex,
          provider: this.runtime.provider,
          model: this.runtime.model,
          contextWindowTokens: contextWindow.tokens,
          contextWindowSource: contextWindow.source,
          estimated: {
            systemTokens: effectiveEstimate.systemTokens,
            messagesTokens: effectiveEstimate.messagesTokens,
            toolsTokens: effectiveEstimate.toolsTokens,
            promptTokens: preCallPromptTokens,
          },
          utilizationPctPrompt: toPercent(preCallPromptUtilization * 100),
          nearLimit: preCallPromptUtilization >= CONTEXT_NEAR_LIMIT_RATIO,
          criticalLimit: preCallPromptUtilization >= CONTEXT_CRITICAL_LIMIT_RATIO,
          remainingTokens: Math.max(0, contextWindow.tokens - preCallPromptTokens),
          compaction,
          error: toErrorMessage(err),
        });
        log.error({ err, iteration }, 'Model call failed');
        throw err;
      }

      const apiInputTokens = response.usage?.inputTokens ?? null;
      const apiOutputTokens = response.usage?.outputTokens ?? null;
      const promptTokens = apiInputTokens ?? preCallPromptTokens;
      const totalTokens = promptTokens + (apiOutputTokens ?? 0);
      const promptUtilization = promptTokens / contextWindow.tokens;
      const totalUtilization = totalTokens / contextWindow.tokens;

      await this.emitEvent(input.runId, 'run.context', 'info', {
        phase: 'post_call',
        iteration: iterationIndex,
        provider: this.runtime.provider,
        model: this.runtime.model,
        contextWindowTokens: contextWindow.tokens,
        contextWindowSource: contextWindow.source,
        estimated: {
          systemTokens: effectiveEstimate.systemTokens,
          messagesTokens: effectiveEstimate.messagesTokens,
          toolsTokens: effectiveEstimate.toolsTokens,
          promptTokens: preCallPromptTokens,
        },
        usage: response.usage,
        promptTokens,
        outputTokens: apiOutputTokens,
        totalTokens,
        utilizationPctPrompt: toPercent(promptUtilization * 100),
        utilizationPctTotal: toPercent(totalUtilization * 100),
        nearLimit: totalUtilization >= CONTEXT_NEAR_LIMIT_RATIO,
        criticalLimit: totalUtilization >= CONTEXT_CRITICAL_LIMIT_RATIO,
        remainingTokens: Math.max(0, contextWindow.tokens - totalTokens),
        compaction,
      });

      log.info(
        { type: response.type, stopReason: response.stopReason, iteration },
        'Model response'
      );

      // ── Final text answer ──────────────────────────────────────────────────
      if (response.type === 'text') {
        const detokenizedText = maskingTokenMap
          ? detokenizeText(response.text, maskingTokenMap)
          : response.text;
        const sanitizedText = stripHorizontalRules(detokenizedText);
        await this.repository.createMessage({
          chatId: input.chatId,
          userId: input.userId,
          role: 'assistant',
          content: sanitizedText,
          mentions: [],
        });
        return;
      }

      // ── Tool calls ─────────────────────────────────────────────────────────
      const detokenizedReasoning =
        maskingTokenMap && response.reasoning
          ? detokenizeText(response.reasoning, maskingTokenMap)
          : response.reasoning;
      const rawContentForHistory = maskingTokenMap
        ? response.rawContent.map(block =>
            block.type === 'text'
              ? { ...block, text: detokenizeText(block.text, maskingTokenMap) }
              : block
          )
        : response.rawContent;

      // The model's full response (text + tool_use blocks) appended as-is
      messages.push({ role: 'assistant', content: rawContentForHistory });

      const toolResultContents: Array<{
        tool_use_id: string;
        type: 'tool_result';
        content: string;
        is_error?: boolean;
      }> = [];
      let shouldBoostNextCallMaxTokens = false;
      let directNodeContentReply: string | null = null;

      for (const [callIndex, call] of response.calls.entries()) {
        this.checkAborted();

        const tool = getToolByName(call.name);
        const canonicalOperation = resolveToolName(call.name);
        if (!tool) {
          log.warn({ name: call.name }, 'Unknown tool called by model');
          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
            is_error: true,
          });
          continue;
        }

        const scriptExecutionBlocked =
          canonicalOperation === SCRIPT_TOOL_NAME && !allowScriptExecution;
        if (scriptExecutionBlocked) {
          const blockedMessage =
            'Script execution is blocked unless the user explicitly asks to execute a script.';
          const stepSummary = buildStepSummary({
            operation: canonicalOperation,
            args: call.args,
            reasoning: detokenizedReasoning,
            callIndex,
            totalCalls: response.calls.length,
          });

          stepOrdinal += 1;
          const step = await this.repository.createRunStep({
            runId: input.runId,
            ordinal: stepOrdinal,
            operation: canonicalOperation,
            status: 'failed',
            summary: stepSummary,
            input: call.args,
            requiresConfirmation: tool.requiresConfirmation,
            completedAt: new Date(),
            output: {
              error: blockedMessage,
              policy: 'script_execute_requires_explicit_user_request',
            },
          });

          await this.emitEvent(input.runId, 'step.failed', 'warn', {
            stepId: step.id,
            operation: canonicalOperation,
            status: 'failed',
            output: { error: blockedMessage },
            error: blockedMessage,
          });

          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ error: blockedMessage }),
            is_error: true,
          });
          continue;
        }

        const autoApproveEnabledForCall = Boolean(
          input.autoApproveConfirmations && tool.requiresConfirmation
        );
        const requiresManualConfirmation = tool.requiresConfirmation && !autoApproveEnabledForCall;
        const stepSummary = buildStepSummary({
          operation: canonicalOperation,
          args: call.args,
          reasoning: detokenizedReasoning,
          callIndex,
          totalCalls: response.calls.length,
        });

        stepOrdinal += 1;
        const step = await this.repository.createRunStep({
          runId: input.runId,
          ordinal: stepOrdinal,
          operation: canonicalOperation,
          status: requiresManualConfirmation ? 'waiting_confirmation' : 'running',
          summary: stepSummary,
          input: call.args,
          requiresConfirmation: tool.requiresConfirmation,
        });

        // ── Emit description note on first tool call: use LLM's own words ────
        if (stepOrdinal === 1 && detokenizedReasoning?.trim()) {
          await this.emitNote(input.runId, buildDescriptionNote(detokenizedReasoning.trim()));
        }
        // ── Confirmation gate ────────────────────────────────────────────────
        if (requiresManualConfirmation) {
          const token = randomUUID();
          await this.repository.updateRunStep(input.userId, input.runId, step.id, {
            status: 'waiting_confirmation',
            confirmationToken: token,
          });
          await this.repository.updateRun(input.userId, input.runId, {
            status: 'waiting_confirmation',
          });
          await this.emitEvent(input.runId, 'step.waiting_confirmation', 'warn', {
            stepId: step.id,
            confirmationToken: token,
            operation: canonicalOperation,
            summary: stepSummary,
            output: { args: call.args },
          });
          await this.repository.createOperationAudit({
            runId: input.runId,
            stepId: step.id,
            userId: input.userId,
            serverId: input.serverId,
            operation: canonicalOperation,
            action: 'requested',
            targetSummary: stepSummary,
            requestMessageId: input.triggerMessageId,
          });
          return; // halts — resumed by AgentService.approveStep
        }

        // ── Execute tool ─────────────────────────────────────────────────────
        await this.emitEvent(input.runId, 'run.executing', 'info', { stepId: step.id });

        const executionStartedAt = Date.now();
        const toolResult = await tool.execute(this.execCtx, call.args);
        const durationMs = Date.now() - executionStartedAt;
        const modelPayload = toolResult.ok
          ? compactToolDataForModel(toolResult.data)
          : { error: toolResult.error };
        let resultStr = JSON.stringify(modelPayload);
        if (resultStr.length > MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL) {
          resultStr = `${resultStr.slice(0, MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL)}\n... [truncated ${resultStr.length - MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL} chars for model context]`;
        }

        if (toolResult.ok) {
          if (canonicalOperation === 'node_get_content' && toolResult.data.isTextBased === true) {
            shouldBoostNextCallMaxTokens = true;
          }
          if (
            canonicalOperation === 'node_get_content' &&
            isExplicitContentRequest(input.content) &&
            !directNodeContentReply
          ) {
            directNodeContentReply = buildDirectNodeContentReply(
              toolResult.data,
              input.preferredLanguage
            );
          }
          await this.repository.updateRunStep(input.userId, input.runId, step.id, {
            status: 'completed',
            completedAt: new Date(),
            output: toolResult.data,
          });
          await this.emitEvent(input.runId, 'step.completed', 'info', {
            stepId: step.id,
            operation: canonicalOperation,
            status: 'completed',
            durationMs,
            output: toolResult.data,
          });
        } else {
          await this.repository.updateRunStep(input.userId, input.runId, step.id, {
            status: 'failed',
            completedAt: new Date(),
            output: { error: toolResult.error },
          });
          await this.emitEvent(input.runId, 'step.failed', 'error', {
            stepId: step.id,
            operation: canonicalOperation,
            status: 'failed',
            durationMs,
            output: { error: toolResult.error },
            error: toolResult.error,
          });
        }

        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: resultStr,
          ...(toolResult.ok ? {} : { is_error: true }),
        });
      }

      if (directNodeContentReply) {
        await this.repository.createMessage({
          chatId: input.chatId,
          userId: input.userId,
          role: 'assistant',
          content: directNodeContentReply,
          mentions: [],
        });
        return;
      }

      // Append all tool results as a user message, then loop back to model
      messages.push({ role: 'user', content: toolResultContents });
      nextCallMaxTokens = shouldBoostNextCallMaxTokens
        ? LARGE_TEXT_AGENT_MAX_TOKENS
        : DEFAULT_AGENT_MAX_TOKENS;
    }

    // Safety: if we hit MAX_LOOP_STEPS, emit a fallback message
    log.warn({ runId: input.runId }, 'Agent hit MAX_LOOP_STEPS without a final answer');
    await this.repository.createMessage({
      chatId: input.chatId,
      userId: input.userId,
      role: 'assistant',
      content:
        'I was unable to complete the request within the step limit. Please try a more specific question.',
      mentions: [],
    });
  }

  private async maybeGenerateInitialChatPresentation(
    input: RunInput,
    hasHistory: boolean
  ): Promise<void> {
    const updateFlags = resolveChatPresentationUpdate({
      existingTitle: input.chatTitle,
      existingIcon: input.chatIcon,
      content: input.content,
      hasHistory,
    });

    if (!updateFlags.shouldUpdateTitle && !updateFlags.shouldUpdateIcon) {
      return;
    }

    let nextTitle = buildFallbackChatTitle(input.content);
    let nextChatIcon = DEFAULT_CHAT_ICON;

    try {
      const generated = await withTimeout(
        callAnthropic({
          apiKey: this.runtime.apiKey,
          model: this.runtime.model,
          baseURL: this.runtime.baseURL,
          system: CHAT_TITLE_SYSTEM_PROMPT,
          prompt: buildChatPresentationPrompt(input.content, input.preferredLanguage),
          maxTokens: CHAT_TITLE_MAX_TOKENS,
          temperature: 0,
        }),
        CHAT_TITLE_CALL_TIMEOUT_MS,
        'chat presentation generation'
      );
      const parsed = parseChatPresentationFromModel(generated, input.content);
      nextTitle = parsed.title;
      nextChatIcon = parsed.chatIcon;
    } catch (error) {
      log.debug(
        { err: toErrorMessage(error), chatId: input.chatId, runId: input.runId },
        'Chat presentation generation failed; falling back to defaults'
      );
    }

    const updates: { title?: string; chatIcon?: string } = {};
    if (updateFlags.shouldUpdateTitle && nextTitle) {
      updates.title = nextTitle;
    }
    if (updateFlags.shouldUpdateIcon) {
      updates.chatIcon = nextChatIcon || DEFAULT_CHAT_ICON;
    }
    if (!updates.title && !updates.chatIcon) {
      return;
    }

    await this.repository
      .updateChatPresentation(input.userId, input.chatId, updates)
      .catch(() => {});
  }

  private compactMessagesForContextWindow(
    messages: AgentMessageParam[],
    systemPrompt: string,
    tools: AgentToolSchema[],
    contextWindowTokens: number
  ): ContextCompactionResult {
    const beforeEstimate = estimatePromptTokens(systemPrompt, messages, tools);
    const nearThresholdTokens = Math.floor(contextWindowTokens * CONTEXT_NEAR_LIMIT_RATIO);
    const targetTokens = Math.floor(contextWindowTokens * CONTEXT_TARGET_AFTER_COMPACTION_RATIO);

    if (beforeEstimate.promptTokens < nearThresholdTokens) {
      return {
        removedHistoryMessages: 0,
        trimmedToolResultBlocks: 0,
        beforePromptTokens: beforeEstimate.promptTokens,
        afterPromptTokens: beforeEstimate.promptTokens,
        applied: false,
      };
    }

    let removedHistoryMessages = 0;
    const canDropConversationHistoryPair = () =>
      messages.length >= 3 &&
      messages[0]?.role === 'user' &&
      (messages[0] as { content?: unknown }).content === '<conversation_history>' &&
      messages[1]?.role === 'assistant';

    // Always drop injected conversation history first when possible.
    if (canDropConversationHistoryPair()) {
      messages.splice(0, 2);
      removedHistoryMessages += 2;
    }

    let estimate = estimatePromptTokens(systemPrompt, messages, tools);
    while (estimate.promptTokens > targetTokens && messages.length >= 4) {
      // Remove oldest assistant/user pair while keeping the most recent context.
      messages.splice(0, 2);
      removedHistoryMessages += 2;
      estimate = estimatePromptTokens(systemPrompt, messages, tools);
    }

    let trimmedToolResultBlocks = 0;
    if (estimate.promptTokens > targetTokens) {
      trimmedToolResultBlocks = trimHistoricalToolResults(messages);
      estimate = estimatePromptTokens(systemPrompt, messages, tools);
    }

    return {
      removedHistoryMessages,
      trimmedToolResultBlocks,
      beforePromptTokens: beforeEstimate.promptTokens,
      afterPromptTokens: estimate.promptTokens,
      applied: removedHistoryMessages > 0 || trimmedToolResultBlocks > 0,
    };
  }

  // ── Resolve @mention nodes ─────────────────────────────────────────────────

  private async resolveMentionContext(input: RunInput): Promise<string> {
    const nodeMentions = input.mentions.filter(m => m.type === 'node');
    if (!nodeMentions.length) return '';

    const nodesApi = new NodesApi(this.execCtx.api);
    const lines: string[] = [];

    await Promise.allSettled(
      nodeMentions.map(async m => {
        try {
          const result = await nodesApi.getNode(m.id, {
            fields: ['id', 'name', 'path'],
            include: ['path'],
          });
          const e = (result as any)?.entry ?? result;
          lines.push(`${m.id}: ${e?.name ?? m.label} (path: ${e?.path?.name ?? 'unknown'})`);
        } catch {
          lines.push(`${m.id}: ${m.label}`);
        }
      })
    );

    return lines.join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private checkAborted(): void {
    if (this.signal.aborted) throw new Error('Run cancelled');
  }

  private async emitEvent(
    runId: number,
    type: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    extra?: Record<string, unknown>
  ): Promise<void> {
    await emitRunEvent(this.repository, runId, type, level, extra);
  }

  private async emitNote(runId: number, note: ProgressNote): Promise<void> {
    await emitRunEvent(
      this.repository,
      runId,
      note.type,
      'info',
      note.payload as Record<string, unknown>
    );
  }
}
