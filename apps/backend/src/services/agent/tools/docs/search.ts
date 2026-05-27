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
  HylandDocsPublicationResolutionError,
  hylandDocsService,
} from '../../../hyland-docs/index.js';
import { normalizeDocsScope, normalizeProductFamily } from '../../../hyland-docs/catalog.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const hylandDocsSearchTool: ToolDefinition = {
  name: 'hyland_docs_search',
  description:
    'Search topics inside a Hyland documentation guide. Requires mapId (from hyland_docs_list_publications) or publication (guide name) for automatic guide resolution.',
  skill: { kind: 'local_md', path: '../skills/hyland_docs_search.md', version: 3 },

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Topic search terms (configuration, API, error message), not the product name alone.',
      },
      mapId: {
        type: 'string',
        description: 'Publication map ID from hyland_docs_list_publications (preferred).',
      },
      publication: {
        type: 'string',
        description:
          'Guide name when mapId is unknown; used to resolve the publication before topic search, e.g. "Alfresco Content Services" or "Digital Workspace".',
      },
      scope: {
        type: 'string',
        enum: ['alfresco_portal', 'all'],
        description: 'Default alfresco_portal: Alfresco-branded guides on /p/alfresco.',
      },
      product: {
        type: 'string',
        enum: ['alfresco', 'elasticsearch', 'solr', 'modules', 'any'],
        description: 'Optional extra filter after guide is resolved.',
      },
      version: {
        type: 'string',
        description: 'Optional version filter, e.g. "26.1".',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum matches to return (1–10, default 5).',
      },
    },
    required: ['query'],
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) {
        return { ok: false, error: 'query is required' };
      }

      const mapId = typeof args.mapId === 'string' ? args.mapId.trim() : null;
      const publication = typeof args.publication === 'string' ? args.publication.trim() : null;
      if (!mapId && !publication) {
        return {
          ok: false,
          error:
            'mapId or publication is required. Call hyland_docs_list_publications first to pick the guide.',
        };
      }

      const scope = normalizeDocsScope(args.scope);
      const product = normalizeProductFamily(args.product);
      const version = typeof args.version === 'string' ? args.version.trim() : null;
      const maxResults =
        typeof args.maxResults === 'number' && Number.isFinite(args.maxResults)
          ? Math.floor(args.maxResults)
          : undefined;

      const result = await hylandDocsService.search({
        query,
        mapId,
        publication,
        scope,
        product,
        version,
        maxResults,
      });

      return {
        ok: true,
        data: {
          source: 'docs.hyland.com',
          query: result.query,
          mapId: result.mapId,
          resolvedPublicationTitle: result.resolvedPublicationTitle,
          publicationResolveConfidence: result.publicationResolveConfidence,
          publication: result.publication,
          scope: result.scope,
          product: result.product,
          version: result.version,
          pagesFetched: result.pagesFetched,
          totalBeforeFilter: result.totalBeforeFilter,
          publicationsConsidered: result.publicationsConsidered,
          hint: result.hint,
          results: result.results.map(hit => ({
            mapId: hit.mapId,
            mapTitle: hit.mapTitle,
            contentId: hit.contentId,
            title: hit.title,
            breadcrumb: hit.breadcrumb,
            readerUrl: hit.readerUrl,
            snippet: hit.snippet,
            version: hit.version,
            productFamily: hit.productFamily,
          })),
          nextStep:
            'Call hyland_docs_get_topic with mapId, contentId, and citation fields (title, readerUrl, breadcrumb, mapTitle) from the chosen result.',
        },
      };
    } catch (err) {
      if (err instanceof HylandDocsPublicationResolutionError) {
        return { ok: false, error: `${err.message} ${err.hint}` };
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
