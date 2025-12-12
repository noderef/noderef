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
import { persist } from 'zustand/middleware';

export interface SearchHistoryState {
  recentTypes: string[]; // Array of type names, most recent first
  recentAspects: string[]; // Array of aspect names, most recent first
  recentProps: string[]; // Array of property names, most recent first
}

export interface SearchHistoryActions {
  addType: (type: string) => void;
  addAspect: (aspect: string) => void;
  addProp: (prop: string) => void;
  clearHistory: () => void;
}

const initialState: SearchHistoryState = {
  recentTypes: [],
  recentAspects: [],
  recentProps: [],
};

const STORAGE_KEY = 'noderef-search-history';

const MAX_RECENT_ITEMS = 50; // Keep last 50 items of each type

export const useSearchHistoryStore = create<SearchHistoryState & SearchHistoryActions>()(
  persist(
    set => ({
      ...initialState,
      addType: (type: string) => {
        set(state => {
          const normalized = type.toLowerCase();
          const filtered = state.recentTypes.filter(t => t.toLowerCase() !== normalized);
          return {
            recentTypes: [normalized, ...filtered].slice(0, MAX_RECENT_ITEMS),
          };
        });
      },
      addAspect: (aspect: string) => {
        set(state => {
          const normalized = aspect.toLowerCase();
          const filtered = state.recentAspects.filter(a => a.toLowerCase() !== normalized);
          return {
            recentAspects: [normalized, ...filtered].slice(0, MAX_RECENT_ITEMS),
          };
        });
      },
      addProp: (prop: string) => {
        set(state => {
          const normalized = prop.toLowerCase();
          const filtered = state.recentProps.filter(p => p.toLowerCase() !== normalized);
          return {
            recentProps: [normalized, ...filtered].slice(0, MAX_RECENT_ITEMS),
          };
        });
      },
      clearHistory: () => {
        set(initialState);
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: state => ({
        recentTypes: state.recentTypes,
        recentAspects: state.recentAspects,
        recentProps: state.recentProps,
      }),
    }
  )
);
