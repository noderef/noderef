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

import {
  classifyProductFamily,
  extractVersionFromUrl,
  getMapPrettyUrl,
  matchesDocsScope,
  matchesProductFamily,
  matchesPublicationFilter,
  matchesVersion,
  normalizeDocsScope,
  normalizeProductFamily,
  pickPublicationResolveConfidence,
  rankPublicationsByQuery,
  stripHtml,
  summarizeMap,
} from './catalog.js';
import { HylandDocsClient } from './client.js';
import { TtlMemoryCache } from './cache.js';
import type {
  HylandDocsListPublicationsOptions,
  HylandDocsListPublicationsResult,
  HylandDocsSearchOptions,
  HylandDocsSearchResult,
  HylandMapPreview,
  HylandPublicationSummary,
  HylandTopicContent,
  HylandTopicSearchHit,
  TopicsSearchApiResult,
} from './types.js';

const MAPS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 10;
const DEFAULT_LIST_PUBLICATIONS = 12;
const MAX_LIST_PUBLICATIONS = 25;
const DEFAULT_TOPIC_MAX_CHARS = 12_000;
const MAX_TOPIC_MAX_CHARS = 24_000;
const SEARCH_MAX_PAGES_WITH_MAP = 4;

const mapsCache = new TtlMemoryCache<HylandMapPreview[]>(MAPS_CACHE_TTL_MS);
let alfrescoPortalIndex: HylandPublicationSummary[] | null = null;

export class HylandDocsPublicationResolutionError extends Error {
  constructor(
    message: string,
    readonly hint: string
  ) {
    super(message);
    this.name = 'HylandDocsPublicationResolutionError';
  }
}

let defaultClient: HylandDocsClient | null = null;

function getDefaultClient(): HylandDocsClient {
  if (!defaultClient) {
    defaultClient = new HylandDocsClient();
  }
  return defaultClient;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(n, max));
}

function flattenOccurrences(result: TopicsSearchApiResult): Array<{
  mapId: string;
  mapTitle: string;
  contentId: string;
  breadcrumb: string[];
  readerUrl: string | null;
  snippet: string | null;
}> {
  const mapId = typeof result.mapId === 'string' ? result.mapId : '';
  const mapTitle = typeof result.mapTitle === 'string' ? result.mapTitle : '';
  const contentId = typeof result.contentId === 'string' ? result.contentId : '';
  const occurrences = Array.isArray(result.occurrences) ? result.occurrences : [];

  if (occurrences.length === 0 && mapId && contentId) {
    return [
      {
        mapId,
        mapTitle,
        contentId,
        breadcrumb: [],
        readerUrl: typeof result.topicUrl === 'string' ? result.topicUrl : null,
        snippet: null,
      },
    ];
  }

  return occurrences.map(occurrence => ({
    mapId,
    mapTitle,
    contentId,
    breadcrumb: Array.isArray(occurrence.breadcrumb)
      ? occurrence.breadcrumb.filter((item): item is string => typeof item === 'string')
      : [],
    readerUrl: typeof occurrence.readerUrl === 'string' ? occurrence.readerUrl : null,
    snippet:
      typeof occurrence.htmlExcerpt === 'string' && occurrence.htmlExcerpt.trim()
        ? stripHtml(occurrence.htmlExcerpt)
        : typeof occurrence.htmlTitle === 'string'
          ? stripHtml(occurrence.htmlTitle)
          : null,
  }));
}

