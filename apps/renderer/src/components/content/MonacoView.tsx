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

interface MonacoViewProps {
  content: string;
  language: string;
}

export function MonacoView({ content, language }: MonacoViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initialContent = useRef(content);
  const initialLanguage = useRef(language);
  const lastLayoutSize = useRef({ width: 0, height: 0 });
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const monacoTheme = computedColorScheme === 'dark' ? 'vs-dark' : 'vs';

  useEffect(() => {
    initMonaco();
    if (!containerRef.current) return;

    editorRef.current = monaco.editor.create(containerRef.current, {
      value: initialContent.current,
      language: initialLanguage.current,
      theme: monacoTheme,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 2,
    });

    // Force layout update after a short delay to ensure container is properly sized
    const timeoutId = setTimeout(() => {
      editorRef.current?.layout();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== content) {
      editorRef.current.setValue(content);
    }
  }, [content]);

  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
    }
  }, [language]);

  // Update theme when color scheme changes
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  useEffect(() => {
    if (!containerRef.current) return;

    const forceLayout = (size?: { width: number; height: number }) => {
      if (!editorRef.current || !containerRef.current) return;
      const rect = size ?? containerRef.current.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      const lastSize = lastLayoutSize.current;

      if (width === lastSize.width && height === lastSize.height) {
        return;
      }

      lastLayoutSize.current = { width, height };
      editorRef.current.layout({ width, height });
    };

    let rafId: number | null = null;
    let pendingSize: { width: number; height: number } | null = null;

    const scheduleLayout = (size?: { width: number; height: number }) => {
      if (size) {
        pendingSize = size;
      }
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const nextSize = pendingSize;
        pendingSize = null;
        forceLayout(nextSize ?? undefined);
      });
    };

    const onCustom = () => scheduleLayout();
    const onWindow = () => scheduleLayout();

    window.addEventListener('noderef:layout-resize', onCustom);
    window.addEventListener('resize', onWindow);

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      scheduleLayout({ width, height });
    });
    resizeObserver.observe(containerRef.current);

    scheduleLayout();

    return () => {
      window.removeEventListener('noderef:layout-resize', onCustom);
      window.removeEventListener('resize', onWindow);
      resizeObserver.disconnect();
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
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
