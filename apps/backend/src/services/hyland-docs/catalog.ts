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

import type {
  HylandDocsScope,
  HylandMapPreview,
  HylandProductFamily,
  PublicationResolveConfidence,
} from './types.js';

const HYLAND_PRODUCT_FAMILIES: HylandProductFamily[] = [
  'alfresco',
  'elasticsearch',
  'solr',
  'modules',
  'any',
];

export function normalizeDocsScope(value: unknown): HylandDocsScope {
  if (typeof value !== 'string') {
    return 'alfresco_portal';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'global') {
    return 'all';
  }
  return 'alfresco_portal';
}

export function normalizeProductFamily(value: unknown): HylandProductFamily {
  if (typeof value !== 'string') {
    return 'any';
  }
  const normalized = value.trim().toLowerCase();
  if (HYLAND_PRODUCT_FAMILIES.includes(normalized as HylandProductFamily)) {
    return normalized as HylandProductFamily;
  }
  return 'any';
}

export function getMapPrettyUrl(map: HylandMapPreview): string | null {
  for (const entry of map.metadata ?? []) {
    if (entry.key === 'ft:prettyUrl' || entry.key === 'prettyUrl') {
      const value = entry.values?.[0];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}

export function extractVersionFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const withSlashes = url.match(/\/(\d+\.\d+(?:\.\d+)?)(?:\/|$)/);
  if (withSlashes?.[1]) {
    return withSlashes[1];
  }
  const trailing = url.match(/(\d+\.\d+(?:\.\d+)?)$/);
  return trailing?.[1] ?? null;
}

function haystackForHit(input: {
  mapTitle?: string;
  breadcrumb?: string[];
  readerUrl?: string | null;
  snippet?: string | null;
}): string {
  return [
    input.mapTitle ?? '',
    ...(input.breadcrumb ?? []),
    input.readerUrl ?? '',
    input.snippet ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

/** Classify a search hit into a product family (used when product filter is `any`). */
export function classifyProductFamily(input: {
  mapTitle?: string;
  breadcrumb?: string[];
  readerUrl?: string | null;
  snippet?: string | null;
}): HylandProductFamily {
  const haystack = haystackForHit(input);
  const mapTitle = (input.mapTitle ?? '').toLowerCase();

  if (/module for| module\b/.test(mapTitle) || /\bmodule\b/.test(haystack)) {
    return 'modules';
  }

  if (
    mapTitle.includes('search services') ||
    /\bsolr\b/.test(haystack) ||
    /\belastic(search)?\b/.test(haystack)
  ) {
    if (/\belastic(search)?\b/.test(haystack) && !/\bsolr\b/.test(haystack)) {
      return 'elasticsearch';
    }
    if (/\bsolr\b/.test(haystack)) {
      return 'solr';
    }
    return 'solr';
  }

  if (mapTitle.includes('alfresco') || /\balfresco\b/.test(haystack)) {
    return 'alfresco';
  }

  return 'any';
}

export function matchesProductFamily(
  product: HylandProductFamily,
  input: {
    mapTitle?: string;
    breadcrumb?: string[];
    readerUrl?: string | null;
    snippet?: string | null;
  }
): boolean {
  if (product === 'any') {
    return true;
  }

  const haystack = haystackForHit(input);
  const mapTitle = (input.mapTitle ?? '').toLowerCase();
  const classified = classifyProductFamily(input);

  switch (product) {
    case 'alfresco':
      return (
        classified === 'alfresco' ||
        (mapTitle.includes('alfresco') &&
          !mapTitle.includes('search services') &&
          classified !== 'modules')
      );
    case 'solr':
      return classified === 'solr' || /\bsolr\b/.test(haystack);
    case 'elasticsearch':
      return classified === 'elasticsearch' || /\belastic(search)?\b/.test(haystack);
    case 'modules':
      return classified === 'modules';
    default:
      return true;
  }
}

export function matchesVersion(
  requestedVersion: string | null | undefined,
  readerUrl: string | null | undefined,
  mapTitle?: string
): boolean {
  if (!requestedVersion?.trim()) {
    return true;
  }
  const needle = requestedVersion.trim().toLowerCase();
  const fromUrl = extractVersionFromUrl(readerUrl);
  if (fromUrl && fromUrl.toLowerCase() === needle) {
    return true;
  }
  if (fromUrl && fromUrl.toLowerCase().startsWith(needle)) {
    return true;
  }
  return (mapTitle ?? '').toLowerCase().includes(needle);
}

/** True when a publication belongs on https://docs.hyland.com/p/alfresco (Alfresco-branded guides). */
export function matchesAlfrescoPortalScope(input: {
  mapTitle?: string;
  readerUrl?: string | null;
  prettyUrl?: string | null;
}): boolean {
  const title = (input.mapTitle ?? '').toLowerCase();
  const reader = (input.readerUrl ?? '').toLowerCase();
  const pretty = (input.prettyUrl ?? '').toLowerCase();
  return (
    title.includes('alfresco') ||
    reader.includes('/alfresco/') ||
    pretty.includes('/alfresco/') ||
    pretty.startsWith('alfresco/')
  );
}

export function matchesDocsScope(
  scope: HylandDocsScope,
  input: {
    mapTitle?: string;
    readerUrl?: string | null;
    prettyUrl?: string | null;
  }
): boolean {
  if (scope === 'all') {
    return true;
  }
  return matchesAlfrescoPortalScope(input);
}

/** Match publication title filter (all significant tokens must appear in map title). */
export function matchesPublicationFilter(
  publication: string | null | undefined,
  mapTitle: string | null | undefined
): boolean {
  const needle = publication?.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const title = (mapTitle ?? '').toLowerCase();
  const tokens = needle.split(/\s+/).filter(token => token.length >= 2);
  if (tokens.length === 0) {
    return title.includes(needle);
  }
  return tokens.every(token => title.includes(token));
}

export function summarizeMap(map: HylandMapPreview): {
  mapId: string;
  title: string;
  version: string | null;
  prettyUrl: string | null;
} {
  const prettyUrl = getMapPrettyUrl(map);
  return {
    mapId: map.id,
    title: map.title,
    version: extractVersionFromUrl(prettyUrl),
    prettyUrl,
  };
}

const PUBLICATION_QUERY_SYNONYMS: Record<string, string[]> = {
  acs: ['content', 'services'],
  adw: ['digital', 'workspace'],
  aps: ['process', 'services'],
  ass: ['search', 'services'],
  tengine: ['transform', 'service'],
  azure: ['azure'],
};

const PUBLICATION_QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'how',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
]);

/** Tokenize a publication lookup query (guide/product name, not topic keywords). */
export function tokenizePublicationQuery(query: string): string[] {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 0 && !PUBLICATION_QUERY_STOP_WORDS.has(token));

  const expanded = new Set<string>();
  for (const token of raw) {
    expanded.add(token);
    const synonyms = PUBLICATION_QUERY_SYNONYMS[token];
    if (synonyms) {
      for (const synonym of synonyms) {
        expanded.add(synonym);
      }
    }
  }
  return [...expanded];
}

