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

import { getAiSettings, listAiModels, listAiProviders } from '@/core/ipc/aiSettings';
import {
  backendRpc,
  type AgentMention,
  type AgentMentionSuggestion,
  type AgentMessage,
  type AgentRunEvent,
  type AgentRunSummary,
} from '@/core/ipc/backend';
import { useAgentStore } from '@/core/store/agent';
import { MODAL_KEYS } from '@/core/store/keys';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { useUIStore } from '@/core/store/ui';
import { writeClipboardText } from '@/core/utils/clipboard';
import { useModal } from '@/hooks/useModal';
import { useNavigation } from '@/hooks/useNavigation';
import { parseColonQuery, useQNameSuggestions } from '@/hooks/useQNameSuggestions';
import { useSearchDictionary } from '@/hooks/useSearchDictionary';
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Loader,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconCpu,
  IconCopy,
  IconPlayerStop,
  IconServer2,
  IconShield,
  IconShieldCheck,
} from '@tabler/icons-react';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentChatInput, AgentChatInputRef } from '../components/agent/AgentChatInput';
import { AgentEmptyState } from '../components/agent/AgentEmptyState';
import { mentionChipBadgeProps, mentionChipStyle } from '../components/agent/mentionChip';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);
const THREAD_AUTO_CONFIRM_ACCEPT_PATTERN = /^\s*(i accept|ik accepteer)\s*[.!]*\s*$/i;
const NODE_BROWSER_LINK_PROTOCOL = 'nodebrowser:';
const NODE_BROWSER_LINK_HOST = 'node';

const parseNodeBrowserLink = (href: string): { nodeId: string; nodeName: string | null } | null => {
  try {
    const parsed = new URL(href);
    if (
      parsed.protocol !== NODE_BROWSER_LINK_PROTOCOL ||
      parsed.hostname !== NODE_BROWSER_LINK_HOST
    ) {
      return null;
    }

    const nodeId = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').trim());
    if (!nodeId) {
      return null;
    }

    const nodeNameRaw = parsed.searchParams.get('name');
    const nodeName = nodeNameRaw && nodeNameRaw.trim() ? nodeNameRaw.trim() : null;
    return { nodeId, nodeName };
  } catch {
    return null;
  }
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeFenceLanguage = (langRaw: string | undefined): string => {
  const lang = (langRaw || '').trim().toLowerCase();
  if (!lang) return 'text';
  if (lang === 'js') return 'javascript';
  if (lang === 'ts') return 'typescript';
  if (lang === 'md') return 'markdown';
  if (lang === 'yml') return 'yaml';
  if (lang === 'sh' || lang === 'shell') return 'bash';
  if (lang === 'freemarker' || lang === 'freemarker2' || lang === 'ftl') return 'xml';
  if (lang === 'plaintext' || lang === 'plain' || lang === 'txt') return 'text';
  return lang;
};

const detectCodeLanguageFromContent = (code: string): string => {
  const sample = code.slice(0, 2000);

  if (/^\s*<!doctype html>/i.test(sample) || /<html[\s>]/i.test(sample)) {
    return 'html';
  }
  if (/^\s*<\?xml\b/i.test(sample) || /^\s*<\/?[a-zA-Z_][\w:.-]*[\s>]/m.test(sample)) {
    return 'xml';
  }

  if (/^\s*[{[]/.test(sample)) {
    try {
      JSON.parse(sample);
      return 'json';
    } catch {
      // ignore
    }
  }

  if (
    /\b(?:const|let|var|function|return|if|else|new|try|catch|throw|async|await)\b/.test(sample) ||
    /=>/.test(sample)
  ) {
    if (/\b(?:interface|type|implements|readonly|public|private|protected)\b/.test(sample)) {
      return 'typescript';
    }
    return 'javascript';
  }

  if (/\b(?:select|from|where|join|insert|update|delete|create\s+table)\b/i.test(sample)) {
    return 'sql';
  }

  if (/^\s*[-\w.]+\s*:\s*.+$/m.test(sample) && !/[;{}]/.test(sample)) {
    return 'yaml';
  }

  if (/^\s*#!\/bin\/(ba)?sh/m.test(sample) || /\b(?:echo|fi|done|esac)\b/.test(sample)) {
    return 'bash';
  }

  return 'text';
};

const highlightWithPattern = (
  code: string,
  pattern: RegExp,
  classifier: (match: RegExpExecArray) => string | null
): string => {
  const tokenInlineStyles: Record<string, string> = {
    comment: 'color: var(--agent-code-comment, #6b7280);',
    keyword: 'color: var(--agent-code-keyword, #6d28d9); font-weight: 600;',
    string: 'color: var(--agent-code-string, #047857);',
    number: 'color: var(--agent-code-number, #1d4ed8);',
    property: 'color: var(--agent-code-property, #b45309);',
    tag: 'color: var(--agent-code-tag, #be123c);',
  };

  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(code)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      parts.push(escapeHtml(code.slice(lastIndex, start)));
    }

    const tokenClass = classifier(match);
    const escaped = escapeHtml(match[0]);
    if (tokenClass) {
      const inlineStyle = tokenInlineStyles[tokenClass] || '';
      parts.push(
        `<span class="agent-code-${tokenClass}"${inlineStyle ? ` style="${inlineStyle}"` : ''}>${escaped}</span>`
      );
    } else {
      parts.push(escaped);
    }
    lastIndex = end;
  }

  if (lastIndex < code.length) {
    parts.push(escapeHtml(code.slice(lastIndex)));
  }
  return parts.join('');
};

const highlightCode = (code: string, language: string): string => {
  const lang = normalizeFenceLanguage(language);

  if (lang === 'javascript' || lang === 'typescript') {
    const pattern =
      /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(?:const|let|var|if|else|return|function|for|while|switch|case|break|continue|new|try|catch|throw|class|extends|import|from|export|default|async|await|true|false|null|undefined|typeof|instanceof)\b|\b\d+(?:\.\d+)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'string';
      if (/^\d/.test(m[0])) return 'number';
      return 'keyword';
    });
  }

  if (lang === 'json') {
    const pattern =
      /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'property';
      if (m[2]) return 'string';
      if (/^(true|false|null)$/.test(m[0])) return 'keyword';
      return 'number';
    });
  }

  if (lang === 'xml' || lang === 'html') {
    const pattern = /(<\/?[a-zA-Z][^>]*>)|("(?:\\.|[^"\\])*")/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'tag';
      if (m[2]) return 'string';
      return null;
    });
  }

  if (lang === 'yaml' || lang === 'properties' || lang === 'ini') {
    const pattern =
      /(^\s*[#;][^\n]*$)|(^\s*[a-zA-Z0-9_.-]+\s*[:=])|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b\d+(?:\.\d+)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'property';
      if (m[3]) return 'string';
      return 'number';
    });
  }

  if (lang === 'css' || lang === 'scss' || lang === 'less') {
    const pattern =
      /(\/\*[\s\S]*?\*\/)|([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*\s*(?=\{))|([a-zA-Z-]+\s*:)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b\d+(?:\.\d+)?(?:px|em|rem|%)?\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'tag';
      if (m[3]) return 'property';
      if (m[4]) return 'string';
      return 'number';
    });
  }

  if (lang === 'sql') {
    const pattern =
      /(--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(?:select|from|where|group|by|order|limit|insert|into|values|update|set|delete|create|table|alter|join|left|right|inner|outer|on|and|or|not|null|as|distinct)\b|\b\d+(?:\.\d+)?\b/gim;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'string';
      if (/^\d/.test(m[0])) return 'number';
      return 'keyword';
    });
  }

  if (lang === 'bash') {
    const pattern =
      /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?|\b(?:if|then|else|fi|for|in|do|done|case|esac|while|function|export)\b/gm;
    return highlightWithPattern(code, pattern, m => {
      if (m[1]) return 'comment';
      if (m[2]) return 'string';
      if (m[0].startsWith('$')) return 'property';
      return 'keyword';
    });
  }

  // markdown/text/csv/tsv fallback
  return escapeHtml(code);
};

