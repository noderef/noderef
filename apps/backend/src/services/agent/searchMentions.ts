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

import { GroupsApi, PeopleApi, SearchApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from './types.js';

interface SearchMentionsPayload {
  query: string;
  types?: Array<'node' | 'person' | 'group'> | null;
  skipCount?: number;
  maxItems?: number;
}

interface MentionItem {
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

function normalizeDisplayPath(pathValue: unknown): string | null {
  if (typeof pathValue === 'string') {
    const trimmed = pathValue.trim();
    return trimmed.length ? trimmed : null;
  }

  if (
    pathValue &&
    typeof pathValue === 'object' &&
    'name' in pathValue &&
    typeof (pathValue as { name?: unknown }).name === 'string'
  ) {
    const namedPath = (pathValue as { name: string }).name.trim();
    if (namedPath.length) {
      return namedPath;
    }
  }

  if (
    pathValue &&
    typeof pathValue === 'object' &&
    'elements' in pathValue &&
    Array.isArray((pathValue as { elements?: unknown[] }).elements)
  ) {
    const parts = ((pathValue as { elements: Array<{ name?: unknown }> }).elements || [])
      .map(element => (typeof element?.name === 'string' ? element.name.trim() : ''))
      .filter(Boolean);
    return parts.length ? `/${parts.join('/')}` : null;
  }

  return null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function searchMentions(ctx: AgentExecutionContext, payload: SearchMentionsPayload) {
  const query = payload.query.trim();
  if (!query) {
    return {
      items: [],
      pagination: { totalItems: 0, skipCount: 0, maxItems: 0, hasMoreItems: false },
    };
  }

  const maxItems = Math.max(1, Math.min(payload.maxItems ?? 20, 50));
  const skipCount = Math.max(0, payload.skipCount ?? 0);
  const types = payload.types && payload.types.length ? new Set(payload.types) : null;

  const searchApi = new SearchApi(ctx.api);
  const peopleApi = new PeopleApi(ctx.api);
  const groupsApi = new GroupsApi(ctx.api);

  const lowered = query.toLowerCase();
  const items: MentionItem[] = [];

  if (!types || types.has('node')) {
    const escaped = query.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
    const nodeAftsQuery = [
      `cm:name:"*${escaped}*"`,
      `@cm:title:"*${escaped}*"`,
      `@cm:description:"*${escaped}*"`,
      `TEXT:"${escaped}*"`,
    ].join(' OR ');
    const nodeResult = await searchApi.search({
      query: {
        query: `(${nodeAftsQuery}) AND (TYPE:"cm:content" OR TYPE:"cm:folder")`,
        language: 'afts',
      },
      fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
      include: ['path', 'properties'],
      paging: { maxItems: 30, skipCount: 0 },
    } as any);

    for (const entry of nodeResult.list?.entries || []) {
      const node = entry.entry;
      if (!node?.id || !node?.name) {
        continue;
      }

      const displayPath = normalizeDisplayPath(node.path);
      const mimeType =
        typeof node.content?.mimeType === 'string' && node.content.mimeType.trim().length
          ? node.content.mimeType
          : null;
      const title = normalizeOptionalText(node.properties?.['cm:title']);
      const description = normalizeOptionalText(node.properties?.['cm:description']);

      items.push({
        id: node.id,
        type: 'node',
        label: node.name,
        path: displayPath,
        displayPath,
        isContainer: Boolean(node.isFolder),
        isFile: Boolean(node.isFile),
        mimeType,
        title,
        description,
        subtitle: displayPath ?? node.nodeType ?? null,
      });
    }
  }

  if (!types || types.has('person')) {
    const people = await peopleApi.listPeople({
      maxItems: 100,
      skipCount: 0,
      fields: ['id', 'firstName', 'lastName', 'email'],
    });

    for (const entry of people.list?.entries || []) {
      const person = entry.entry;
      const label =
        [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.id;
      const haystack = `${person.id || ''} ${label} ${person.email || ''}`.toLowerCase();
      if (!haystack.includes(lowered)) {
        continue;
      }
      items.push({
        id: person.id,
        type: 'person',
        label,
        subtitle: person.email || null,
      });
    }
  }

  if (!types || types.has('group')) {
    const groups = await groupsApi.listGroups({
      maxItems: 100,
      skipCount: 0,
      fields: ['id', 'displayName'],
    });

    for (const entry of groups.list?.entries || []) {
      const group = entry.entry;
      if (!group?.id) {
        continue;
      }

      const label = (group.displayName || group.id || '').trim();
      if (!label) {
        continue;
      }

      const haystack = `${group.id || ''} ${label}`.toLowerCase();
      if (!haystack.includes(lowered)) {
        continue;
      }
      items.push({
        id: group.id,
        type: 'group',
        label,
        subtitle: group.id,
      });
    }
  }

  const ranked = items
    .map(item => {
      const lowerLabel = item.label.toLowerCase();
      const lowerSubtitle = (item.subtitle || '').toLowerCase();

      let score = 3;
      if (lowerLabel.startsWith(lowered)) {
        score = 0;
      } else if (lowerSubtitle.startsWith(lowered)) {
        score = 1;
      } else if (lowerLabel.includes(lowered)) {
        score = 2;
      }

      return { ...item, score };
    })
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.label.localeCompare(b.label)));

  const page = ranked
    .slice(skipCount, skipCount + maxItems)
    .map(({ score: _score, ...rest }) => rest);

  return {
    items: page,
    pagination: {
      totalItems: ranked.length,
      skipCount,
      maxItems,
      hasMoreItems: skipCount + page.length < ranked.length,
    },
  };
}
