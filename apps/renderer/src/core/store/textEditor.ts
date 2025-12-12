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
import type * as monaco from 'monaco-editor';
import { detectLanguageFromMetadata } from '@/features/text-editor/language';

type WrapMode = 'on' | 'off';

interface TextEditorState {
  content: string;
  language: string;
  fileName: string | null;
  mimeType: string | null;
  wordWrap: WrapMode;
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  fileDialogOpener: (() => void) | null;
  serverId: number | null;
  nodeId: string | null;
  localFileId: number | null;
}

interface TextEditorActions {
  setContent: (value: string) => void;
  setLanguage: (value: string) => void;
  setFileName: (value: string | null) => void;
  setWordWrap: (value: WrapMode) => void;
  setEditorInstance: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
  registerFileDialogOpener: (handler: (() => void) | null) => void;
  triggerFileDialog: () => boolean;
  downloadToDisk: () => void;
  clearEditor: () => void;
  copyToClipboard: () => Promise<void>;
  loadRemoteFile: (params: {
    content: string;
    fileName: string;
    mimeType?: string | null;
    serverId?: number | null;
    nodeId?: string | null;
  }) => void;
  setRemoteSource: (serverId: number | null, nodeId: string | null) => void;
  loadLocalFile: (params: {
    id: number;
    name: string;
    content: string;
    type?: string | null;
  }) => void;
}

const DEFAULT_FILE_NAME = 'untitled.txt';

export const useTextEditorStore = create<TextEditorState & TextEditorActions>((set, get) => ({
  content: '',
  language: 'plaintext',
  fileName: null,
  mimeType: null,
  wordWrap: 'off',
  editorInstance: null,
  fileDialogOpener: null,
  serverId: null,
  nodeId: null,
  localFileId: null,

  setContent: value => set({ content: value }),
  setLanguage: value => set({ language: value }),
  setFileName: value => {
    // Auto-detect language when fileName changes
    const detectedLanguage = detectLanguageFromMetadata(value, null);
    set({ fileName: value, mimeType: value ? null : null, language: detectedLanguage });
  },
  setWordWrap: value => set({ wordWrap: value }),
  setEditorInstance: editor => set({ editorInstance: editor }),

  registerFileDialogOpener: handler => set({ fileDialogOpener: handler }),

  triggerFileDialog: () => {
    const handler = get().fileDialogOpener;
    if (handler) {
      handler();
      return true;
    }
    return false;
  },

  downloadToDisk: () => {
    const { content, fileName } = get();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || DEFAULT_FILE_NAME;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  clearEditor: () => {
    const editor = get().editorInstance;
    if (editor) {
      editor.setValue('');
    }
    set({
      content: '',
      fileName: null,
      mimeType: null,
      serverId: null,
      nodeId: null,
      localFileId: null,
    });
  },

  copyToClipboard: async () => {
    const { content } = get();
    await navigator.clipboard.writeText(content);
  },

  loadRemoteFile: ({ content, fileName, mimeType, serverId = null, nodeId = null }) => {
    const language = detectLanguageFromMetadata(fileName, mimeType);
    set({
      content,
      fileName,
      mimeType: mimeType ?? null,
      language,
      wordWrap: 'off', // Ensure word wrap is disabled when opening files
      serverId,
      nodeId,
      localFileId: null,
    });
  },

  setRemoteSource: (serverId, nodeId) => {
    set({ serverId, nodeId });
  },

  loadLocalFile: ({ id, name, content, type }) => {
    const language = detectLanguageFromMetadata(name, type ?? undefined);
    set({
      content,
      fileName: name,
      mimeType: type ?? null,
      language,
      wordWrap: 'off',
      serverId: null,
      nodeId: null,
      localFileId: id,
    });
  },
}));
