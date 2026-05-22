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

import { IMPORT_TAG_REGEX_SOURCE } from '@/core/monaco/import-parser';
import { importResolver } from '@/core/monaco/import-resolver';
import { initMonaco } from '@/core/monaco/setup';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useMonacoClipboardHandlers } from '@/hooks/useMonacoClipboardHandlers';
import { useActiveServerId } from '@/hooks/useNavigation';
import { useComputedColorScheme } from '@mantine/core';
import * as monaco from 'monaco-editor';
import parserBabel from 'prettier/plugins/babel';
import parserEstree from 'prettier/plugins/estree';
import prettier from 'prettier/standalone';
import { useEffect, useRef, useState } from 'react';
import './JsConsoleEditor.css';

interface JsConsoleEditorProps {
  onAiRequest?: () => void;
}

export function JsConsoleEditor({ onAiRequest }: JsConsoleEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const code = useJsConsoleStore(state => state.code);
  const setCode = useJsConsoleStore(state => state.setCode);
  const setFormatCodeHandler = useJsConsoleStore(state => state.setFormatCodeHandler);
  const aiRequestRef = useRef<(() => void) | undefined>(onAiRequest);
  const aiDecorationsRef = useRef<string[]>([]);
  const aiLinesRef = useRef<Set<number>>(new Set());
  const activeServerId = useActiveServerId();
  const selectedServerIds = useJsConsoleStore(state => state.selectedServerIds);
  const importResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    aiRequestRef.current = onAiRequest;
  }, [onAiRequest]);
  const setEditorInstance = useJsConsoleStore(state => state.setEditorInstance);
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const monacoTheme = computedColorScheme === 'dark' ? 'vs-dark' : 'vs';

  // Update import resolver with appropriate server ID
  // Use activeServerId if set (when on a specific server page),
  // otherwise use the first selected server (when in NodeRef space)
  useEffect(() => {
    const serverId = activeServerId ?? selectedServerIds[0] ?? null;
    const previousServerId = importResolver.getServerId();

    // Set server ID (this automatically clears imports if server changed)
    importResolver.setServerId(serverId);

    // If server changed and we have code with imports, re-resolve them
    if (previousServerId !== serverId && serverId !== null) {
      const currentCode = editorRef.current?.getValue();
      if (currentCode && currentCode.includes('<import')) {
        setTimeout(() => {
          void importResolver.resolveImports(currentCode);
        }, 100);
      }
    }
  }, [activeServerId, selectedServerIds]);

  // Initialize Monaco Editor
  useEffect(() => {
    initMonaco();
    if (!containerRef.current) return;

    editorRef.current = monaco.editor.create(containerRef.current, {
      value: code,
      language: 'javascript',
      theme: monacoTheme,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      lineNumbersMinChars: 2,
      automaticLayout: false,
      fontSize: 13,
      tabSize: 2,
      wordWrap: 'on',
    });

    setEditorInstance(editorRef.current);
    setEditorReady(true);

    // Focus the editor after creation
    setTimeout(() => {
      editorRef.current?.focus();
    }, 0);

    const applyAiMarkerFilter = () => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;

      // Get all import tag line numbers using shared regex
      const importMatches = model.findMatches(
        IMPORT_TAG_REGEX_SOURCE,
        false,
        true,
        false,
        null,
        false
      );
      const importLines = new Set(importMatches.map(m => m.range.startLineNumber));

      // Filter out all markers (typescript, javascript) on AI command lines and import lines
      const allMarkers = monaco.editor.getModelMarkers({ resource: model.uri });
      const markersByOwner = new Map<string, typeof allMarkers>();

      for (const marker of allMarkers) {
        const owner = marker.owner;
        if (!markersByOwner.has(owner)) {
          markersByOwner.set(owner, []);
        }
        markersByOwner.get(owner)!.push(marker);
      }

      // Error codes that are commonly caused by import tags confusing the parser
      const importRelatedErrorCodes = [
        1109, // Expression expected
        1005, // ')' expected or '(' expected
        2552, // Cannot find name
        1141, // String literal expected
      ];

      // Clear markers for each owner, filtering out AI lines, import lines, and import-related errors
      for (const [owner, markers] of markersByOwner.entries()) {
        const filtered = markers.filter(marker => {
          // Filter AI lines
          if (aiLinesRef.current.has(marker.startLineNumber)) return false;

          // Filter import lines
          if (importLines.has(marker.startLineNumber)) return false;

          // If there's an import line nearby, filter common cascading errors
          if (importLines.size > 0) {
            const hasNearbyImport = Array.from(importLines).some(
              importLine => Math.abs(marker.startLineNumber - importLine) <= 3
            );
            const markerCode =
              typeof marker.code === 'string' ? parseInt(marker.code, 10) : marker.code;
            if (
              hasNearbyImport &&
              typeof markerCode === 'number' &&
              importRelatedErrorCodes.includes(markerCode)
            ) {
              return false;
            }
          }

          return true;
        });
        monaco.editor.setModelMarkers(model, owner, filtered);
      }
    };

    const updateAiDecorations = () => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      const decorations: monaco.editor.IModelDeltaDecoration[] = [];
      const totalLines = model.getLineCount();
      const prefixes = ['/ai', ':ai'];
      const aiLines = new Set<number>();

      for (let line = 1; line <= totalLines; line++) {
        const content = model.getLineContent(line);
        const trimmed = content.trimStart();
        if (!trimmed) continue;

        let isAiLine = false;

        // Check if line starts with AI command
        const matchedPrefix = prefixes.find(prefix => trimmed.startsWith(prefix));
        if (matchedPrefix) {
          const nextChar = trimmed.charAt(matchedPrefix.length);
          if (!nextChar || /\s/.test(nextChar)) {
            isAiLine = true;
          }
        }

        // Check for inline AI command (e.g., "code(); /ai do something")
        if (!isAiLine) {
          for (const prefix of prefixes) {
            // Match "/ai " or "// /ai " patterns
            const inlinePattern = new RegExp(
              `\\s+//\\s*${prefix.replace('/', '\\/')}\\s+|\\s+${prefix.replace('/', '\\/')}\\s+`
            );
            if (inlinePattern.test(content)) {
              isAiLine = true;
              break;
            }
          }
        }

        if (!isAiLine) continue;

        aiLines.add(line);

        decorations.push({
          range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: 'ai-command-glyph',
            beforeContentClassName: 'ai-command-background',
            inlineClassName: 'ai-command-text',
            hoverMessage: [{ value: '✨ AI command — press Enter to send' }],
          },
        });
      }
      aiLinesRef.current = aiLines;
      aiDecorationsRef.current = editor.deltaDecorations(aiDecorationsRef.current, decorations);
      applyAiMarkerFilter();
    };

    updateAiDecorations();

    // Listen to content changes
    const disposable = editorRef.current.onDidChangeModelContent(() => {
      const value = editorRef.current?.getValue() || '';
      setCode(value);
      updateAiDecorations();

      // Debounced import resolution (resolve imports 500ms after user stops typing)
      if (importResolveTimerRef.current) {
        clearTimeout(importResolveTimerRef.current);
      }
      importResolveTimerRef.current = setTimeout(() => {
        void importResolver.resolveImports(value);
      }, 500);
    });

    const aiEnterDisposable = editorRef.current.onKeyDown(event => {
      const aiHandler = aiRequestRef.current;
      if (!aiHandler) return;
      if (event.keyCode !== monaco.KeyCode.Enter) {
        return;
      }

      const editor = editorRef.current;
      const model = editor?.getModel();
      const position = editor?.getPosition();
      if (!model || !position) {
        return;
      }

      const lineContent = model.getLineContent(position.lineNumber);
      const trimmed = lineContent.trimStart();
      if (!trimmed.length) {
        return;
      }

      const prefixes = ['/ai', ':ai'];
      let isAiCommand = false;

      // Check if line starts with AI command
      const matchedPrefix = prefixes.find(prefix => trimmed.startsWith(prefix));
      if (matchedPrefix) {
        const nextChar = trimmed.charAt(matchedPrefix.length);
        if (!nextChar || /\s/.test(nextChar)) {
          isAiCommand = true;
        }
      }

      // Check for inline AI command
      if (!isAiCommand) {
        for (const prefix of prefixes) {
          const inlinePattern = new RegExp(
            `\\s+//\\s*${prefix.replace('/', '\\/')}\\s+|\\s+${prefix.replace('/', '\\/')}\\s+`
          );
          if (inlinePattern.test(lineContent)) {
            isAiCommand = true;
            break;
          }
        }
      }

      if (!isAiCommand) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      aiHandler();
    });

    // Register format code handler - using Prettier for proper formatting
    const formatHandler = async () => {
      if (!editorRef.current) return;

      const model = editorRef.current.getModel();
      if (!model) return;

      const currentCode = model.getValue();
      if (!currentCode.trim()) return;

      try {
        const formatted = await prettier.format(currentCode, {
          parser: 'babel',
          plugins: [parserBabel, parserEstree],
          singleQuote: true,
          semi: true,
          trailingComma: 'all',
          printWidth: 80,
          tabWidth: 2,
        });

        // Only update if something actually changed (prevents resetting undo stack unnecessarily)
        if (formatted !== currentCode) {
          editorRef.current.executeEdits('prettier-format', [
            {
              range: model.getFullModelRange(),
              text: formatted,
            },
          ]);
          editorRef.current.pushUndoStop();
        }
      } catch (error) {
        console.error('Prettier formatting error:', error);
      }
    };
    setFormatCodeHandler(formatHandler);

    const markersListener = monaco.editor.onDidChangeMarkers(() => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      applyAiMarkerFilter();
    });

    return () => {
      disposable.dispose();
      aiEnterDisposable.dispose();
      markersListener.dispose();
      setFormatCodeHandler(null);
      setEditorInstance(null);

      // Clear import resolution timer
      if (importResolveTimerRef.current) {
        clearTimeout(importResolveTimerRef.current);
      }

      editorRef.current?.dispose();
      editorRef.current = null;
      aiDecorationsRef.current = [];
      aiLinesRef.current.clear();
      setEditorReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFormatCodeHandler]);

  // Update editor value when code changes externally (e.g., from history)
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);

      // Resolve imports when code is loaded externally
      if (code.includes('<import')) {
        void importResolver.resolveImports(code);
      }
    }
  }, [code]);

  // Update theme when color scheme changes
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  // Handle layout on container resize
  useEffect(() => {
    if (!editorReady || !containerRef.current || !editorRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [editorReady]);

  useMonacoClipboardHandlers({
    isEnabled: editorReady,
    editorRef,
    containerRef,
  });

  return <div ref={containerRef} style={{ height: '100%', overflow: 'hidden' }} />;
}
