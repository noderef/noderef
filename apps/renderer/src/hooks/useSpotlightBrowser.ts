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

import { backendRpc, type RepositoryNode } from '@/core/ipc/backend';
import { useServersStore } from '@/core/store/servers';
import { useCallback, useState } from 'react';

export type BrowserView = 'HOME' | 'SERVER_LIST' | 'FOLDER';

interface HistoryItem {
  serverId: number;
  folderId: string;
  folderName: string;
}

interface BrowserState {
  view: BrowserView;
  serverId: number | null;
  currentFolderId: string | null;
  currentFolderName: string | null;
  items: RepositoryNode[];
  loading: boolean;
  history: HistoryItem[];
  pagination: {
    hasMore: boolean;
    skipCount: number;
    totalItems?: number;
  };
}

export function useSpotlightBrowser() {
  const [state, setState] = useState<BrowserState>({
    view: 'HOME',
    serverId: null,
    currentFolderId: null,
    currentFolderName: null,
    items: [],
    loading: false,
    history: [],
    pagination: {
      hasMore: false,
      skipCount: 0,
    },
  });

  const servers = useServersStore(s => s.servers);

  const loadFolder = useCallback(
    async (serverId: number, folderId?: string, folderName?: string) => {
      setState(prev => ({ ...prev, loading: true }));
      try {
        const { nodes, pagination } = await backendRpc.repository.getNodeChildren(
          serverId,
          folderId,
          {
            maxItems: 50,
            skipCount: 0,
          }
        );

        setState(prev => ({
          ...prev,
          view: 'FOLDER',
          serverId,
          currentFolderId: folderId ?? null,
          currentFolderName: folderName ?? 'Root', // Fallback name
          items: nodes.sort((a, b) => {
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          }),
          loading: false,
          pagination: {
            hasMore: pagination?.hasMoreItems ?? false,
            skipCount: (pagination?.skipCount ?? 0) + nodes.length,
            totalItems: pagination?.totalItems,
          },
        }));
      } catch (error) {
        console.error('Failed to load spotlight nodes', error);
        setState(prev => ({ ...prev, loading: false, items: [] }));
        // Could set error state here if needed
      }
    },
    []
  );

  const startBrowsing = useCallback(() => {
    setState(prev => ({
      ...prev,
      view: 'SERVER_LIST',
      serverId: null,
      currentFolderId: null,
      currentFolderName: null,
      items: [],
      history: [],
      pagination: { hasMore: false, skipCount: 0 },
    }));
  }, []);

  const selectServer = useCallback(
    (server: { id: number; name: string }) => {
      // Reset history when entering a server
      setState(prev => ({ ...prev, history: [] }));
      loadFolder(server.id, undefined, server.name);
    },
    [loadFolder]
  );

  const drillDown = useCallback(
    (node: RepositoryNode) => {
      if (!node.isFolder || !state.serverId) return;

      // Push current state to history before moving
      setState(prev => ({
        ...prev,
        history: [
          ...prev.history,
          {
            serverId: prev.serverId!,
            folderId: prev.currentFolderId ?? '-root-', // Use -root- if null
            folderName: prev.currentFolderName ?? 'Root',
          },
        ],
      }));

      loadFolder(state.serverId, node.id, node.name);
    },
    [state.serverId, loadFolder]
  );

  const goBack = useCallback(() => {
    if (state.view === 'SERVER_LIST') {
      setState(prev => ({ ...prev, view: 'HOME' }));
      return;
    }

    if (state.view === 'FOLDER') {
      if (state.history.length === 0) {
        setState(prev => ({ ...prev, view: 'SERVER_LIST', serverId: null, items: [] }));
        return;
      }

      const lastItem = state.history[state.history.length - 1];
      // Pop history
      setState(prev => ({ ...prev, history: prev.history.slice(0, -1) }));
      // Load parent
      loadFolder(
        lastItem.serverId,
        lastItem.folderId === '-root-' ? undefined : lastItem.folderId,
        lastItem.folderName
      );
    }
  }, [state.view, state.history, loadFolder]);

  const loadMore = useCallback(async () => {
    if (!state.serverId || !state.pagination.hasMore || state.loading) return;

    // don't set global loading, just maybe a local indicator?
    // well, for now we can just append.
    // But we should probably indicate loading state.
    // Let's re-use loading for simplicity, the UI can handle it.
    // Actually, if we set loading=true, the UI might show a spinner replacing the list, which is bad for "Load More".
    // Let's rely on the fact that we will likely update the items.

    try {
      const { nodes, pagination } = await backendRpc.repository.getNodeChildren(
        state.serverId,
        state.currentFolderId ?? undefined,
        {
          maxItems: 50,
          skipCount: state.pagination.skipCount,
        }
      );

      setState(prev => ({
        ...prev,
        items: [...prev.items, ...nodes].sort((a, b) => {
          if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        }),
        pagination: {
          hasMore: pagination?.hasMoreItems ?? false,
          skipCount: (pagination?.skipCount ?? 0) + nodes.length,
          totalItems: pagination?.totalItems,
        },
      }));
    } catch (error) {
      console.error('Failed to load more items', error);
    }
  }, [
    state.serverId,
    state.currentFolderId,
    state.pagination.hasMore,
    state.pagination.skipCount,
    state.loading,
  ]);

  const reset = useCallback(() => {
    setState({
      view: 'HOME',
      serverId: null,
      currentFolderId: null,
      currentFolderName: null,
      items: [],
      loading: false,
      history: [],
      pagination: { hasMore: false, skipCount: 0 },
    });
  }, []);

  return {
    ...state,
    servers,
    startBrowsing,
    selectServer,
    drillDown,
    goBack,
    reset,
    loadMore,
  };
}
