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
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PageKey } from './keys';
import { PAGE_KEYS } from './keys';

export interface NavigationState {
  activePage: PageKey;
  history: PageKey[];
  activeServerId: number | null;
}

export interface NavigationActions {
  navigate: (page: PageKey, params?: Record<string, unknown>) => void;
  setActiveServer: (serverId: number | null) => void;
  reset: () => void;
  goBack: () => void;
  canGoBack: () => boolean;
}

const initialState: NavigationState = {
  activePage: 'dashboard',
  history: [],
  activeServerId: null,
};

const STORAGE_KEY = 'navigation-store';

// Migration function to clear non-numeric activeServerId values
const migration = (persistedState: any, version: number) => {
  if (version === 0) {
    // Migrate from string to number
    if (persistedState && typeof persistedState.activeServerId === 'string') {
      return {
        ...persistedState,
        activeServerId: null, // Clear string values, user will need to reselect
      };
    }
  }
  if (persistedState && persistedState.activePage) {
    const validPages = new Set(Object.values(PAGE_KEYS));
    if (!validPages.has(persistedState.activePage)) {
      return {
        ...persistedState,
        activePage: initialState.activePage,
        history: [],
      };
    }
  }
  return persistedState;
};

export const useNavigationStore = create<NavigationState & NavigationActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      navigate: (page: PageKey, _params?: Record<string, unknown>) => {
        set(state => ({
          activePage: page,
          history: [...state.history, state.activePage],
        }));
        // Store params in a separate non-persisted store if needed
        // For now, we'll handle params at the component level
      },
      setActiveServer: (serverId: number | null) => {
        set({ activeServerId: serverId });
      },
      reset: () => {
        set(initialState);
      },
      goBack: () => {
        const state = get();
        if (state.history.length > 0) {
          const previousPage = state.history[state.history.length - 1];
          set(state => ({
            activePage: previousPage,
            history: state.history.slice(0, -1),
          }));
        }
      },
      canGoBack: () => {
        return get().history.length > 0;
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      migrate: migration,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        activePage: state.activePage,
        activeServerId: state.activeServerId,
        // Don't persist history
      }),
    }
  )
);
