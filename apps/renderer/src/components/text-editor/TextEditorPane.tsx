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

import { useEffect, useRef } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import * as monaco from 'monaco-editor';
import { initMonaco } from '@/core/monaco/setup';

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
