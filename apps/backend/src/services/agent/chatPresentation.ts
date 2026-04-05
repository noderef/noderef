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
 * Chat presentation helpers — title generation, icon resolution,
 * and update-decision logic for the first message in a chat thread.
 */

import { parseModelJsonObject } from './agentParsing.js';

// ── Constants ────────────────────────────────────────────────────────────────

const CHAT_TITLE_MAX_CHARS = 60;
export const CHAT_TITLE_MAX_TOKENS = 48;
export const CHAT_TITLE_CALL_TIMEOUT_MS = 8_000;
const CHAT_TITLE_PLACEHOLDER = 'new chat';
export const DEFAULT_CHAT_ICON = 'hash';

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

export const CHAT_TITLE_SYSTEM_PROMPT =
  'You generate a short chat title and select a chat icon. Return strict JSON only.';

// ── Functions ────────────────────────────────────────────────────────────────

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

const trimOuterQuotes = (text: string): string => {
  let value = text.trim();
  while (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('`') && value.endsWith('`')) ||
    (value.startsWith('\u201c') && value.endsWith('\u201d')) ||
    (value.startsWith('\u2018') && value.endsWith('\u2019'))
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

// fallow-ignore-next-line unused-export
export const normalizeChatIcon = (value: unknown): string => {
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

export const resolveChatPresentationUpdate = ({
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

export const buildFallbackChatTitle = (content: string): string =>
  sanitizeChatTitle(buildLegacyTitleSnippet(content, CHAT_TITLE_MAX_CHARS), CHAT_TITLE_MAX_CHARS);

export const buildChatPresentationPrompt = (
  content: string,
  preferredLanguage?: string
): string => {
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

export const parseChatPresentationFromModel = (
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
