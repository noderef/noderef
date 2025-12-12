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

export type ContentViewMode = 'monaco' | 'webview';

interface MonacoContent {
  content: string;
  language: string;
}

interface WebViewContent {
  url: string;
}

interface ContentData {
  monaco?: MonacoContent;
  webview?: WebViewContent;
}

export interface LayoutState {
  selectedServerId: string | null;
  activeTab: string | null;
  selectedMenuItem: string | null;
  contentViewMode: ContentViewMode;
  contentData: ContentData;
  submenuWidth: number;
}

export interface LayoutActions {
  selectServer: (serverId: string | null) => void;
  setActiveTab: (tabId: string | null) => void;
  setSelectedMenuItem: (menuItemId: string | null) => void;
  setContentViewMode: (mode: ContentViewMode) => void;
  setContentData: (data: ContentData) => void;
  resetContentState: () => void;
  setSubmenuWidth: (width: number) => void;
}

const initialState: LayoutState = {
  selectedServerId: null,
  activeTab: null,
  selectedMenuItem: null,
  contentViewMode: 'monaco',
  contentData: {},
  submenuWidth: 340,
};

const STORAGE_KEY = 'noderef-layout-store';

export const useLayoutStore = create<LayoutState & LayoutActions>()(
  persist(
    set => ({
      ...initialState,
      selectServer: serverId =>
        set(state => ({
          selectedServerId: serverId,
          // Reset downstream selections when switching context
          activeTab: serverId === state.selectedServerId ? state.activeTab : null,
          selectedMenuItem: null,
          contentData: {},
        })),
      setActiveTab: tabId =>
        set({
          activeTab: tabId,
          selectedMenuItem: null,
        }),
      setSelectedMenuItem: menuItemId =>
        set({
          selectedMenuItem: menuItemId,
        }),
      setContentViewMode: mode =>
        set({
          contentViewMode: mode,
        }),
      setContentData: data =>
        set(state => ({
          contentData: { ...state.contentData, ...data },
        })),
      resetContentState: () =>
        set({
          selectedMenuItem: null,
          contentData: {},
        }),
      setSubmenuWidth: width =>
        set({
          submenuWidth: width,
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: state => ({
        selectedServerId: state.selectedServerId,
        activeTab: state.activeTab,
        submenuWidth: state.submenuWidth,
      }),
    }
  )
);
