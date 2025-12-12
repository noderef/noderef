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
import type { ModalKey } from './keys';
import { i18n, getInitialLanguage } from '@/core/i18n';

export type Theme = 'light' | 'dark' | 'auto';
export type Language = 'en' | string; // Extend as needed

export interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
}

export interface UIState {
  activeModal: ModalKey | null;
  modalPayload: unknown;
  theme: Theme;
  language: Language;
  notifications: NotificationPreferences;
  sidebarCollapsed: boolean;
  _hasHydrated: boolean; // Internal flag to track hydration status
}

export interface UIActions {
  openModal: (name: ModalKey, payload?: unknown) => void;
  closeModal: () => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setNotifications: (prefs: Partial<NotificationPreferences>) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/**
 * Get initial theme from Mantine's color scheme storage
 * Reads from the same localStorage key used by Mantine's colorSchemeManager
 * This ensures the UI store and Mantine are in sync on initial load
 *
 * @returns Theme value ('light' | 'dark' | 'auto'), defaults to 'auto'
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'auto';
  }

  try {
    const stored = localStorage.getItem('noderef-color-scheme');
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      return stored;
    }
  } catch (e) {
    console.warn('Failed to read theme from localStorage:', e);
  }

  return 'auto';
}

/**
 * Get initial language - uses the same logic as i18n initialization
 * This ensures the store and i18n are in sync on first launch
 */
function getInitialLanguageForStore(): Language {
  // Use the same detection logic as i18n
  return getInitialLanguage();
}

const initialState: UIState = {
  activeModal: null,
  modalPayload: undefined,
  theme: getInitialTheme(),
  language: getInitialLanguageForStore(),
  notifications: {
    enabled: true,
    sound: true,
    desktop: true,
  },
  sidebarCollapsed: false,
  _hasHydrated: false,
};

const STORAGE_KEY = 'ui-store';

export const useUIStore = create<UIState & UIActions>()(
  persist(
    set => ({
      ...initialState,
      openModal: (name: ModalKey, payload?: unknown) => {
        set({ activeModal: name, modalPayload: payload });
      },
      closeModal: () => {
        set({ activeModal: null, modalPayload: undefined });
      },
      setTheme: (theme: Theme) => {
        set({ theme });
      },
      setLanguage: (language: Language) => {
        set({ language });
        i18n.changeLanguage(language);
      },
      setNotifications: (prefs: Partial<NotificationPreferences>) => {
        set(state => ({
          notifications: { ...state.notifications, ...prefs },
        }));
      },
      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: state => ({
        theme: state.theme,
        language: state.language,
        notifications: state.notifications,
        sidebarCollapsed: state.sidebarCollapsed,
        // Don't persist modal state or hydration flag
      }),
      onRehydrateStorage: () => state => {
        // Mark as hydrated and ensure language is always defined and in sync with i18n
        if (state) {
          state._hasHydrated = true;

          // On first launch (no stored language), sync with i18n's auto-detected language
          // This ensures the settings UI shows the correct language that was auto-detected
          if (!state.language) {
            state.language = i18n.language || getInitialLanguage();
          }

          // Ensure i18n is always in sync with the store
          // If store has a language but i18n doesn't match, update i18n
          if (state.language && i18n.language !== state.language) {
            i18n.changeLanguage(state.language);
          }
        }
      },
    }
  )
);
