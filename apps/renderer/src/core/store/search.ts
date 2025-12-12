/**
 * Copyright 2025 NodeRef
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

import { backendRpc } from '@/core/ipc/backend';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SearchResult {
  id: string;
  name: string;
  isFolder?: boolean;
  isFile?: boolean;
  nodeRef: string;
  type: string;
  path: string;
  modifiedAt: string;
  modifier: string;
  createdAt?: string;
  creator?: string;
  parentId?: string;
  mimeType?: string;
  properties?: Record<string, unknown>;
  serverId: number;
  serverName: string;
}

export interface SearchServerTarget {
  id: number;
  baseUrl: string;
  name: string;
}

interface ServerSearchState {
  serverId: number;
  baseUrl: string;
  name: string;
  pagination: {
    count?: number;
    hasMoreItems?: boolean;
    totalItems?: number;
    skipCount?: number;
    maxItems?: number;
  };
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  pagination: {
    count?: number;
    hasMoreItems?: boolean;
    totalItems?: number;
    skipCount?: number;
    maxItems?: number;
  };
  serverStates: Record<number, ServerSearchState>;
  selectedServerIds: number[];
}

export interface SearchActions {
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  executeSearch: (server: SearchServerTarget, query: string) => Promise<void>;
  executeSearchMulti: (servers: SearchServerTarget[], query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  setSelectedServerIds: (ids: number[]) => void;
}

const initialState: SearchState = {
  query: '',
  results: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  pagination: {},
  serverStates: {},
  selectedServerIds: [],
};

const sortResultsByModified = (items: SearchResult[]) =>
  [...items].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

const computeAggregatedPagination = (
  serverStates: Record<number, ServerSearchState>,
  itemCount: number
): SearchState['pagination'] => {
  const metas = Object.values(serverStates);
  if (metas.length === 0) {
    return { count: itemCount };
  }
  const hasMoreItems = metas.some(meta => meta.pagination?.hasMoreItems);
  const totalItemsAvailable = metas.every(meta => meta.pagination?.totalItems !== undefined)
    ? metas.reduce((sum, meta) => sum + (meta.pagination?.totalItems ?? 0), 0)
    : undefined;
  const summedMaxItems = metas.reduce((sum, meta) => sum + (meta.pagination?.maxItems ?? 0), 0);
  const fallbackMaxItems = metas.length * 50;
  return {
    count: itemCount,
    hasMoreItems,
    totalItems: totalItemsAvailable,
    maxItems: summedMaxItems || fallbackMaxItems,
  };
};

const STORAGE_KEY = 'search-store';

export const useSearchStore = create<SearchState & SearchActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      setQuery: query => set({ query }),
      setResults: results => set({ results }),
      setIsLoading: isLoading => set({ isLoading }),
      setError: error => set({ error }),
      reset: () => set(initialState),
      executeSearch: async (server, query) => {
        await get().executeSearchMulti([server], query);
      },
      executeSearchMulti: async (servers, query) => {
        if (!servers.length) {
          return;
        }
        set({
          isLoading: true,
          isLoadingMore: false,
          error: null,
          query,
          results: [],
          serverStates: {},
        });
        try {
          const responses = await Promise.all(
            servers.map(async server => {
              const response = await backendRpc.alfresco.search.query(
                server.id,
                server.baseUrl,
                query,
                {
                  maxItems: 50,
                  skipCount: 0,
                }
              );
              console.debug(
                '[SearchStore] executeSearch pagination',
                server.name,
                response.pagination
              );
              return { server, response };
            })
          );

          const serverStates = Object.fromEntries(
            responses.map(({ server, response }) => [
              server.id,
              {
                serverId: server.id,
                baseUrl: server.baseUrl,
                name: server.name,
                pagination: response.pagination,
              },
            ])
          );

          const combinedResults = sortResultsByModified(
            responses.flatMap(({ server, response }) =>
              response.items.map(item => ({
                ...item,
                serverId: server.id,
                serverName: server.name,
                properties: item.properties ?? {},
                isFolder: item.isFolder,
                isFile: item.isFile,
              }))
            )
          );

          const totalResultsCount = combinedResults.length;
          const totalItems =
            computeAggregatedPagination(serverStates, combinedResults.length).totalItems ??
            totalResultsCount;

          set({
            results: combinedResults,
            pagination: computeAggregatedPagination(serverStates, combinedResults.length),
            serverStates,
            isLoading: false,
          });

          // Save search history asynchronously (fire-and-forget)
          // Only save if query is not empty
          if (query && query.trim().length > 0) {
            backendRpc.searchHistory
              .create({
                query: query.trim(),
                resultsCount: totalItems,
              })
              .catch(err => {
                console.error('Failed to save search history:', err);
              });
          }
        } catch (error) {
          console.error('Search failed:', error);
          set({
            error: error instanceof Error ? error.message : 'Search failed',
            isLoading: false,
            results: [],
            serverStates: {},
          });
        }
      },
      loadMore: async () => {
        const state = get();
        if (state.isLoading || state.isLoadingMore) return;
        const serversToLoad = Object.values(state.serverStates).filter(
          meta => meta.pagination?.hasMoreItems
        );
        if (serversToLoad.length === 0) {
          return;
        }

        set({ isLoadingMore: true });

        try {
          const responses = await Promise.all(
            serversToLoad.map(async meta => {
              const maxItems = meta.pagination?.maxItems ?? 50;
              const skipCount = (meta.pagination?.skipCount ?? 0) + maxItems;
              const response = await backendRpc.alfresco.search.query(
                meta.serverId,
                meta.baseUrl,
                state.query,
                {
                  maxItems,
                  skipCount,
                }
              );
              console.debug('[SearchStore] loadMore pagination', meta.name, response.pagination);
              return {
                server: { id: meta.serverId, baseUrl: meta.baseUrl, name: meta.name },
                response,
              };
            })
          );

          set(prev => {
            const updatedServerStates = { ...prev.serverStates };
            responses.forEach(({ server, response }) => {
              updatedServerStates[server.id] = {
                serverId: server.id,
                baseUrl: server.baseUrl,
                name: server.name,
                pagination: response.pagination,
              };
            });

            const appended = responses.flatMap(({ server, response }) =>
              response.items.map(item => ({
                ...item,
                serverId: server.id,
                serverName: server.name,
                properties: item.properties ?? {},
                isFolder: item.isFolder,
                isFile: item.isFile,
              }))
            );
            const mergedResults = sortResultsByModified([...prev.results, ...appended]);

            return {
              results: mergedResults,
              serverStates: updatedServerStates,
              pagination: computeAggregatedPagination(updatedServerStates, mergedResults.length),
              isLoadingMore: false,
            };
          });
        } catch (error) {
          console.error('Load more failed:', error);
          set({ isLoadingMore: false });
        }
      },
      setSelectedServerIds: ids => set({ selectedServerIds: ids }),
    }),
    {
      name: STORAGE_KEY,
      partialize: state => ({
        // Only persist selectedServerIds, not search results or query state
        selectedServerIds: state.selectedServerIds,
      }),
    }
  )
);