const renderMarkdown = (
  md: string,
  options?: { copyLabel?: string; copiedLabel?: string }
): string => {
  const copyLabelRaw = options?.copyLabel?.trim() || 'Copy';
  const copiedLabelRaw = options?.copiedLabel?.trim() || 'Copied';
  const copyLabel = escapeHtml(copyLabelRaw);
  const copiedLabel = escapeHtml(copiedLabelRaw);

  try {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      const normalizedLang = normalizeFenceLanguage(lang);
      const effectiveLang =
        normalizedLang === 'text' ? detectCodeLanguageFromContent(text) : normalizedLang;
      const highlighted = highlightCode(text, effectiveLang);
      return [
        '<div class="agent-code-block">',
        `<button type="button" class="agent-code-copy-btn" data-agent-code-copy data-copy-label="${copyLabel}" data-copied-label="${copiedLabel}" aria-label="${copyLabel}" title="${copyLabel}">`,
        '<span class="agent-code-copy-icon" aria-hidden="true">',
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<rect x="9" y="9" width="13" height="13" rx="3" ry="3"></rect>',
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
        '</svg>',
        '</span>',
        '<span class="agent-code-copy-icon-check" aria-hidden="true">',
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M20 6 9 17l-5-5"></path>',
        '</svg>',
        '</span>',
        '</button>',
        `<pre><code class="language-${effectiveLang}">${highlighted}</code></pre>`,
        '</div>',
      ].join('');
    };
    return marked.parse(md, { async: false, breaks: true, gfm: true, renderer }) as string;
  } catch {
    return md;
  }
};

const QNAME_TOKEN_PATTERN = '[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_-]+';
const QNAME_TOKEN_REGEX = new RegExp(`^${QNAME_TOKEN_PATTERN}$`);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMessageTokenRegex(mentionLabels: string[]): RegExp {
  const mentionParts = mentionLabels.map(label => escapeRegExp(`@${label}`));
  const splitPattern = mentionParts.length
    ? `${mentionParts.join('|')}|${QNAME_TOKEN_PATTERN}`
    : QNAME_TOKEN_PATTERN;
  return new RegExp(`(${splitPattern})`, 'g');
}

function renderUserMessageContent(content: string, mentions: AgentMention[] = []) {
  if (!content) return content;

  try {
    const sortedMentions = [...mentions].sort((a, b) => b.label.length - a.label.length);
    const regex = buildMessageTokenRegex(sortedMentions.map(m => m.label));
    const mentionTokenSet = new Set(sortedMentions.map(m => `@${m.label}`));

    const parts = content.split(regex);

    return parts.map((part, index) => {
      if (mentionTokenSet.has(part) || QNAME_TOKEN_REGEX.test(part)) {
        return (
          <Badge key={index} {...mentionChipBadgeProps} style={mentionChipStyle}>
            {part}
          </Badge>
        );
      }
      return <span key={index}>{part}</span>;
    });
  } catch {
    return content;
  }
}

type ConversationTimelineItem =
  | {
      kind: 'message';
      id: number;
      createdAt: string | Date;
      message: AgentMessage;
    }
  | {
      kind: 'run';
      id: number;
      createdAt: string | Date;
      run: AgentRunSummary;
    };

interface AiProviderOption {
  value: string;
  label: string;
  defaultModel: string;
}

interface AiModelChoice {
  value: string;
  label: string;
  provider: string;
  model: string;
}

const AGENT_MODEL_SELECTION_STORAGE_KEY = 'agent.selected.model.v1';

const MODEL_SELECTION_GLOBAL_SCOPE = 'global';
const MODEL_SELECT_WIDTH = 260;
const MODEL_DROPDOWN_WIDTH = 300;
const SERVER_SELECT_WIDTH = 160;
const SERVER_DROPDOWN_WIDTH = 220;
const COMPOSER_SELECT_STYLES = {
  input: {
    border: 'none',
    background: 'transparent',
    paddingLeft: 20,
    paddingRight: 18,
    color: 'var(--mantine-color-dimmed)',
    fontSize: 13,
    fontWeight: 500,
    minHeight: 24,
    height: 24,
  },
  section: {
    pointerEvents: 'none',
  },
} as const;

const readModelSelectionStore = (): Record<string, { provider: string; model: string }> => {
  try {
    const raw = window.localStorage.getItem(AGENT_MODEL_SELECTION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const legacyProvider = (parsed as { provider?: unknown }).provider;
    const legacyModel = (parsed as { model?: unknown }).model;
    if (typeof legacyProvider === 'string' && typeof legacyModel === 'string') {
      return {
        [MODEL_SELECTION_GLOBAL_SCOPE]: {
          provider: legacyProvider,
          model: legacyModel,
        },
      };
    }

    const result: Record<string, { provider: string; model: string }> = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const provider = (value as { provider?: unknown }).provider;
      const model = (value as { model?: unknown }).model;
      if (typeof provider === 'string' && typeof model === 'string') {
        result[scope] = { provider, model };
      }
    }

    return result;
  } catch {
    return {};
  }
};

const buildModelSelectionScopes = (serverId: number | null, chatId: number | null): string[] => {
  const scopes: string[] = [];
  if (serverId !== null && chatId !== null) {
    scopes.push(`server:${serverId}:chat:${chatId}`);
  }
  if (serverId !== null) {
    scopes.push(`server:${serverId}`);
  }
  scopes.push(MODEL_SELECTION_GLOBAL_SCOPE);
  return scopes;
};

const readStoredModelSelection = (
  serverId: number | null,
  chatId: number | null
): { provider: string; model: string } | null => {
  const store = readModelSelectionStore();
  for (const scope of buildModelSelectionScopes(serverId, chatId)) {
    const match = store[scope];
    if (match) {
      return match;
    }
  }
  return null;
};

const writeStoredModelSelection = (
  serverId: number | null,
  chatId: number | null,
  provider: string,
  model: string
) => {
  try {
    const nextStore = readModelSelectionStore();

    if (serverId !== null && chatId !== null) {
      // Chat-scoped selection must stay isolated per thread.
      nextStore[`server:${serverId}:chat:${chatId}`] = { provider, model };
    } else if (serverId !== null) {
      // Fallback for pre-chat composer state on a given server.
      nextStore[`server:${serverId}`] = { provider, model };
    } else {
      nextStore[MODEL_SELECTION_GLOBAL_SCOPE] = { provider, model };
    }

    window.localStorage.setItem(AGENT_MODEL_SELECTION_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // ignore storage failures
  }
};

const RunTimer = ({ createdAt }: { createdAt: string | Date }) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const update = () => setDuration(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return <>{duration}s</>;
};

const StepDetailAccordion = ({
  label,
  color,
  detail,
}: {
  label: string;
  color?: string;
  detail: string;
}) => (
  <Accordion
    variant="default"
    chevronPosition="right"
    chevronSize={14}
    styles={{
      root: { border: 'none', width: 'fit-content' },
      item: { border: 'none' },
      control: {
        padding: '2px 0',
        minHeight: 'unset',
        width: 'fit-content',
      },
      label: { padding: 0 },
      chevron: { marginLeft: 6, margin: 0 },
      panel: { padding: '4px 0', width: '100%' },
      content: { padding: 0 },
    }}
  >
    <Accordion.Item value="detail">
      <Accordion.Control>
        <Text size="sm" c={color}>
          {label}
        </Text>
      </Accordion.Control>
      <Accordion.Panel>
        <Box
          className="agent-markdown"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(detail) }}
          style={{
            margin: 0,
            padding: '8px 10px',
            fontSize: 12,
            lineHeight: 1.5,
            borderRadius: 'var(--mantine-radius-xs)',
            backgroundColor: 'var(--mantine-color-gray-1)',
            maxHeight: 300,
            overflow: 'auto',
            width: 'calc(100vw - 80px)',
            maxWidth: 800,
          }}
        />
      </Accordion.Panel>
    </Accordion.Item>
  </Accordion>
);

