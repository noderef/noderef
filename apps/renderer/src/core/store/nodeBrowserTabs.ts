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

export interface NodeBrowserTab {
  id: string;
  nodeId: string;
  nodeName: string;
  serverId: number;
  isPinned: boolean; // Pinned tabs are not replaced on single click
  mimeType: string | null;
  nodeType: string | null;
}

interface NodeBrowserTabsState {
  tabs: NodeBrowserTab[];
  activeTabId: string | null;
  previewTabId: string | null; // The tab that gets replaced on single click
}

interface NodeBrowserTabsActions {
  openTab: (
    tab: Omit<NodeBrowserTab, 'id' | 'isPinned' | 'mimeType' | 'nodeType'>,
    options?: { pinned?: boolean }
  ) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  clearAllTabs: () => void;
  updateTabMetadata: (
    tabId: string,
    metadata: Partial<Pick<NodeBrowserTab, 'mimeType' | 'nodeType'>>
  ) => void;
  pruneTabsForServers: (validServerIds: number[]) => void;
}

export const useNodeBrowserTabsStore = create<NodeBrowserTabsState & NodeBrowserTabsActions>()(
  (set, get) => ({
    tabs: [],
    activeTabId: null,
    previewTabId: null,

    openTab: (tab, options = {}) => {
      const { tabs, previewTabId } = get();
      const isPinned = options.pinned ?? false;

      // Check if tab already exists for this node
      const existingTab = tabs.find(t => t.nodeId === tab.nodeId && t.serverId === tab.serverId);

      if (existingTab) {
        // Just activate existing tab
        set({ activeTabId: existingTab.id });
        return;
      }

      // If not pinned and there's a preview tab, replace it
      if (!isPinned && previewTabId) {
        const previewTab = tabs.find(t => t.id === previewTabId);
        if (previewTab && !previewTab.isPinned) {
          // Replace the preview tab
          const updatedTabs = tabs.map(t =>
            t.id === previewTabId
              ? {
                  ...t,
                  ...tab,
                  id: previewTabId,
                  isPinned: false,
                  mimeType: null,
                  nodeType: null,
                }
              : t
          );
          set({
            tabs: updatedTabs,
            activeTabId: previewTabId,
            previewTabId: previewTabId,
          });
          return;
        }
      }

      // Create new tab
      const newTab: NodeBrowserTab = {
        ...tab,
        id: `node-${tab.serverId}-${tab.nodeId}-${Date.now()}`,
        isPinned,
        mimeType: null,
        nodeType: null,
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

      // If closing preview tab, clear preview
      if (previewTabId === tabId) {
        newPreviewTabId = null;
      }

      // If closing active tab, activate another tab
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          // Try to activate the next tab, or the previous one
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

    updateTabMetadata: (tabId, metadata) => {
      set(state => ({
        tabs: state.tabs.map(tab => (tab.id === tabId ? { ...tab, ...metadata } : tab)),
      }));
    },

    pruneTabsForServers: validServerIds => {
      set(state => {
        const validIds = new Set(validServerIds);
        const filteredTabs = state.tabs.filter(tab => validIds.has(tab.serverId));
        if (filteredTabs.length === state.tabs.length) {
          return {};
        }

        let activeTabId = state.activeTabId;
        if (activeTabId && !filteredTabs.some(tab => tab.id === activeTabId)) {
          activeTabId = filteredTabs.length > 0 ? filteredTabs[filteredTabs.length - 1].id : null;
        }

        let previewTabId = state.previewTabId;
        if (previewTabId && !filteredTabs.some(tab => tab.id === previewTabId)) {
          previewTabId = null;
        }

        return {
          tabs: filteredTabs,
          activeTabId,
          previewTabId,
        };
      });
    },
  })
);