function buildAlfrescoPortalIndex(maps: HylandMapPreview[]): HylandPublicationSummary[] {
  return maps
    .filter(map =>
      matchesDocsScope('alfresco_portal', {
        mapTitle: map.title,
        prettyUrl: getMapPrettyUrl(map),
      })
    )
    .map(map => summarizeMap(map))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export class HylandDocsService {
  constructor(private readonly client: HylandDocsClient = getDefaultClient()) {}

  /** Cached raw maps catalog (metadata only). */
  async loadMapsCatalog(): Promise<HylandMapPreview[]> {
    const cached = mapsCache.get('maps');
    if (cached) {
      return cached;
    }
    alfrescoPortalIndex = null;
    const maps = await this.client.listMaps();
    mapsCache.set('maps', maps);
    alfrescoPortalIndex = buildAlfrescoPortalIndex(maps);
    return maps;
  }

  private async getAlfrescoPortalIndex(): Promise<HylandPublicationSummary[]> {
    await this.loadMapsCatalog();
    return alfrescoPortalIndex ?? [];
  }

  private async getPublicationPool(scope: import('./types.js').HylandDocsScope): Promise<HylandPublicationSummary[]> {
    if (scope === 'alfresco_portal') {
      return this.getAlfrescoPortalIndex();
    }
    const maps = await this.loadMapsCatalog();
    return maps.map(map => summarizeMap(map));
  }

  private async resolvePublicationMapId(params: {
    guideQuery: string;
    scope: import('./types.js').HylandDocsScope;
    version: string | null;
  }): Promise<{
    mapId: string;
    title: string;
    confidence: import('./types.js').PublicationResolveConfidence;
  }> {
    let pool = await this.getPublicationPool(params.scope);
    if (params.version) {
      pool = pool.filter(pub => matchesVersion(params.version, pub.prettyUrl, pub.title));
    }

    const ranked = rankPublicationsByQuery(params.guideQuery, pool);
    const confidence = pickPublicationResolveConfidence(ranked);

    if (confidence === 'none') {
      throw new HylandDocsPublicationResolutionError(
        `No documentation guide matched "${params.guideQuery}".`,
        'Call hyland_docs_list_publications with the product or guide name (and version if known), then retry search with mapId.'
      );
    }

    const top = ranked[0];
    if (!top || confidence !== 'high') {
      const names = ranked
        .slice(0, 5)
        .map(entry => entry.title)
        .join('; ');
      throw new HylandDocsPublicationResolutionError(
        `Ambiguous guide for "${params.guideQuery}"${names ? ` (candidates: ${names})` : ''}.`,
        'Call hyland_docs_list_publications to pick the correct mapId, then retry hyland_docs_search with mapId.'
      );
    }

    return { mapId: top.mapId, title: top.title, confidence: 'high' };
  }

  /**
   * Resolve which documentation guides match a product name before topic search.
   * Prefer this when the user names a product (ACS, ADW, connector, Search Services, …).
   */
  async listPublications(
    options: HylandDocsListPublicationsOptions = {}
  ): Promise<HylandDocsListPublicationsResult> {
    const scope = normalizeDocsScope(options.scope);
    const version = options.version?.trim() || null;
    const query = options.query?.trim() || null;
    const maxResults = clampInt(
      options.maxResults,
      DEFAULT_LIST_PUBLICATIONS,
      1,
      MAX_LIST_PUBLICATIONS
    );

    let pool: HylandPublicationSummary[];
    if (scope === 'alfresco_portal') {
      pool = await this.getAlfrescoPortalIndex();
    } else {
      if (!query) {
        return {
          query: null,
          scope,
          version,
          publications: [],
          totalInScope: 0,
          hint:
            'For scope "all", provide a query with a product or guide name. For browsing Alfresco guides, use scope "alfresco_portal".',
        };
      }
      const maps = await this.loadMapsCatalog();
      pool = maps.map(map => summarizeMap(map));
    }

    if (version) {
      pool = pool.filter(pub => matchesVersion(version, pub.prettyUrl, pub.title));
    }

    let publications: HylandPublicationSummary[];
    let hint: string | null = null;

    if (query) {
      const ranked = rankPublicationsByQuery(query, pool);

      publications = ranked.slice(0, maxResults).map(({ mapId, title, version, prettyUrl }) => ({
        mapId,
        title,
        version,
        prettyUrl,
      }));

      if (publications.length === 0) {
        hint =
          'No publication title matched. Try shorter product tokens (e.g. "Content Services", "Digital Workspace", "Search Services") or omit version.';
      } else if (ranked[0] && ranked.length > 1 && ranked[0].score < 8) {
        hint =
          'Matches are weak; confirm mapId from the best row, or refine query/version before hyland_docs_search.';
      }
    } else {
      publications = pool.slice(0, maxResults);
      hint =
        'Browse mode: pick the guide that fits the question, then call hyland_docs_search with mapId and a topic query.';
    }

    return {
      query,
      scope,
      version,
      publications,
      totalInScope: pool.length,
      hint,
    };
  }

  async search(options: HylandDocsSearchOptions): Promise<HylandDocsSearchResult> {
    const query = options.query?.trim();
    if (!query) {
      throw new Error('query is required');
    }

    const scope = normalizeDocsScope(options.scope);
    const publication = options.publication?.trim() || null;
    const product = normalizeProductFamily(options.product ?? 'any');
    const version = options.version?.trim() || null;
    let mapIdFilter = options.mapId?.trim() || null;
    const maxResults = clampInt(options.maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS_CAP);

    let resolveConfidence: import('./types.js').PublicationResolveConfidence = mapIdFilter
      ? 'skipped'
      : 'none';
    let resolvedPublicationTitle: string | null = null;

    if (!mapIdFilter) {
      const guideQuery = publication;
      if (!guideQuery) {
        throw new HylandDocsPublicationResolutionError(
          'mapId or publication (guide name) is required for topic search.',
          'Call hyland_docs_list_publications with the product name, or pass publication from the user question, then search with mapId.'
        );
      }
      const resolved = await this.resolvePublicationMapId({ guideQuery, scope, version });
      mapIdFilter = resolved.mapId;
      resolvedPublicationTitle = resolved.title;
      resolveConfidence = resolved.confidence;
    }

    const perPage = 50;
    const maxPages = SEARCH_MAX_PAGES_WITH_MAP;
    const hits: HylandTopicSearchHit[] = [];
    const seen = new Set<string>();
    let totalBeforeFilter = 0;
    let pagesFetched = 0;

    for (let page = 1; page <= maxPages && hits.length < maxResults; page += 1) {
      const apiResponse = await this.client.searchTopics({ query, page, perPage });
      const rawResults = Array.isArray(apiResponse.results) ? apiResponse.results : [];
      totalBeforeFilter += rawResults.length;
      pagesFetched = page;

      for (const raw of rawResults) {
        for (const occurrence of flattenOccurrences(raw)) {
          if (!occurrence.mapId || !occurrence.contentId) {
            continue;
          }
          if (occurrence.mapId !== mapIdFilter) {
            continue;
          }

          const readerUrl = occurrence.readerUrl;

          if (!matchesPublicationFilter(publication, occurrence.mapTitle)) {
            continue;
          }
          if (
            product !== 'any' &&
            !matchesProductFamily(product, {
              mapTitle: occurrence.mapTitle,
              breadcrumb: occurrence.breadcrumb,
              readerUrl,
              snippet: occurrence.snippet,
            })
          ) {
            continue;
          }

          if (!matchesVersion(version, readerUrl, occurrence.mapTitle)) {
            continue;
          }

          const dedupeKey = `${occurrence.mapId}:${occurrence.contentId}:${occurrence.breadcrumb.join('>')}`;
          if (seen.has(dedupeKey)) {
            continue;
          }
          seen.add(dedupeKey);

          const title =
            occurrence.breadcrumb.length > 0
              ? occurrence.breadcrumb[occurrence.breadcrumb.length - 1]
              : occurrence.mapTitle || 'Topic';

          hits.push({
            mapId: occurrence.mapId,
            mapTitle: occurrence.mapTitle,
            contentId: occurrence.contentId,
            title,
            breadcrumb: occurrence.breadcrumb,
            readerUrl,
            snippet: occurrence.snippet,
            version: extractVersionFromUrl(readerUrl),
            productFamily: classifyProductFamily({
              mapTitle: occurrence.mapTitle,
              breadcrumb: occurrence.breadcrumb,
              readerUrl,
              snippet: occurrence.snippet,
            }),
          });

          if (hits.length >= maxResults) {
            break;
          }
        }
        if (hits.length >= maxResults) {
          break;
        }
      }

      if (rawResults.length < perPage) {
        break;
      }
    }

    const publicationIds = new Set(hits.map(hit => hit.mapId));
    let hint: string | null = null;
    if (hits.length === 0) {
      hint =
        'No topics matched in this guide. Broaden the query or confirm mapId via hyland_docs_list_publications.';
    }

    return {
      query,
      publication,
      scope,
      product,
      version,
      mapId: mapIdFilter,
      resolvedPublicationTitle,
      publicationResolveConfidence: resolveConfidence,
      results: hits,
      totalBeforeFilter,
      pagesFetched,
      publicationsConsidered: publicationIds.size,
      hint,
    };
  }

  async getTopicContent(params: {
    mapId: string;
    contentId: string;
    mapTitle?: string | null;
    title?: string | null;
    breadcrumb?: string[];
    readerUrl?: string | null;
    maxChars?: number;
  }): Promise<HylandTopicContent> {
    const mapId = params.mapId?.trim();
    const contentId = params.contentId?.trim();
    if (!mapId) {
      throw new Error('mapId is required');
    }
    if (!contentId) {
      throw new Error('contentId is required');
    }

    const maxChars = Math.max(
      500,
      Math.min(
        typeof params.maxChars === 'number' && Number.isFinite(params.maxChars)
          ? Math.floor(params.maxChars)
          : DEFAULT_TOPIC_MAX_CHARS,
        MAX_TOPIC_MAX_CHARS
      )
    );

    const markdown = await this.client.getTopicMarkdown(mapId, contentId);
    const totalChars = markdown.length;
    const truncated = totalChars > maxChars;
    const slice = truncated ? markdown.slice(0, maxChars) : markdown;

    const breadcrumb = Array.isArray(params.breadcrumb)
      ? params.breadcrumb.filter((item): item is string => typeof item === 'string')
      : [];
    const title =
      (typeof params.title === 'string' && params.title.trim()) ||
      (breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : null);
    const readerUrl =
      typeof params.readerUrl === 'string' && params.readerUrl.trim() ? params.readerUrl.trim() : null;

    return {
      mapId,
      contentId,
      mapTitle: typeof params.mapTitle === 'string' && params.mapTitle.trim() ? params.mapTitle.trim() : null,
      title,
      breadcrumb,
      readerUrl,
      markdown: slice,
      truncated,
      totalChars,
      returnedChars: slice.length,
    };
  }
}

export const hylandDocsService = new HylandDocsService();