interface RunActivityItem {
  kind: 'note' | 'execution';
  label: string;
  detail: string | null;
  level: 'info' | 'warn' | 'error';
  operation?: string;
}

const humanizeOperation = (operation: string): string =>
  operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

const EXECUTION_EVENT_KEYS: Record<string, string> = {
  'step.completed': 'stepCompleted',
  'step.failed': 'stepFailed',
  'step.waiting_confirmation': 'stepAwaitingConfirmation',
  'step.confirmed': 'stepConfirmed',
  'step.rejected': 'stepRejected',
  'run.failed': 'stepFailed',
};

const SKIP_EVENT_TYPES = new Set([
  'run.queued',
  'run.executing',
  'run.summarizing',
  'run.completed',
  'run.cancelled',
  'run.context',
]);
const MAX_EVENT_DETAIL_CHARS = 12_000;

interface ContextWindowSnapshot {
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

interface ContextWindowDisplayState {
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

const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

const resolveContextWindowFromModel = (
  model: string | null | undefined
): { tokens: number; source: 'known' | 'default' } => {
  const normalized = (model || '').toLowerCase();
  if (normalized.includes('claude')) {
    return { tokens: 200_000, source: 'known' };
  }
  return { tokens: DEFAULT_CONTEXT_WINDOW_TOKENS, source: 'default' };
};

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const buildContextWindowSnapshot = (
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

const buildRunActivity = (events: AgentRunEvent[]): RunActivityItem[] => {
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

export function AgentPage() {
  const { t } = useTranslation('agent');
  const { activePage, activeServerId, navigate } = useNavigation();
  const { open: openSettings, isOpen: isSettingsOpen } = useModal(MODAL_KEYS.SETTINGS);
  const servers = useServersStore(state => state.servers);
  const appLanguage = useUIStore(state => state.language);
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);

  const chats = useAgentStore(state => state.chats);
  const activeChatId = useAgentStore(state => state.activeChatId);
  const autoConfirmByChat = useAgentStore(state => state.autoConfirmByChat);
  const messagesByChat = useAgentStore(state => state.messagesByChat);
  const runsByChat = useAgentStore(state => state.runsByChat);
  const eventsByRun = useAgentStore(state => state.eventsByRun);
  const setChats = useAgentStore(state => state.setChats);
  const setMessages = useAgentStore(state => state.setMessages);
  const addMessage = useAgentStore(state => state.addMessage);
  const setRuns = useAgentStore(state => state.setRuns);
  const upsertRun = useAgentStore(state => state.upsertRun);
  const appendRunEvents = useAgentStore(state => state.appendRunEvents);
  const upsertChat = useAgentStore(state => state.upsertChat);
  const setActiveChatId = useAgentStore(state => state.setActiveChatId);
  const setChatAutoConfirm = useAgentStore(state => state.setChatAutoConfirm);

  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [composerServerId, setComposerServerId] = useState<number | null>(
    () => servers[0]?.id ?? null
  );

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionQuerySession, setMentionQuerySession] = useState(0);
  const mentionDebounceInput = useMemo(
    () => ({ query: mentionQuery, session: mentionQuerySession }),
    [mentionQuery, mentionQuerySession]
  );
  const [debouncedMentionInput] = useDebouncedValue(mentionDebounceInput, 300);
  const [mentionItems, setMentionItems] = useState<AgentMentionSuggestion[]>([]);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);

  const [aiModelOptions, setAiModelOptions] = useState<AiModelChoice[]>([]);
  const [selectedAiModelOption, setSelectedAiModelOption] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [defaultAiSelection, setDefaultAiSelection] = useState<{
    provider: string | null;
    model: string | null;
  }>({
    provider: null,
    model: null,
  });
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiConfigInitialized, setAiConfigInitialized] = useState(false);
  const canSendMessages = Boolean(
    aiAssistantEnabled && aiProvider && aiModel && aiModelOptions.length > 0
  );
  const aiSelectionResolved =
    !aiAssistantEnabled || aiModelOptions.length === 0 || Boolean(aiProvider && aiModel);
  const showAiUnavailableState = aiConfigInitialized && aiSelectionResolved && !canSendMessages;

