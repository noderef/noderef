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

import type * as monaco from 'monaco-editor';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ConsoleOutput {
  id: string;
  timestamp: Date;
  type: 'result' | 'error' | 'log';
  content: string;
  serverId?: number;
}

export interface ConsoleHistoryItem {
  id: string;
  timestamp: Date;
  code: string;
  serverId?: number;
  output?: string | null;
  error?: string | null;
}

interface JsConsoleState {
  code: string;
  outputs: ConsoleOutput[];
  history: ConsoleHistoryItem[];
  historyHasMore: boolean; // Whether there are more history items to load
  historyNextCursor: number | null; // Cursor for next page
  historyLoading: boolean; // Whether history is currently loading
  isExecuting: boolean;
  activeTab: 'output' | 'history';
  activeOutputServerId: number | 'general' | null;
  selectedServerIds: number[];
  splitPosition: number; // percentage for split panel
  documentNodeRef: string | null; // Current document context
  documentName: string | null; // Name of the document for display
  loadedScriptName: string | null; // Name of the loaded script file
  loadedScriptNodeId: string | null; // NodeId of the loaded script file
  formatCodeHandler: (() => Promise<void>) | null; // Handler function for formatting code
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
}

interface JsConsoleActions {
  setCode: (code: string) => void;
  addOutput: (output: Omit<ConsoleOutput, 'id' | 'timestamp'>) => void;
  setHistory: (history: ConsoleHistoryItem[]) => void;
  appendHistory: (items: ConsoleHistoryItem[], hasMore: boolean, nextCursor: number | null) => void;
  setHistoryLoading: (loading: boolean) => void;
  clearOutputs: () => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setActiveTab: (tab: 'output' | 'history') => void;
  setActiveOutputServerId: (serverId: number | 'general' | null) => void;
  setSelectedServerIds: (ids: number[]) => void;
  setSplitPosition: (position: number) => void;
  loadHistoryItem: (id: string) => void;
  setDocumentContext: (nodeRef: string, nodeName: string) => void;
  clearDocumentContext: () => void;
  setLoadedScript: (scriptName: string, nodeId: string, content: string) => void;
  clearLoadedScript: () => void;
  formatCode: () => Promise<void>;
  setFormatCodeHandler: (handler: (() => Promise<void>) | null) => void;
  setEditorInstance: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
  applyAiChanges: (code: string, explicitRange?: monaco.IRange) => void;
  getSelectionText: () => string;
}

const STORAGE_KEY = 'js-console-store';

export const useJsConsoleStore = create<JsConsoleState & JsConsoleActions>()(
  persist(
    (set, get) => ({
      // Initial state
      code: '',
      outputs: [],
      history: [],
      historyHasMore: false,
      historyNextCursor: null,
      historyLoading: false,
      isExecuting: false,
      activeTab: 'output',
      activeOutputServerId: null,
      selectedServerIds: [],
      splitPosition: 60, // 60% for editor, 40% for output
      documentNodeRef: null,
      documentName: null,
      loadedScriptName: null,
      loadedScriptNodeId: null,
      formatCodeHandler: null,
      editorInstance: null,

      // Actions
      setCode: code => set({ code }),

      addOutput: output => {
        const newOutput: ConsoleOutput = {
          ...output,
          id: `output-${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
        };
        set(state => ({
          outputs: [...state.outputs, newOutput],
        }));
      },

      setHistory: history => set({ history, historyHasMore: false, historyNextCursor: null }),

      appendHistory: (items, hasMore, nextCursor) => {
        set(state => ({
          history: [...state.history, ...items],
          historyHasMore: hasMore,
          historyNextCursor: nextCursor,
        }));
      },

      setHistoryLoading: loading => set({ historyLoading: loading }),

      clearOutputs: () => set({ outputs: [] }),

      setIsExecuting: isExecuting => set({ isExecuting }),

      setActiveTab: tab => set({ activeTab: tab }),

      setActiveOutputServerId: serverId => set({ activeOutputServerId: serverId }),

      setSelectedServerIds: ids => set({ selectedServerIds: ids }),

      setSplitPosition: position => {
        // Constrain between 30% and 80%
        const constrainedPosition = Math.max(30, Math.min(80, position));
        set({ splitPosition: constrainedPosition });
      },

      loadHistoryItem: id => {
        const { history } = get();
        const item = history.find(h => h.id === id);
        if (item) {
          set({ code: item.code });
        }
      },

      setDocumentContext: (nodeRef, nodeName) => {
        set({ documentNodeRef: nodeRef, documentName: nodeName });
      },

      clearDocumentContext: () => {
        set({ documentNodeRef: null, documentName: null });
      },

      setLoadedScript: (scriptName, nodeId, content) => {
        set({
          loadedScriptName: scriptName,
          loadedScriptNodeId: nodeId,
          code: content,
        });
      },

      clearLoadedScript: () => {
        set({ loadedScriptName: null, loadedScriptNodeId: null });
      },

      setFormatCodeHandler: handler => {
        set({ formatCodeHandler: handler });
      },

      formatCode: async () => {
        const { formatCodeHandler } = get();
        if (formatCodeHandler) {
          await formatCodeHandler();
        }
      },

      setEditorInstance: editor => {
        set({ editorInstance: editor });
      },

      applyAiChanges: (replacement, explicitRange) => {
        const { editorInstance } = get();
        if (!editorInstance) {
          return;
        }
        const model = editorInstance.getModel();
        if (!model) {
          return;
        }

        const selection =
          explicitRange ?? editorInstance.getSelection() ?? model.getFullModelRange();
        editorInstance.executeEdits('ai-replace', [
          {
            range: selection,
            text: replacement,
          },
        ]);
        editorInstance.pushUndoStop();
        set({ code: model.getValue() });
      },

      getSelectionText: () => {
        const { editorInstance } = get();
        if (!editorInstance) {
          return '';
        }
        const model = editorInstance.getModel();
        const selection = editorInstance.getSelection();
        if (!model || !selection) {
          return '';
        }
        return model.getValueInRange(selection);
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: state => ({
        // Only persist selectedServerIds and splitPosition, not code, outputs, or history
        selectedServerIds: state.selectedServerIds,
        splitPosition: state.splitPosition,
      }),
    }
  )
);
