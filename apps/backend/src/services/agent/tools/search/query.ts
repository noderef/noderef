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

import { SearchApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../../types.js';
import { normalizeNodePath } from '../helpers/nodeResultHelpers.js';
import { extractByPath, SEARCH_API_PATH } from '../helpers/searchHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const tokenize = (value: string): string[] => value.toLowerCase().split(/\s+/g).filter(Boolean);

export const searchTool: ToolDefinition = {
  name: 'search',
  description:
    'Search the repository using AFTS or keyword mode with paging support. Use this for counts and listings across folders/files.',
  skill: { kind: 'local_md', path: '../skills/search.md', version: 1 },

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'AFTS query string, e.g. TYPE:"cm:folder", TEXT:"report", @cm:name:"budget*"',
      },
      language: {
        type: 'string',
        enum: ['afts', 'text'],
        description: '"afts" for precise AFTS syntax (preferred). "text" for plain keyword search.',
      },
      maxItems: {
        type: 'number',
        description: 'Max results to return in sample[] (1–200). Use 1 for pure count queries.',
      },
      skipCount: {
        type: 'number',
        description: 'Paging offset. Start at 0 and increase by returned count to get next page.',
      },
      collectAllPages: {
        type: 'boolean',
        description:
          'If true, this tool internally keeps paging (skipCount) until no more results.',
      },
      maxTotalItems: {
        type: 'number',
        description:
          'Safety cap for collectAllPages mode (default 2000, max 5000). Prevents huge payloads.',
      },
      returnFields: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional field paths to project from each item, e.g. ["name","properties.cm:title"].',
      },
      includeProperties: {
        type: 'boolean',
        description:
          'If true, include entry properties in result.sample/results (needed for custom property questions).',
      },
    },
    required: ['query'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const searchApi = new SearchApi(ctx.api);
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      const language = typeof args.language === 'string' ? args.language.trim() : 'text';
      const maxItems =
        typeof args.maxItems === 'number' && Number.isFinite(args.maxItems)
          ? Math.max(1, Math.min(Math.floor(args.maxItems), 200))
          : 20;
      const skipCount =
        typeof args.skipCount === 'number' && Number.isFinite(args.skipCount)
          ? Math.max(0, Math.floor(args.skipCount))
          : 0;
      const collectAllPages = Boolean(args.collectAllPages);
      const maxTotalItems =
        typeof args.maxTotalItems === 'number' && Number.isFinite(args.maxTotalItems)
          ? Math.max(1, Math.min(Math.floor(args.maxTotalItems), 5000))
          : 2000;
      const returnFields = Array.isArray(args.returnFields)
        ? args.returnFields
            .map(field => (typeof field === 'string' ? field.trim() : ''))
            .filter(Boolean)
            .slice(0, 20)
        : [];
      const includeProperties =
        Boolean(args.includeProperties) ||
        returnFields.some(field => field === 'properties' || field.startsWith('properties.'));
      const responseInclude = includeProperties ? ['path', 'properties'] : ['path'];

      if (ctx.signal.aborted) throw new Error('Run was cancelled');

      let aftsQuery: string;
      if (language === 'afts' && query) {
        aftsQuery = query;
      } else {
        const terms = tokenize(query);
        const escaped = terms.map(t => t.replace(/"/g, '\\"')).filter(Boolean);
        aftsQuery = escaped.length
          ? escaped.map(t => `TEXT:"${t}*"`).join(' AND ')
          : 'TYPE:"cm:content" OR TYPE:"cm:folder"';
      }

      const pageSummaries: Array<{
        skipCount: number;
        returned: number;
        totalCount: number;
        hasMoreItems: boolean;
        nextSkipCount: number | null;
      }> = [];
      const collectedEntries: any[] = [];
      let currentSkipCount = skipCount;
      let totalCount = 0;
      let hasMoreItems = false;
      let firstPageResult: any = null;
      let lastPageReturned = 0;
      let hitLimit = false;

      while (true) {
        if (ctx.signal.aborted) throw new Error('Run was cancelled');

        const requestBody = {
          query: { query: '*', language: 'afts' },
          filterQueries: [{ query: aftsQuery }],
          include: responseInclude,
          paging: { maxItems, skipCount: currentSkipCount },
        };

        const result = await searchApi.search(requestBody as any);
        if (!firstPageResult) {
          firstPageResult = result;
        }

        const pageEntries = (result.list?.entries ?? []).map((e: any) => e.entry);
        const pageTotalCount = result.list?.pagination?.totalItems ?? pageEntries.length;
        const pageReturned = pageEntries.length;
        const pageHasMore = currentSkipCount + pageReturned < pageTotalCount;

        totalCount = pageTotalCount;
        lastPageReturned = pageReturned;
        hasMoreItems = pageHasMore;
        pageSummaries.push({
          skipCount: currentSkipCount,
          returned: pageReturned,
          totalCount: pageTotalCount,
          hasMoreItems: pageHasMore,
          nextSkipCount: pageHasMore ? currentSkipCount + pageReturned : null,
        });

        if (collectAllPages) {
          const remaining = maxTotalItems - collectedEntries.length;
          if (remaining <= 0) {
            hitLimit = true;
            break;
          }
          if (pageEntries.length > remaining) {
            collectedEntries.push(...pageEntries.slice(0, remaining));
            hitLimit = true;
            break;
          }
          collectedEntries.push(...pageEntries);
        } else {
          collectedEntries.push(...pageEntries);
          break;
        }

        if (!pageHasMore || pageReturned === 0) {
          break;
        }
        currentSkipCount += pageReturned;
      }

      const verifiedItems = collectedEntries.map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        nodeType: entry.nodeType,
        isFolder: entry.isFolder,
        isFile: entry.isFile,
        path: normalizeNodePath(entry.path?.name),
        mimeType: entry.content?.mimeType ?? null,
        ...(includeProperties ? { properties: entry.properties ?? null } : {}),
      }));
      const verifiedNames = verifiedItems
        .map(item => (typeof item.name === 'string' ? item.name : ''))
        .filter(Boolean);
      const uniqueVerifiedNames = Array.from(new Set(verifiedNames));
      const projectedItems =
        returnFields.length > 0
          ? collectedEntries.map((entry: any) => {
              const values: Record<string, unknown> = {};
              for (const fieldPath of returnFields) {
                values[fieldPath] = extractByPath(entry, fieldPath);
              }
              return {
                id: entry.id ?? null,
                name: entry.name ?? null,
                values,
              };
            })
          : [];
      const nextSkipCount = pageSummaries.length
        ? pageSummaries[pageSummaries.length - 1].nextSkipCount
        : null;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path: SEARCH_API_PATH,
            request: {
              bodyTemplate: {
                query: { query: '*', language: 'afts' },
                filterQueries: [{ query: aftsQuery }],
                include: responseInclude,
                paging: { maxItems, skipCount: '<dynamic>' },
              },
              pageRequests: pageSummaries.map(page => ({
                paging: { maxItems, skipCount: page.skipCount },
              })),
            },
            responseBody: collectAllPages
              ? {
                  pagesFetched: pageSummaries.length,
                  pageSummaries,
                  firstPage: firstPageResult,
                  hitLimit,
                }
              : firstPageResult,
          },
          alfrescoSearchApi: {
            method: 'POST',
            path: SEARCH_API_PATH,
            requestBody: {
              query: { query: '*', language: 'afts' },
              filterQueries: [{ query: aftsQuery }],
              include: responseInclude,
              paging: { maxItems, skipCount },
            },
            responseBody: collectAllPages
              ? {
                  pagesFetched: pageSummaries.length,
                  pageSummaries,
                  firstPage: firstPageResult,
                  hitLimit,
                }
              : firstPageResult,
          },
          aftsQuery,
          collection: {
            mode: collectAllPages ? 'all_pages' : 'single_page',
            pagesFetched: pageSummaries.length,
            requestedMaxItems: maxItems,
            collectedItems: verifiedItems.length,
            maxTotalItems: collectAllPages ? maxTotalItems : null,
            hitLimit,
          },
          returnFields,
          pagination: {
            totalCount, // ← Always use this for counts / totals
            returned: verifiedItems.length,
            pageReturned: lastPageReturned,
            maxItems,
            skipCount,
            hasMoreItems: collectAllPages ? hasMoreItems || hitLimit : hasMoreItems,
            nextSkipCount,
          },
          breakdown: {
            files: verifiedItems.filter(item => item?.isFile).length,
            folders: verifiedItems.filter(item => item?.isFolder).length,
          },
          verifiedNames,
          uniqueVerifiedNames,
          projectedItems,
          sample: verifiedItems.slice(0, 200),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
