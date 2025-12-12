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

/**
 * Saved Searches store
 * Manages saved search queries state
 */

import { create } from 'zustand';
import type { SavedSearch } from '@/core/ipc/backend';

interface SavedSearchesState {
  savedSearches: SavedSearch[];
  activeSavedSearchId: number | null;
  setSavedSearches: (searches: SavedSearch[]) => void;
  addSavedSearch: (search: SavedSearch) => void;
  updateSavedSearch: (id: number, search: Partial<SavedSearch>) => void;
  removeSavedSearch: (id: number) => void;
  getSavedSearchById: (id: number | null) => SavedSearch | null;
  setActiveSavedSearchId: (id: number | null) => void;
}

export const useSavedSearchesStore = create<SavedSearchesState>((set, get) => ({
  savedSearches: [],
  activeSavedSearchId: null,

  setSavedSearches: (searches: SavedSearch[]) => {
    set({ savedSearches: searches });
  },

  addSavedSearch: (search: SavedSearch) => {
    set(state => ({
      savedSearches: [...state.savedSearches, search],
    }));
  },

  updateSavedSearch: (id: number, updates: Partial<SavedSearch>) => {
    set(state => ({
      savedSearches: state.savedSearches.map(search =>
        search.id === id ? { ...search, ...updates } : search
      ),
    }));
  },

  removeSavedSearch: (id: number) => {
    set(state => ({
      savedSearches: state.savedSearches.filter(search => search.id !== id),
      activeSavedSearchId: state.activeSavedSearchId === id ? null : state.activeSavedSearchId,
    }));
  },

  getSavedSearchById: (id: number | null) => {
    if (id === null) return null;
    const state = get();
    return state.savedSearches.find(search => search.id === id) || null;
  },

  setActiveSavedSearchId: (id: number | null) => {
    set({ activeSavedSearchId: id });
  },
}));
