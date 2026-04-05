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
 * Agent formatting utilities — pure functions for markdown, links, and
 * value presentation used in user-facing assistant messages.
 */

const MAX_PROPERTIES_JSON_CHARS = 20_000;

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1)}…`;
}

export function inlineCode(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function buildNodeBrowserMarkdownLink(nodeId: string, nodeName?: string): string {
  const normalizedId = nodeId.trim();
  const normalizedName = typeof nodeName === 'string' ? nodeName.trim() : '';
  const label = normalizedName || normalizedId;
  if (!normalizedId) {
    return inlineCode(label || 'unknown');
  }

  const params = new URLSearchParams();
  if (normalizedName) {
    params.set('name', normalizedName);
  }
  const href = `nodebrowser://node/${encodeURIComponent(normalizedId)}${
    params.toString() ? `?${params.toString()}` : ''
  }`;

  return `[${escapeMarkdownLinkLabel(label)}](<${href}>)`;
}

export function humanizeOperation(operation: string): string {
  return operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatValueForInline(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? truncateText(trimmed, 120) : '""';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return truncateText(JSON.stringify(value), 120);
  } catch {
    return truncateText(String(value), 120);
  }
}

function stringifyJsonTruncated(value: unknown, maxChars = MAX_PROPERTIES_JSON_CHARS): string {
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized.length <= maxChars) {
      return serialized;
    }
    return `${serialized.slice(0, maxChars)}\n... [truncated ${serialized.length - maxChars} chars]`;
  } catch {
    return String(value);
  }
}

export function appendPropertiesSection(
  lines: string[],
  properties: Record<string, unknown> | null
): void {
  if (!properties) {
    return;
  }

  const keys = Object.keys(properties);
  if (!keys.length) {
    return;
  }

  const ordered: Record<string, unknown> = {};
  for (const key of keys.sort((a, b) => a.localeCompare(b))) {
    ordered[key] = properties[key];
  }

  lines.push(`- **Properties returned:** ${keys.length}`);
  lines.push('');
  lines.push('#### All properties');
  lines.push('```json');
  lines.push(stringifyJsonTruncated(ordered));
  lines.push('```');
}
