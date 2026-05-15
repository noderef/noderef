/**
 * Copyright 2025-2026 NodeRef
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

import { useEffect, useRef } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import * as monaco from 'monaco-editor';
import { initMonaco } from '@/core/monaco/setup';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { readClipboardText, writeClipboardText } from '@/core/utils/clipboard';

interface TextEditorPaneProps {
  value: string;
  language: string;
  wordWrap: 'on' | 'off';
  onChange: (value: string) => void;
  onEditorMount?: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
}

export function TextEditorPane({
  value,
  language,
  wordWrap,
  onChange,
  onEditorMount,
}: TextEditorPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suppressChange = useRef(false);
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const monacoTheme = computedColorScheme === 'dark' ? 'vs-dark' : 'vs';

  useEffect(() => {
    initMonaco();
    if (!containerRef.current) {
      return;
    }

    editorRef.current = monaco.editor.create(containerRef.current, {
      value,
      language,
      wordWrap,
      theme: monacoTheme,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: false,
      fontSize: 13,
      lineNumbers: 'on',
      lineNumbersMinChars: 2,
      tabSize: 2,
    });

    onEditorMount?.(editorRef.current);

    const disposable = editorRef.current.onDidChangeModelContent(() => {
      if (suppressChange.current) return;
      const nextValue = editorRef.current?.getValue() ?? '';
      onChange(nextValue);
    });

    return () => {
      disposable.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
      onEditorMount?.(null);
    };
    // Single mount: sibling effects keep value/language/wordWrap/theme in sync without recreating the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange/onEditorMount closures are intentional initial wiring only
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    suppressChange.current = true;
    if (editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
    suppressChange.current = false;
  }, [value]);

  useEffect(() => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, language);
  }, [language]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.updateOptions({ wordWrap });
  }, [wordWrap]);

  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry || !editorRef.current) return;
      const { width, height } = entry.contentRect;
      editorRef.current.layout({
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      });
    });

    observer.observe(containerRef.current);

    const handleWindowResize = () => {
      if (!editorRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      editorRef.current.layout({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  // Custom clipboard handling for desktop compatibility
  useEffect(() => {
    if (!editorRef.current || !containerRef.current) return;

    const editor = editorRef.current;
    const container = containerRef.current;

    const getEditorSelectionText = (): string => {
      const model = editor.getModel();
      if (!model) return '';
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) return '';
      return model.getValueInRange(selection);
    };

    const performCopy = async (event?: ClipboardEvent): Promise<boolean> => {
      const text = getEditorSelectionText();
      if (!text) return false;
      return writeClipboardText(text, event);
    };

    const performCut = async (event?: ClipboardEvent): Promise<boolean> => {
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection || selection.isEmpty()) return false;

      const text = model.getValueInRange(selection);
      const copied = await writeClipboardText(text, event);
      if (!copied) return false;

      editor.executeEdits('cut', [
        {
          range: selection,
          text: '',
        },
      ]);
      editor.pushUndoStop();
      return true;
    };

    const performPaste = async (event?: ClipboardEvent): Promise<boolean> => {
      const text = await readClipboardText(event);
      if (!text) return false;

      const selection = editor.getSelection();
      if (!selection) return false;

      editor.executeEdits('paste', [
        {
          range: selection,
          text,
        },
      ]);
      editor.pushUndoStop();
      return true;
    };

    const handleCopy = async (event: ClipboardEvent) => {
      await performCopy(event);
    };

    const handleCut = async (event: ClipboardEvent) => {
      await performCut(event);
    };

    const handlePaste = async (event: ClipboardEvent) => {
      await performPaste(event);
    };

    const handleContainerClick = (event: MouseEvent) => {
      if (event.target === container) {
        editor.focus();
      }
    };

    // Only apply custom clipboard handling in Neutralino mode
    if (isNeutralinoMode()) {
      window.addEventListener('paste', handlePaste, true);
      window.addEventListener('copy', handleCopy, true);
      window.addEventListener('cut', handleCut, true);
      container.addEventListener('click', handleContainerClick);

      return () => {
        container.removeEventListener('click', handleContainerClick);
        window.removeEventListener('paste', handlePaste, true);
        window.removeEventListener('copy', handleCopy, true);
        window.removeEventListener('cut', handleCut, true);
      };
    }

    // In browser mode, just add click handler
    container.addEventListener('click', handleContainerClick);
    return () => {
      container.removeEventListener('click', handleContainerClick);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        flex: 1,
      }}
    />
  );
}
