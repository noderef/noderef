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

import type { AgentChatMcpSettings, AgentMessageContextItem } from '@app/contracts';

export function parseMcpSettings(raw: string | null | undefined): AgentChatMcpSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as { enabled?: unknown; tools?: unknown };
    return {
      enabled: Boolean(record.enabled),
      tools: Array.isArray(record.tools)
        ? record.tools.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export function serializeMcpSettings(settings: AgentChatMcpSettings): string {
  return JSON.stringify({
    enabled: Boolean(settings.enabled),
    tools: [...new Set(settings.tools.filter(Boolean))],
  });
}

export function parseMessageContext(
  raw: string | null | undefined
): Array<AgentMessageContextItem & { text?: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: Array<AgentMessageContextItem & { text?: string }> = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.uri !== 'string' || !record.uri) continue;
      items.push({
        uri: record.uri,
        name: typeof record.name === 'string' ? record.name : null,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
        chars: typeof record.chars === 'number' ? record.chars : 0,
        truncated: Boolean(record.truncated),
        text: typeof record.text === 'string' ? record.text : undefined,
      });
    }
    return items;
  } catch {
    return [];
  }
}
