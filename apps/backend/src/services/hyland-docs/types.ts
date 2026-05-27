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
 * Optional coarse filters (legacy shortcuts). Prefer `publication` + `scope` for precise targeting.
 * The Alfresco portal alone lists dozens of guides (ACS, ADW, connectors, Search Services, …).
 */
export type HylandProductFamily = 'alfresco' | 'elasticsearch' | 'solr' | 'modules' | 'any';

/** Which slice of docs.hyland.com to search. */
export type HylandDocsScope = 'alfresco_portal' | 'all';

export interface HylandMapPreview {
  id: string;
  title: string;
  mapApiEndpoint?: string;
  metadata?: Array<{ key: string; label?: string; values?: string[] }>;
}

export interface HylandPublicationSummary {
  mapId: string;
  title: string;
  version: string | null;
  prettyUrl: string | null;
}

export interface HylandTopicSearchHit {
  mapId: string;
  mapTitle: string;
  contentId: string;
  title: string;
  breadcrumb: string[];
  readerUrl: string | null;
  snippet: string | null;
  version: string | null;
  productFamily: HylandProductFamily;
}

export interface HylandTopicContent {
  mapId: string;
  contentId: string;
  mapTitle: string | null;
  title: string | null;
  breadcrumb: string[];
  readerUrl: string | null;
  markdown: string;
  truncated: boolean;
  totalChars: number;
  returnedChars: number;
}

export type PublicationResolveConfidence = 'high' | 'low' | 'none' | 'skipped';

export interface HylandDocsSearchOptions {
  query: string;
  /** Substring match on publication title, e.g. "Digital Workspace" or "Content Connector for Azure". */
  publication?: string | null;
  scope?: HylandDocsScope;
  /** Optional coarse shortcut; defaults to `any` when omitted. */
  product?: HylandProductFamily;
  version?: string | null;
  mapId?: string | null;
  maxResults?: number;
}

export interface HylandDocsListPublicationsOptions {
  /** Product or guide name tokens, e.g. "Digital Workspace", "ACS", "Transform Service". */
  query?: string | null;
  scope?: HylandDocsScope;
  version?: string | null;
  maxResults?: number;
}

export interface HylandDocsListPublicationsResult {
  query: string | null;
  scope: HylandDocsScope;
  version: string | null;
  publications: HylandPublicationSummary[];
  totalInScope: number;
  /** Hint for the agent when matches are weak or absent. */
  hint: string | null;
}

export interface HylandDocsSearchResult {
  query: string;
  publication: string | null;
  scope: HylandDocsScope;
  product: HylandProductFamily;
  version: string | null;
  /** mapId used for search (caller-supplied or auto-resolved). */
  mapId: string | null;
  resolvedPublicationTitle: string | null;
  publicationResolveConfidence: PublicationResolveConfidence;
  results: HylandTopicSearchHit[];
  totalBeforeFilter: number;
  pagesFetched: number;
  publicationsConsidered: number;
  hint: string | null;
}

export interface TopicsSearchApiResult {
  mapId?: string;
  mapTitle?: string;
  contentId?: string;
  topicUrl?: string;
  occurrences?: Array<{
    tocId?: string;
    readerUrl?: string;
    breadcrumb?: string[];
    htmlTitle?: string;
    htmlExcerpt?: string;
  }>;
}

export interface TopicsSearchApiResponse {
  results?: TopicsSearchApiResult[];
  facets?: unknown[];
}
