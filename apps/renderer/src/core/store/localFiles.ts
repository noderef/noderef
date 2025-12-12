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

import { create } from 'zustand';
import type { LocalFile, LocalFilesListResponse } from '@/core/ipc/backend';

interface LocalFilesState {
  files: LocalFile[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  initialized: boolean;
  shouldOpenCreateModal: boolean;
  totalItems: number;
  hasMoreItems: boolean;
  pageSize: number;
  nextOffset: number;
  sortBy: 'name' | 'lastModified' | 'createdAt' | 'type';
  sortDir: 'asc' | 'desc';
}

interface LocalFilesActions {
  setPage: (result: LocalFilesListResponse, reset?: boolean) => void;
  addFile: (file: LocalFile) => void;
  updateFile: (id: number, updates: Partial<LocalFile>) => void;
  removeFile: (id: number) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInitialized: (value: boolean) => void;
  requestCreateModal: () => void;
  consumeCreateModal: () => void;
  setSort: (sortBy: LocalFilesState['sortBy'], sortDir: LocalFilesState['sortDir']) => void;
}

const initialState: LocalFilesState = {
  files: [],
  loading: false,
  loadingMore: false,
  error: null,
  initialized: false,
  shouldOpenCreateModal: false,
  totalItems: 0,
  hasMoreItems: false,
  pageSize: 20,
  nextOffset: 0,
  sortBy: 'lastModified',
  sortDir: 'desc',
};

export const useLocalFilesStore = create<LocalFilesState & LocalFilesActions>(set => ({
  ...initialState,
  setPage: (result, reset = false) =>
    set(state => {
      const pagination =
        result.pagination ??
        ({
          totalItems: result.items.length,
          skipCount: reset ? 0 : state.files.length,
          maxItems: result.items.length || state.pageSize,
          hasMoreItems: false,
        } as LocalFilesListResponse['pagination']);

      const mergedFiles = reset ? result.items : [...state.files, ...result.items];
      const deduped = mergedFiles.reduce<LocalFile[]>((acc, file) => {
        if (!acc.find(f => f.id === file.id)) {
          acc.push(file);
        }
        return acc;
      }, []);
      return {
        files: deduped,
        totalItems: pagination.totalItems,
        hasMoreItems: pagination.hasMoreItems,
        pageSize: pagination.maxItems,
        nextOffset: pagination.skipCount + result.items.length,
      };
    }),
  addFile: file =>
    set(state => ({
      files: [file, ...state.files.filter(f => f.id !== file.id)],
      totalItems: state.totalItems + 1,
    })),
  updateFile: (id, updates) =>
    set(state => ({
      files: state.files.map(file => (file.id === id ? { ...file, ...updates } : file)),
    })),
  removeFile: id =>
    set(state => ({
      files: state.files.filter(file => file.id !== id),
      totalItems: Math.max(0, state.totalItems - 1),
    })),
  setLoading: loading => set({ loading }),
  setLoadingMore: loading => set({ loadingMore: loading }),
  setError: error => set({ error }),
  setInitialized: value => set({ initialized: value }),
  requestCreateModal: () => set({ shouldOpenCreateModal: true }),
  consumeCreateModal: () => set({ shouldOpenCreateModal: false }),
  setSort: (sortBy, sortDir) => set({ sortBy, sortDir, nextOffset: 0 }),
}));
