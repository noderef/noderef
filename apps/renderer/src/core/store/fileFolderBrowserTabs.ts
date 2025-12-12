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

export interface FileFolderBrowserTab {
  id: string;
  nodeId: string;
  nodeName: string;
  serverId: number;
  isPinned: boolean;
}

interface FileFolderBrowserTabsState {
  tabs: FileFolderBrowserTab[];
  activeTabId: string | null;
  previewTabId: string | null;
}

interface FileFolderBrowserTabsActions {
  openTab: (
    tab: Omit<FileFolderBrowserTab, 'id' | 'isPinned'>,
    options?: { pinned?: boolean }
  ) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  clearAllTabs: () => void;
}

export const useFileFolderBrowserTabsStore = create<
  FileFolderBrowserTabsState & FileFolderBrowserTabsActions
>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  previewTabId: null,

  openTab: (tab, options = {}) => {
    const { tabs, previewTabId } = get();
    const isPinned = options.pinned ?? false;

    const existingTab = tabs.find(t => t.nodeId === tab.nodeId && t.serverId === tab.serverId);

    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    if (!isPinned && previewTabId) {
      const previewTab = tabs.find(t => t.id === previewTabId);
      if (previewTab && !previewTab.isPinned) {
        const updatedTabs = tabs.map(t =>
          t.id === previewTabId ? { ...tab, id: previewTabId, isPinned: false } : t
        );
        set({
          tabs: updatedTabs,
          activeTabId: previewTabId,
          previewTabId: previewTabId,
        });
        return;
      }
    }

    const newTab: FileFolderBrowserTab = {
      ...tab,
      id: `file-folder-${tab.serverId}-${tab.nodeId}-${Date.now()}`,
      isPinned,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
      previewTabId: isPinned ? previewTabId : newTab.id,
    });
  },

  closeTab: tabId => {
    const { tabs, activeTabId, previewTabId } = get();
    const newTabs = tabs.filter(t => t.id !== tabId);

    let newActiveTabId = activeTabId;
    let newPreviewTabId = previewTabId;

    if (previewTabId === tabId) {
      newPreviewTabId = null;
    }

    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const closedIndex = tabs.findIndex(t => t.id === tabId);
        newActiveTabId = newTabs[closedIndex]
          ? newTabs[closedIndex].id
          : newTabs[newTabs.length - 1].id;
      } else {
        newActiveTabId = null;
      }
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveTabId,
      previewTabId: newPreviewTabId,
    });
  },

  setActiveTab: tabId => {
    set({ activeTabId: tabId });
  },

  pinTab: tabId => {
    const { tabs } = get();
    const updatedTabs = tabs.map(t => (t.id === tabId ? { ...t, isPinned: true } : t));
    set({ tabs: updatedTabs });
  },

  clearAllTabs: () => {
    set({ tabs: [], activeTabId: null, previewTabId: null });
  },
}));