/**
 * Score how well a publication title matches a lookup query (higher = better).
 * Returns 0 when there is no meaningful overlap.
 */
export function scorePublicationMatch(
  query: string,
  publication: { title: string; version?: string | null }
): number {
  const trimmed = query.trim();
  if (!trimmed) {
    return 0;
  }

  const title = publication.title.toLowerCase();
  const phrase = trimmed.toLowerCase();
  const tokens = tokenizePublicationQuery(trimmed);
  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    if (/^\d+(\.\d+)*$/.test(token)) {
      if (title.includes(token) || publication.version?.toLowerCase().startsWith(token)) {
        score += 4;
        matchedTokens += 1;
      }
      continue;
    }
    if (title.includes(token)) {
      score += token.length >= 5 ? 4 : token.length >= 3 ? 2 : 1;
      matchedTokens += 1;
    }
  }

  if (matchedTokens === 0) {
    return 0;
  }

  if (title.includes(phrase)) {
    score += 12;
  }

  if (matchedTokens === tokens.length) {
    score += 6;
  }

  if (title.startsWith(phrase) || title.startsWith(tokens[0] ?? '')) {
    score += 3;
  }

  return score;
}

const PUBLICATION_RESOLVE_MIN_SCORE = 8;
const PUBLICATION_RESOLVE_HIGH_SCORE = 12;
const PUBLICATION_RESOLVE_SCORE_GAP = 4;

export function rankPublicationsByQuery<T extends { title: string; version?: string | null }>(
  query: string,
  publications: T[]
): Array<T & { score: number }> {
  return publications
    .map(pub => ({ ...pub, score: scorePublicationMatch(query, pub) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function pickPublicationResolveConfidence(
  ranked: Array<{ score: number }>
): PublicationResolveConfidence {
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < PUBLICATION_RESOLVE_MIN_SCORE) {
    return 'none';
  }
  if (
    top.score >= PUBLICATION_RESOLVE_HIGH_SCORE &&
    (!second || top.score - second.score >= PUBLICATION_RESOLVE_SCORE_GAP)
  ) {
    return 'high';
  }
  return 'low';
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