  const chatInputRef = useRef<AgentChatInputRef>(null);
  const conversationViewportRef = useRef<HTMLDivElement | null>(null);
  const loadChatsRequestIdRef = useRef(0);
  const mentionRequestIdRef = useRef(0);
  const mentionSkipCountRef = useRef(0);
  const mentionActiveQueryRef = useRef('');
  const mentionHasMoreRef = useRef(false);
  const mentionLoadingRef = useRef(false);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) || null,
    [chats, activeChatId]
  );
  const composerServerOptions = useMemo(
    () =>
      servers.map(server => ({
        value: String(server.id),
        label: server.label ? `${server.name} (${server.label})` : server.name,
      })),
    [servers]
  );
  const modelSelectionServerId = activeChat?.serverId || activeServerId || composerServerId || null;

  const [qnameQuery, setQnameQuery] = useState<string | null>(null);
  const [qnamePropertiesByPrefix, setQNamePropertiesByPrefix] = useState<Record<string, string[]>>(
    {}
  );
  const qnamePropertiesInFlightRef = useRef<Set<string>>(new Set());
  const qnamePropertiesFetchedRef = useRef<Set<string>>(new Set());

  // Load the search dictionary for the active server
  const dictionaryServerId = activeChat?.serverId || activeServerId || servers[0]?.id || null;
  const dictionaryServer = useMemo(
    () => (dictionaryServerId ? servers.find(server => server.id === dictionaryServerId) || null : null),
    [dictionaryServerId, servers]
  );
  const { dictionary } = useSearchDictionary(dictionaryServerId);
  const qnameSuggestionDictionary = useMemo(() => {
    const mergedProperties = [...dictionary.properties];
    const seen = new Set(dictionary.properties.map(property => property.toLowerCase()));

    for (const values of Object.values(qnamePropertiesByPrefix)) {
      for (const property of values) {
        const key = property.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        mergedProperties.push(property);
      }
    }

    return {
      ...dictionary,
      properties: mergedProperties,
    };
  }, [dictionary, qnamePropertiesByPrefix]);
  const qnameSuggestions = useQNameSuggestions(qnameSuggestionDictionary, qnameQuery);

  useEffect(() => {
    setQNamePropertiesByPrefix({});
    qnamePropertiesInFlightRef.current.clear();
    qnamePropertiesFetchedRef.current.clear();
  }, [dictionaryServerId, dictionaryServer?.baseUrl]);

  useEffect(() => {
    if (!qnameQuery || !dictionaryServerId || !dictionaryServer?.baseUrl) {
      return;
    }

    const parsed = parseColonQuery(qnameQuery);
    if (!parsed) {
      return;
    }

    const prefix = parsed.prefix.toLowerCase();
    const hasDictionaryProperties = dictionary.properties.some(property =>
      property.toLowerCase().startsWith(prefix)
    );
    if (hasDictionaryProperties) {
      return;
    }
    if (
      qnamePropertiesFetchedRef.current.has(prefix) ||
      qnamePropertiesInFlightRef.current.has(prefix)
    ) {
      return;
    }

    let cancelled = false;
    qnamePropertiesInFlightRef.current.add(prefix);

    backendRpc.alfresco.search
      .propertiesByPrefix(dictionaryServerId, dictionaryServer.baseUrl, prefix)
      .then(properties => {
        if (cancelled) {
          return;
        }
        qnamePropertiesFetchedRef.current.add(prefix);
        setQNamePropertiesByPrefix(prev => ({ ...prev, [prefix]: properties }));
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load QName properties', error);
      })
      .finally(() => {
        qnamePropertiesInFlightRef.current.delete(prefix);
      });

    return () => {
      cancelled = true;
    };
  }, [qnameQuery, dictionaryServerId, dictionaryServer?.baseUrl, dictionary.properties]);

  const activeMessages = useMemo(
    () => (activeChatId ? messagesByChat[activeChatId] || [] : []),
    [messagesByChat, activeChatId]
  );

  const activeRuns = useMemo(
    () => (activeChatId ? runsByChat[activeChatId] || [] : []),
    [runsByChat, activeChatId]
  );

  const pendingConfirmation = useMemo(
    () => activeRuns.find(run => run.status === 'waiting_confirmation' && run.pendingStep),
    [activeRuns]
  );
  const autoConfirmForActiveChat = useMemo(
    () => (activeChatId ? Boolean(autoConfirmByChat[activeChatId]) : false),
    [activeChatId, autoConfirmByChat]
  );

  const thinkingRunIds = useMemo(
    () =>
      activeRuns
        .filter(run => run.status === 'queued' || run.status === 'running')
        .map(run => run.id),
    [activeRuns]
  );

  const conversationTimeline = useMemo<ConversationTimelineItem[]>(() => {
    const sortedMessages = activeMessages
      .map(message => ({
        kind: 'message' as const,
        id: message.id,
        createdAt: message.createdAt,
        message,
      }))
      .sort((left, right) => {
        const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return left.id - right.id;
      });

    const messageIds = new Set(sortedMessages.map(item => item.message.id));
    const runsByTriggerMessage = new Map<number, AgentRunSummary[]>();
    const orphanRuns: AgentRunSummary[] = [];

    for (const run of activeRuns) {
      if (run.triggerMessageId && messageIds.has(run.triggerMessageId)) {
        const current = runsByTriggerMessage.get(run.triggerMessageId) || [];
        current.push(run);
        runsByTriggerMessage.set(run.triggerMessageId, current);
      } else {
        orphanRuns.push(run);
      }
    }

    for (const [triggerMessageId, runs] of runsByTriggerMessage) {
      runsByTriggerMessage.set(
        triggerMessageId,
        [...runs].sort((left, right) => {
          const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
          if (timeDiff !== 0) {
            return timeDiff;
          }
          return left.id - right.id;
        })
      );
    }

    const timeline: ConversationTimelineItem[] = [];
    for (const messageItem of sortedMessages) {
      timeline.push(messageItem);
      const runsForMessage = runsByTriggerMessage.get(messageItem.message.id) || [];
      for (const run of runsForMessage) {
        timeline.push({
          kind: 'run',
          id: run.id,
          createdAt: run.createdAt,
          run,
        });
      }
    }

    const sortedOrphans = [...orphanRuns].sort((left, right) => {
      const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return left.id - right.id;
    });

    for (const run of sortedOrphans) {
      timeline.push({
        kind: 'run',
        id: run.id,
        createdAt: run.createdAt,
        run,
      });
    }

    return timeline.slice(-500);
  }, [activeMessages, activeRuns]);

  const totalRunEventCount = useMemo(
    () => activeRuns.reduce((sum, run) => sum + (eventsByRun[run.id]?.length || 0), 0),
    [activeRuns, eventsByRun]
  );

  const latestContextWindowSnapshot = useMemo<ContextWindowSnapshot | null>(() => {
    let latest: ContextWindowSnapshot | null = null;

    for (const run of activeRuns) {
      const events = eventsByRun[run.id] || [];
      for (const event of events) {
        const snapshot = buildContextWindowSnapshot(event, run.id);
        if (!snapshot) {
          continue;
        }
        if (!latest || snapshot.eventId > latest.eventId) {
          latest = snapshot;
        }
      }
    }

    return latest;
  }, [activeRuns, eventsByRun]);

  const contextWindowDisplay = useMemo<ContextWindowDisplayState>(() => {
    if (latestContextWindowSnapshot) {
      return {
        provider: latestContextWindowSnapshot.provider,
        model: latestContextWindowSnapshot.model,
        source: latestContextWindowSnapshot.contextWindowSource,
        usedTokens: latestContextWindowSnapshot.totalTokens,
        totalTokens: latestContextWindowSnapshot.contextWindowTokens,
        promptTokens: latestContextWindowSnapshot.promptTokens,
        outputTokens: latestContextWindowSnapshot.outputTokens,
        percentage: latestContextWindowSnapshot.utilizationPctTotal,
        nearLimit: latestContextWindowSnapshot.nearLimit,
        criticalLimit: latestContextWindowSnapshot.criticalLimit,
        removedHistoryMessages: latestContextWindowSnapshot.removedHistoryMessages,
        trimmedToolResultBlocks: latestContextWindowSnapshot.trimmedToolResultBlocks,
      };
    }

    const modelInfo = resolveContextWindowFromModel(aiModel);
    return {
      provider: aiProvider,
      model: aiModel,
      source: modelInfo.source,
      usedTokens: 0,
      totalTokens: modelInfo.tokens,
      promptTokens: 0,
      outputTokens: 0,
      percentage: 0,
      nearLimit: false,
      criticalLimit: false,
      removedHistoryMessages: 0,
      trimmedToolResultBlocks: 0,
    };
  }, [latestContextWindowSnapshot, aiModel, aiProvider]);

  const loadChats = useCallback(async () => {
    const requestId = ++loadChatsRequestIdRef.current;

    try {
      const result = await backendRpc.agent.listChats({
        serverId: activeServerId || undefined,
        skipCount: 0,
        maxItems: 100,
      });

      if (requestId !== loadChatsRequestIdRef.current) {
        return;
      }

      setChats(result.items);
    } catch (error) {
      if (requestId !== loadChatsRequestIdRef.current) {
        return;
      }

      notifications.show({
        title: t('errors.loadChatsTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  }, [activeServerId, setChats, t]);

  const loadConversation = useCallback(
    async (chatId: number) => {
      setLoadingConversation(true);
      try {
        const [messages, runsPage] = await Promise.all([
          backendRpc.agent.listMessages({ chatId, maxItems: 200 }),
          backendRpc.agent.listRuns({ chatId, maxItems: 100, skipCount: 0 }),
        ]);

        setMessages(chatId, messages);
        setRuns(chatId, runsPage.items);

        await Promise.all(
          runsPage.items.map(async run => {
            const events = await backendRpc.agent.listRunEvents({ runId: run.id, maxItems: 200 });
            appendRunEvents(run.id, events);
          })
        );
      } catch (error) {
        notifications.show({
          title: t('errors.loadConversationTitle'),
          message: error instanceof Error ? error.message : t('errors.generic'),
          color: 'red',
        });
      } finally {
        setLoadingConversation(false);
      }
    },
    [appendRunEvents, setMessages, setRuns, t]
  );

  const pollActiveChat = useCallback(async () => {
    const chatId = useAgentStore.getState().activeChatId;
    if (!chatId) {
      return;
    }

    try {
      const existingMessages = useAgentStore.getState().messagesByChat[chatId] || [];
      const lastMessageId = existingMessages.length
        ? existingMessages[existingMessages.length - 1].id
        : undefined;

      const [messages, runsPage] = await Promise.all([
        backendRpc.agent.listMessages({ chatId, maxItems: 200 }),
        backendRpc.agent.listRuns({ chatId, maxItems: 100, skipCount: 0 }),
      ]);

      useAgentStore.getState().setMessages(chatId, messages);
      useAgentStore.getState().setRuns(chatId, runsPage.items);

      const activeRuns = runsPage.items.filter(run => ACTIVE_RUN_STATUSES.has(run.status));
      for (const run of activeRuns) {
        const existingEvents = useAgentStore.getState().eventsByRun[run.id] || [];
        const afterId = existingEvents.length
          ? existingEvents[existingEvents.length - 1].id
          : undefined;
        const events = await backendRpc.agent.listRunEvents({
          runId: run.id,
          afterId,
          maxItems: 200,
        });
        useAgentStore.getState().appendRunEvents(run.id, events);
      }

      const newMessages = messages.filter(m => lastMessageId && m.id > lastMessageId);
      const hasNewAssistantMessage = newMessages.some(m => m.role === 'assistant');
      const stillHasActiveRuns = activeRuns.length > 0;

      if (hasNewAssistantMessage && !stillHasActiveRuns) {
        for (const run of runsPage.items) {
          const existingEvents = useAgentStore.getState().eventsByRun[run.id] || [];
          const afterId = existingEvents.length
            ? existingEvents[existingEvents.length - 1].id
            : undefined;
          const events = await backendRpc.agent.listRunEvents({
            runId: run.id,
            afterId,
            maxItems: 200,
          });
          useAgentStore.getState().appendRunEvents(run.id, events);
        }
      }
    } catch {
      // polling should not spam notifications
    }
  }, []);

  const resetMentionSuggestions = useCallback(() => {
    mentionRequestIdRef.current += 1;
    mentionSkipCountRef.current = 0;
    mentionActiveQueryRef.current = '';
    mentionHasMoreRef.current = false;
    mentionLoadingRef.current = false;
    setMentionItems([]);
    setMentionHasMore(false);
    setMentionLoading(false);
  }, []);

  const loadMentions = useCallback(
    async (query: string, reset: boolean) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        resetMentionSuggestions();
        return;
      }

      const serverId = activeChat?.serverId || activeServerId || servers[0]?.id;
      if (!serverId) {
        resetMentionSuggestions();
        return;
      }

      if (reset) {
        mentionActiveQueryRef.current = normalizedQuery;
        mentionSkipCountRef.current = 0;
        mentionHasMoreRef.current = true;
      } else {
        if (normalizedQuery !== mentionActiveQueryRef.current) {
          return;
        }
        if (!mentionHasMoreRef.current || mentionLoadingRef.current) {
          return;
        }
      }

      const skipCount = mentionSkipCountRef.current;
      const requestId = ++mentionRequestIdRef.current;
      mentionLoadingRef.current = true;
      setMentionLoading(true);

      try {
        const result = await backendRpc.agent.searchMentions({
          serverId,
          query: normalizedQuery,
          skipCount,
          maxItems: 10,
        });

        if (requestId !== mentionRequestIdRef.current) {
          return;
        }
        if (normalizedQuery !== mentionActiveQueryRef.current) {
          return;
        }

        setMentionItems(prev => (reset ? result.items : [...prev, ...result.items]));
        mentionSkipCountRef.current = skipCount + result.items.length;
        mentionHasMoreRef.current = result.pagination.hasMoreItems;
        setMentionHasMore(result.pagination.hasMoreItems);
      } finally {
        if (requestId === mentionRequestIdRef.current) {
          mentionLoadingRef.current = false;
          setMentionLoading(false);
        }
      }
    },
    [activeChat?.serverId, activeServerId, resetMentionSuggestions, servers]
  );

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (isSettingsOpen) {
      return;
    }

    let cancelled = false;

    const loadAiOptions = async () => {
      setAiModelsLoading(true);
      try {
        const [providerCatalog, currentSettings] = await Promise.all([
          listAiProviders(),
          getAiSettings(),
        ]);

        if (cancelled) {
          return;
        }

        setAiAssistantEnabled(Boolean(currentSettings.enabled));

        const configuredProviders: AiProviderOption[] = (providerCatalog.providers || [])
          .filter(provider => provider.hasToken)
          .map(provider => ({
            value: provider.id,
            label: provider.label,
            defaultModel: provider.defaultModel,
          }));

        if (!configuredProviders.length) {
          setAiModelOptions([]);
          setSelectedAiModelOption(null);
          setAiProvider(null);
          setAiModel(null);
          return;
        }

        const optionGroups = await Promise.all(
          configuredProviders.map(async provider => {
            const remote = await listAiModels({ provider: provider.value }).catch(() => null);
            const models = remote?.models?.length
              ? remote.models
              : [{ id: provider.defaultModel, displayName: provider.defaultModel }];
            return models.map(model => ({
              value: `${provider.value}::${model.id}`,
              label: `${provider.label} · ${model.displayName || model.id}`,
              provider: provider.value,
              model: model.id,
            }));
          })
        );

        if (cancelled) {
          return;
        }

        const options = optionGroups.flat();
        setAiModelOptions(options);
        setDefaultAiSelection({
          provider: currentSettings.provider ?? null,
          model: currentSettings.model ?? null,
        });

        if (!options.length) {
          setSelectedAiModelOption(null);
          setAiProvider(null);
          setAiModel(null);
          return;
        }
      } catch {
        // keep composer functional without model selector data
      } finally {
        if (!cancelled) {
          setAiModelsLoading(false);
          setAiConfigInitialized(true);
        }
      }
    };

    void loadAiOptions();

    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!aiModelOptions.length) {
      return;
    }

    const stored = readStoredModelSelection(modelSelectionServerId, activeChatId);
    const storedValue = stored ? `${stored.provider}::${stored.model}` : null;
    const configuredValue =
      defaultAiSelection.provider && defaultAiSelection.model
        ? `${defaultAiSelection.provider}::${defaultAiSelection.model}`
        : null;

    const selectedValue =
      [storedValue, configuredValue, aiModelOptions[0].value].find(value =>
        Boolean(value && aiModelOptions.some(option => option.value === value))
      ) || aiModelOptions[0].value;
    const selected =
      aiModelOptions.find(option => option.value === selectedValue) || aiModelOptions[0];

    setSelectedAiModelOption(selected.value);
    setAiProvider(selected.provider);
    setAiModel(selected.model);
  }, [
    aiModelOptions,
    activeChatId,
    modelSelectionServerId,
    defaultAiSelection.provider,
    defaultAiSelection.model,
  ]);

  useEffect(() => {
    setDraft('');
    setMentionQuery(null);
    resetMentionSuggestions();
  }, [activeChatId, resetMentionSuggestions]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    void loadConversation(activeChatId);
  }, [activeChatId, loadConversation]);

  useEffect(() => {
    if (
      activePage !== 'agentPage' ||
      pendingConfirmation?.pendingStep ||
      sending ||
      !canSendMessages
    ) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;
    let timeout: number | null = null;

    const tryFocus = () => {
      if (cancelled) {
        return;
      }

      chatInputRef.current?.focus();

      const activeElement = document.activeElement as HTMLElement | null;
      const isFocusedInComposer = Boolean(activeElement?.closest('.agent-chat-input .ProseMirror'));
      if (isFocusedInComposer || attempts >= maxAttempts) {
        return;
      }

      attempts += 1;
      timeout = window.setTimeout(tryFocus, 30);
    };

    timeout = window.setTimeout(tryFocus, 0);

    return () => {
      cancelled = true;
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [activePage, activeChatId, pendingConfirmation?.pendingStep, sending, canSendMessages]);

  const hasActiveRuns = activeRuns.some(run => ACTIVE_RUN_STATUSES.has(run.status));
  const [recentlySentMessage, setRecentlySentMessage] = useState(false);
  const tokenFormatter = useMemo(() => new Intl.NumberFormat(), []);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    const shouldPoll = hasActiveRuns || recentlySentMessage;
    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      void pollActiveChat();
    }, 1500);

    return () => clearInterval(interval);
  }, [activeChatId, hasActiveRuns, recentlySentMessage, pollActiveChat]);

  useEffect(() => {
    if (!recentlySentMessage) {
      return;
    }

    if (hasActiveRuns) {
      setRecentlySentMessage(false);
      return;
    }

    const timeout = setTimeout(() => setRecentlySentMessage(false), 10000);
    return () => clearTimeout(timeout);
  }, [recentlySentMessage, hasActiveRuns]);

  useEffect(() => {
    const normalizedQuery = (mentionQuery || '').trim();
    if (!normalizedQuery) {
      setMentionQuerySession(current => current + 1);
      resetMentionSuggestions();
      return;
    }

    mentionRequestIdRef.current += 1;
    mentionActiveQueryRef.current = normalizedQuery;
    mentionSkipCountRef.current = 0;
    mentionHasMoreRef.current = true;
    mentionLoadingRef.current = true;
    setMentionItems([]);
    setMentionHasMore(false);
    setMentionLoading(true);
  }, [mentionQuery, resetMentionSuggestions]);

  useEffect(() => {
    const normalizedQuery = (debouncedMentionInput.query || '').trim();
    if (!normalizedQuery) {
      return;
    }

    void loadMentions(normalizedQuery, true);
  }, [debouncedMentionInput.query, debouncedMentionInput.session, loadMentions]);

  useEffect(() => {
    const viewport = conversationViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [activeChatId, conversationTimeline.length, totalRunEventCount, thinkingRunIds.length]);

  useEffect(() => {
    if (activeServerId !== null || activeChatId !== null) {
      return;
    }

    if (servers.length === 0) {
      if (composerServerId !== null) {
        setComposerServerId(null);
      }
      return;
    }

    if (composerServerId === null || !servers.some(server => server.id === composerServerId)) {
      setComposerServerId(servers[0].id);
      return;
    }
  }, [activeServerId, activeChatId, composerServerId, servers]);

  const handleSend = async (text: string, mentions: AgentMention[]) => {
    if (!text.trim()) {
      return;
    }
    if (!canSendMessages) {
      notifications.show({
        title: t('errors.sendMessageTitle'),
        message: t('errors.aiNotConfiguredMessage'),
        color: 'red',
      });
      return;
    }

    setSending(true);
    try {
      let chatId = activeChatId ?? useAgentStore.getState().activeChatId;

      // Create chat on first message if no chat exists yet
      if (!chatId) {
        const serverId = activeServerId || composerServerId || servers[0]?.id;
        if (!serverId) {
          notifications.show({
            title: t('errors.sendMessageTitle'),
            message: t('errors.serverRequiredMessage'),
            color: 'red',
          });
          return;
        }

        const chat = await backendRpc.agent.createChat({ serverId });
        upsertChat(chat);
        setActiveChatId(chat.id);
        chatId = chat.id;

        // Preserve the currently selected model as this chat's explicit model.
        if (aiProvider && aiModel) {
          writeStoredModelSelection(serverId, chat.id, aiProvider, aiModel);
        }

        void loadChats();
      }

      const isThreadAutoConfirmCommand = THREAD_AUTO_CONFIRM_ACCEPT_PATTERN.test(text.trim());
      const enableAutoConfirmForThisSend =
        Boolean(autoConfirmByChat[chatId]) || isThreadAutoConfirmCommand;

      if (isThreadAutoConfirmCommand) {
        setChatAutoConfirm(chatId, true);
      }

      const response = await backendRpc.agent.sendMessage({
        chatId,
        content: text.trim(),
        mentions: mentions,
        aiProvider: aiProvider || undefined,
        aiModel: aiModel || undefined,
        appLanguage: appLanguage || undefined,
        autoApproveConfirmations: enableAutoConfirmForThisSend,
      });

      addMessage(chatId, response.message);
      upsertRun(chatId, response.run);

      setDraft('');
      setMentionQuery(null);
      resetMentionSuggestions();
      setRecentlySentMessage(true);

      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.sendMessageTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    } finally {
      setSending(false);
    }
  };

  const handleCancelRun = async (runId: number) => {
    try {
      await backendRpc.agent.cancelRun(runId);
      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.cancelRunTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  const toggleAutoConfirmForActiveChat = useCallback(() => {
    if (!activeChatId) {
      return;
    }

    const nextEnabled = !autoConfirmForActiveChat;
    setChatAutoConfirm(activeChatId, nextEnabled);

    void backendRpc.agent
      .setChatAutoApproveConfirmations({
        chatId: activeChatId,
        enabled: nextEnabled,
      })
      .catch(error => {
        setChatAutoConfirm(activeChatId, autoConfirmForActiveChat);
        notifications.show({
          title: t('errors.confirmationTitle'),
          message: error instanceof Error ? error.message : t('errors.generic'),
          color: 'red',
        });
      });
  }, [activeChatId, autoConfirmForActiveChat, setChatAutoConfirm, t]);

  const handleConfirmPendingStep = async (
    approved: boolean,
    options?: { enableForChat?: boolean }
  ) => {
    if (!pendingConfirmation?.pendingStep) {
      return;
    }

    try {
      await backendRpc.agent.confirmStep({
        runId: pendingConfirmation.id,
        stepId: pendingConfirmation.pendingStep.id,
        confirmationToken: pendingConfirmation.pendingStep.confirmationToken || '',
        approved,
        enableAutoApproveConfirmations: Boolean(approved && options?.enableForChat),
      });

      if (approved && options?.enableForChat && activeChatId) {
        setChatAutoConfirm(activeChatId, true);
        await backendRpc.agent.setChatAutoApproveConfirmations({
          chatId: activeChatId,
          enabled: true,
        });
      }

      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.confirmationTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  const handleAgentMarkdownClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const copyButton = target.closest('[data-agent-code-copy]');
      if (copyButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();

        const codeElement = copyButton.closest('.agent-code-block')?.querySelector('pre > code');
        const code = codeElement?.textContent ?? '';
        if (!code.trim()) {
          return;
        }

        void (async () => {
          const copied = await writeClipboardText(code);
          if (!copied) {
            notifications.show({
              title: t('errors.generic'),
              message: t('errors.generic'),
              color: 'red',
            });
            return;
          }

          const copyLabel = copyButton.getAttribute('data-copy-label') || 'Copy';
          const copiedLabel = copyButton.getAttribute('data-copied-label') || 'Copied';
          copyButton.dataset.copied = 'true';
          copyButton.setAttribute('aria-label', copiedLabel);
          copyButton.setAttribute('title', copiedLabel);

          window.setTimeout(() => {
            if (!copyButton.isConnected) {
              return;
            }
            copyButton.removeAttribute('data-copied');
            copyButton.setAttribute('aria-label', copyLabel);
            copyButton.setAttribute('title', copyLabel);
          }, 1800);
        })();
        return;
      }

      const anchor = target.closest('a');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const link =
        parseNodeBrowserLink(anchor.getAttribute('href') || '') ||
        parseNodeBrowserLink(anchor.href);
      if (!link) {
        return;
      }

      event.preventDefault();

      const serverId = activeChat?.serverId || activeServerId;
      if (!serverId) {
        notifications.show({
          title: t('errors.generic'),
          message: t('errors.serverRequiredMessage'),
          color: 'red',
        });
        return;
      }

      const fallbackName = anchor.textContent?.trim() || null;
      openNodeTab({
        nodeId: link.nodeId,
        nodeName: link.nodeName || fallbackName || link.nodeId,
        serverId,
      });
      navigate('node-browser');
    },
    [activeChat?.serverId, activeServerId, navigate, openNodeTab, t]
  );

  return (
    <Box
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--mantine-spacing-md)',
      }}
    >
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr) auto',
          rowGap: 'var(--mantine-spacing-sm)',
        }}
      >
        <Box
          ref={conversationViewportRef}
          onClick={handleAgentMarkdownClick}
          style={{
            minHeight: 0,
            height: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Stack
            gap="xs"
            pr="sm"
            style={{
              marginTop: conversationTimeline.length === 0 ? 0 : 'auto',
              flex: conversationTimeline.length === 0 ? 1 : undefined,
            }}
          >
            {loadingConversation && (
              <Group justify="center" py={2}>
                <Loader size="xs" />
              </Group>
            )}

            {conversationTimeline.length === 0 ? (
              <AgentEmptyState
                chatId={activeChat?.id}
                aiUnavailable={showAiUnavailableState}
                noServerSelected={
                  activeServerId === null && activeChatId === null && servers.length > 0
                }
                onOpenSettings={openSettings}
              />
            ) : (
              <>
                {conversationTimeline.map(item => {
                  if (item.kind === 'run') {
                    const run = item.run;
                    const runEvents = (eventsByRun[run.id] || [])
                      .slice()
                      .sort((a, b) => a.id - b.id);
                    const isActive = ACTIVE_RUN_STATUSES.has(run.status);
                    const activity = buildRunActivity(runEvents);

                    return (
                      <Box key={`timeline-run-${run.id}`} py={2}>
                        <Stack gap="xs">
                          {activity.map((step, idx) => {
                            if (step.kind === 'note') {
                              return (
                                <Box
                                  key={idx}
                                  className="agent-markdown"
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdown(step.label, {
                                      copyLabel: t('copy'),
                                      copiedLabel: t('copied'),
                                    }),
                                  }}
                                  style={{ fontSize: 14, lineHeight: 1.6 }}
                                />
                              );
                            }

                            if (step.kind === 'execution' && step.detail) {
                              const translatedLabel = step.label.startsWith('__i18n:')
                                ? t(step.label.replace('__i18n:', ''))
                                : step.label;

                              return (
                                <StepDetailAccordion
                                  key={idx}
                                  label={translatedLabel}
                                  color={
                                    step.level === 'error' ? 'red' : 'var(--mantine-color-text)'
                                  }
                                  detail={step.detail}
                                />
                              );
                            }

                            if (step.level === 'error') {
                              const translatedLabel = step.label.startsWith('__i18n:')
                                ? t(step.label.replace('__i18n:', ''))
                                : step.label;

                              if (step.detail) {
                                return (
                                  <StepDetailAccordion
                                    key={idx}
                                    label={translatedLabel}
                                    color="red"
                                    detail={step.detail}
                                  />
                                );
                              }

                              return (
                                <Text key={idx} size="sm" c="red">
                                  {translatedLabel}
                                </Text>
                              );
                            }

                            return (
                              <Text key={idx} size="xs" c="dimmed">
                                {step.label.startsWith('__i18n:')
                                  ? t(step.label.replace('__i18n:', ''))
                                  : step.label}
                              </Text>
                            );
                          })}

                          {isActive && (
                            <Group gap="xs" py={2}>
                              <Loader size={14} />
                              <Text size="xs" c="dimmed">
                                {t('thinking')} (
                                <RunTimer createdAt={run.createdAt} />)
                              </Text>
                            </Group>
                          )}
                        </Stack>
                      </Box>
                    );
                  }

                  const { message } = item;

                  if (message.role === 'assistant') {
                    return (
                      <Box
                        key={`message-${message.id}`}
                        className="agent-message-group"
                        style={{ position: 'relative' }}
                        mb={32}
                      >
                        <Box
                          py={2}
                          className="agent-markdown"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(message.content, {
                              copyLabel: t('copy'),
                              copiedLabel: t('copied'),
                            }),
                          }}
                          style={{ fontSize: 14, lineHeight: 1.6 }}
                        />
                        <Box
                          className="agent-message-copy-btn"
                          style={{
                            position: 'absolute',
                            bottom: -24,
                            right: 0,
                            opacity: 0,
                            transition: 'opacity 0.2s',
                          }}
                        >
                          <CopyButton value={message.content} timeout={2000}>
                            {({ copied, copy }) => (
                              <Tooltip
                                label={copied ? t('copied') : t('copy')}
                                withArrow
                                position="top"
                              >
                                <ActionIcon
                                  color={copied ? 'teal' : 'gray'}
                                  variant="subtle"
                                  onClick={copy}
                                  size="sm"
                                >
                                  {copied ? (
                                    <IconCheck style={{ width: 14 }} />
                                  ) : (
                                    <IconCopy style={{ width: 14 }} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </Box>
                      </Box>
                    );
                  }

                  return (
                    <Group
                      key={`message-${message.id}`}
                      justify="flex-end"
                      className="agent-message-group"
                      style={{ position: 'relative' }}
                      mb={32}
                    >
                      <Paper
                        p="sm"
                        withBorder={false}
                        shadow="none"
                        style={{
                          maxWidth: '72%',
                          width: 'fit-content',
                          backgroundColor: 'var(--mantine-color-gray-light)',
                        }}
                      >
                        <Text
                          component="div"
                          size="sm"
                          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                        >
                          {renderUserMessageContent(message.content, message.mentions)}
                        </Text>
                      </Paper>

                      <Box
                        className="agent-message-copy-btn"
                        style={{
                          position: 'absolute',
                          bottom: -28,
                          right: 0,
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          zIndex: 10,
                        }}
                      >
                        <CopyButton value={message.content} timeout={2000}>
                          {({ copied, copy }) => (
                            <Tooltip
                              label={copied ? t('copied') : t('copy')}
                              withArrow
                              position="top"
                            >
                              <ActionIcon
                                color={copied ? 'teal' : 'gray'}
                                variant="subtle"
                                onClick={copy}
                                size="sm"
                              >
                                {copied ? (
                                  <IconCheck style={{ width: 14 }} />
                                ) : (
                                  <IconCopy style={{ width: 14 }} />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </CopyButton>
                      </Box>
                    </Group>
                  );
                })}
              </>
            )}
          </Stack>
        </Box>

        <Stack
          gap="xs"
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--mantine-color-body)',
            paddingTop: 'var(--mantine-spacing-xs)',
          }}
        >
          {pendingConfirmation?.pendingStep ? (
            <Paper withBorder p="md" radius="md">
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  {t('confirmationRequired')}
                </Text>
                <Text size="sm" c="dimmed">
                  {pendingConfirmation.pendingStep.summary || t('confirmationDescription')}
                </Text>
                <Group gap="xs" justify="flex-end">
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => void handleConfirmPendingStep(false)}
                  >
                    {t('reject')}
                  </Button>
                  <Button
                    size="xs"
                    color="green"
                    onClick={() => void handleConfirmPendingStep(true)}
                  >
                    {t('confirm')}
                  </Button>
                  {activeChatId && !autoConfirmForActiveChat ? (
                    <Button
                      size="xs"
                      color="blue"
                      onClick={() => void handleConfirmPendingStep(true, { enableForChat: true })}
                    >
                      {t('confirmForChat')}
                    </Button>
                  ) : null}
                </Group>
                {activeChatId && autoConfirmForActiveChat ? (
                  <Text size="xs" c="dimmed">
                    {t('autoConfirmActive')}
                  </Text>
                ) : null}
              </Stack>
            </Paper>
          ) : (
            <>
              <Box style={{ position: 'relative' }}>
                <Paper withBorder p="sm" radius="md">
                  <AgentChatInput
                    ref={chatInputRef}
                    value={draft}
                    onChange={setDraft}
                    onSend={handleSend}
                    disabled={sending || !canSendMessages}
                    onMentionQueryChange={setMentionQuery}
                    mentionItems={mentionItems}
                    mentionHasMore={mentionHasMore}
                    mentionLoading={mentionLoading}
                    onLoadMoreMentions={() =>
                      void loadMentions(mentionActiveQueryRef.current, false)
                    }
                    qnameSuggestions={qnameSuggestions}
                    onQNameQueryChange={setQnameQuery}
                  />

                  <Group justify="space-between" align="center" mt="xs" wrap="nowrap">
                    <Group gap={4} align="center" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Select
                        size="xs"
                        placeholder={t('modelPlaceholder')}
                        data={aiModelOptions}
                        comboboxProps={{ width: MODEL_DROPDOWN_WIDTH }}
                        value={selectedAiModelOption}
                        disabled={aiModelOptions.length === 0 || aiModelsLoading}
                        variant="unstyled"
                        onChange={value => {
                          if (!value) {
                            setSelectedAiModelOption(null);
                            setAiProvider(null);
                            setAiModel(null);
                            return;
                          }

                          const selected = aiModelOptions.find(option => option.value === value);
                          if (!selected) {
                            return;
                          }

                          setSelectedAiModelOption(selected.value);
                          setAiProvider(selected.provider);
                          setAiModel(selected.model);
                          writeStoredModelSelection(
                            modelSelectionServerId,
                            activeChatId,
                            selected.provider,
                            selected.model
                          );
                        }}
                        rightSection={
                          aiModelsLoading ? <Loader size={12} /> : <IconChevronDown size={14} />
                        }
                        leftSection={<IconCpu size={14} />}
                        leftSectionWidth={18}
                        rightSectionWidth={18}
                        styles={COMPOSER_SELECT_STYLES}
                        w={MODEL_SELECT_WIDTH}
                      />
                      {activeServerId === null && activeChatId === null ? (
                        <Select
                          size="xs"
                          placeholder={t('serverSelectorPlaceholder')}
                          data={composerServerOptions}
                          comboboxProps={{ width: SERVER_DROPDOWN_WIDTH }}
                          value={composerServerId ? String(composerServerId) : null}
                          variant="unstyled"
                          onChange={value => {
                            if (!value) {
                              setComposerServerId(null);
                              return;
                            }
                            const parsed = Number.parseInt(value, 10);
                            setComposerServerId(Number.isNaN(parsed) ? null : parsed);
                          }}
                          leftSection={<IconServer2 size={14} />}
                          leftSectionWidth={18}
                          rightSection={<IconChevronDown size={14} />}
                          rightSectionWidth={18}
                          styles={COMPOSER_SELECT_STYLES}
                          w={SERVER_SELECT_WIDTH}
                          aria-label={t('selectServer')}
                        />
                      ) : null}
                      {activeChatId ? (
                        <Tooltip
                          withArrow
                          multiline
                          label={
                            autoConfirmForActiveChat
                              ? t('autoConfirmDisableTooltip')
                              : t('autoConfirmEnableTooltip')
                          }
                        >
                          <ActionIcon
                            size={24}
                            radius="xl"
                            variant={autoConfirmForActiveChat ? 'light' : 'subtle'}
                            color={autoConfirmForActiveChat ? 'blue' : 'gray'}
                            onClick={toggleAutoConfirmForActiveChat}
                            aria-label={t('toggleAutoConfirm')}
                          >
                            {autoConfirmForActiveChat ? (
                              <IconShieldCheck size={14} />
                            ) : (
                              <IconShield size={14} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </Group>

                    {hasActiveRuns ? (
                      <ActionIcon
                        size={32}
                        radius="xl"
                        variant="filled"
                        color="red"
                        onClick={() => {
                          const runToCancel = activeRuns.find(r =>
                            ACTIVE_RUN_STATUSES.has(r.status)
                          );
                          if (runToCancel) void handleCancelRun(runToCancel.id);
                        }}
                      >
                        <IconPlayerStop size={16} />
                      </ActionIcon>
                    ) : (
                      <ActionIcon
                        size={32}
                        radius="xl"
                        variant="filled"
                        color="dark"
                        onClick={() => {
                          if (canSendMessages) {
                            chatInputRef.current?.submit();
                          }
                        }}
                        loading={sending}
                        disabled={!draft.trim() || !canSendMessages}
                      >
                        <IconArrowUp size={18} />
                      </ActionIcon>
                    )}
                  </Group>
                </Paper>
              </Box>
            </>
          )}

          <Box px="xs" py={4}>
            <Tooltip
              withArrow
              multiline
              position="top-start"
              label={
                <Stack gap={3}>
                  <Text size="xs">
                    {(contextWindowDisplay.provider || 'unknown') +
                      ' · ' +
                      (contextWindowDisplay.model || 'default')}
                  </Text>
                  <Text size="xs">
                    {t('contextWindowUsage', {
                      used: tokenFormatter.format(contextWindowDisplay.usedTokens),
                      total: tokenFormatter.format(contextWindowDisplay.totalTokens),
                    })}
                  </Text>
                  <Text size="xs">
                    {t('contextWindowPromptOutput', {
                      prompt: tokenFormatter.format(contextWindowDisplay.promptTokens),
                      output: tokenFormatter.format(contextWindowDisplay.outputTokens ?? 0),
                    })}
                  </Text>
                  {contextWindowDisplay.source === 'default' && (
                    <Text size="xs">{t('contextWindowEstimated')}</Text>
                  )}
                  {(contextWindowDisplay.removedHistoryMessages > 0 ||
                    contextWindowDisplay.trimmedToolResultBlocks > 0) && (
                    <Text size="xs">
                      {t('contextWindowCompacted', {
                        messages: contextWindowDisplay.removedHistoryMessages,
                        blocks: contextWindowDisplay.trimmedToolResultBlocks,
                      })}
                    </Text>
                  )}
                  {contextWindowDisplay.criticalLimit ? (
                    <Text size="xs">{t('contextWindowCritical')}</Text>
                  ) : contextWindowDisplay.nearLimit ? (
                    <Text size="xs">{t('contextWindowNearLimit')}</Text>
                  ) : null}
                </Stack>
              }
            >
              <Stack gap={6}>
                <Progress
                  value={Math.max(0, Math.min(100, contextWindowDisplay.percentage))}
                  color={
                    contextWindowDisplay.criticalLimit
                      ? 'red'
                      : contextWindowDisplay.nearLimit
                        ? 'orange'
                        : 'blue'
                  }
                  size="sm"
                  radius="xl"
                  style={{ cursor: 'help' }}
                />

                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="xs" c="dimmed">
                    {t('contextWindowUsage', {
                      used: tokenFormatter.format(contextWindowDisplay.usedTokens),
                      total: tokenFormatter.format(contextWindowDisplay.totalTokens),
                    })}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {contextWindowDisplay.percentage.toFixed(1)}%
                  </Text>
                </Group>
              </Stack>
            </Tooltip>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export default AgentPage;
