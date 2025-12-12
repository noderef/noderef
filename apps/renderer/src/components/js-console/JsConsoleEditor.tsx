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

import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { initMonaco } from '@/core/monaco/setup';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useComputedColorScheme } from '@mantine/core';
import { clipboard } from '@neutralinojs/lib';
import * as monaco from 'monaco-editor';
import { ICodeEditorService } from 'monaco-editor/esm/vs/editor/browser/services/codeEditorService';
import { CommandsRegistry } from 'monaco-editor/esm/vs/platform/commands/common/commands';
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
  useEffect(() => {
    aiRequestRef.current = onAiRequest;
  }, [onAiRequest]);
  const setEditorInstance = useJsConsoleStore(state => state.setEditorInstance);
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const monacoTheme = computedColorScheme === 'dark' ? 'vs-dark' : 'vs';

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

      // Filter out all markers (typescript, javascript) on AI command lines
      const allMarkers = monaco.editor.getModelMarkers({ resource: model.uri });
      const markersByOwner = new Map<string, typeof allMarkers>();

      for (const marker of allMarkers) {
        const owner = marker.owner;
        if (!markersByOwner.has(owner)) {
          markersByOwner.set(owner, []);
        }
        markersByOwner.get(owner)!.push(marker);
      }

      // Clear markers for each owner, filtering out AI lines
      for (const [owner, markers] of markersByOwner.entries()) {
        const filtered = markers.filter(marker => !aiLinesRef.current.has(marker.startLineNumber));
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
      editorRef.current?.dispose();
      editorRef.current = null;
      aiDecorationsRef.current = [];
      aiLinesRef.current.clear();
      setEditorReady(false);
    };
  }, [setFormatCodeHandler]);

  // Update editor value when code changes externally (e.g., from history)
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
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

  // Handle clipboard operations for desktop compatibility
  useEffect(() => {
    if (!editorReady || !containerRef.current || !editorRef.current) return;

    const editor = editorRef.current;
    const container = containerRef.current;
    let skipNextPasteEvent = false;

    const handleContainerClick = (event: MouseEvent) => {
      if (event.target === container) {
        editor.focus();
      }
    };

    const readClipboardText = async (event?: ClipboardEvent): Promise<string | null> => {
      const clipboardData = event?.clipboardData || (window as any).clipboardData;
      const textFromEvent = clipboardData?.getData?.('text/plain');
      if (textFromEvent) return textFromEvent;

      if (isNeutralinoMode()) {
        try {
          await ensureNeutralinoReady();
          const neutralinoText = await clipboard.readText();
          if (neutralinoText) return neutralinoText;
        } catch (neutralinoError) {
          console.error('Neutralino clipboard read failed:', neutralinoError);
        }
      }

      if (navigator.clipboard?.readText) {
        try {
          const navigatorText = await navigator.clipboard.readText();
          if (navigatorText) return navigatorText;
        } catch {
          // Ignore and fall through
        }
      }

      return null;
    };

    const getEditorSelectionText = (): string => {
      const model = editor.getModel();
      if (!model) return '';
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) return '';
      return model.getValueInRange(selection);
    };

    const writeClipboardText = async (text: string, event?: ClipboardEvent): Promise<boolean> => {
      if (!text) return false;

      const stopEvent = () => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      const clipboardData = event?.clipboardData;
      if (clipboardData) {
        clipboardData.setData('text/plain', text);
        stopEvent();
        return true;
      }

      if (isNeutralinoMode()) {
        try {
          await ensureNeutralinoReady();
          await clipboard.writeText(text);
          stopEvent();
          return true;
        } catch (neutralinoError) {
          console.error('Neutralino clipboard write failed:', neutralinoError);
        }
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          stopEvent();
          return true;
        } catch {
          // Ignore and fall through
        }
      }

      return false;
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

    const pasteText = async (
      event?: ClipboardEvent,
      source: 'event' | 'action' = 'event'
    ): Promise<boolean> => {
      if (source === 'action') {
        skipNextPasteEvent = true;
      }

      const text = await readClipboardText(event);
      if (!text) return false;

      if (!editor.hasTextFocus()) {
        editor.focus();
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) {
        const position = editor.getPosition();
        if (!position) return false;

        editor.executeEdits('paste', [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            ),
            text,
          },
        ]);
        return true;
      }

      editor.executeEdits('paste', [
        {
          range: selection,
          text,
        },
      ]);
      return true;
    };

    const handlePaste = async (event: ClipboardEvent) => {
      const target = event.target as Node;
      const monacoContainer = editor.getContainerDomNode();
      const isMonacoTarget = monacoContainer && monacoContainer.contains(target);
      const isContainerTarget = target === container;

      if (!isMonacoTarget && !isContainerTarget) {
        return;
      }

      if (skipNextPasteEvent) {
        skipNextPasteEvent = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      await pasteText(event, 'event');
    };

    const handleCopy = async (event: ClipboardEvent) => {
      const target = event.target as Node;
      const monacoContainer = editor.getContainerDomNode();
      const isMonacoTarget = monacoContainer && monacoContainer.contains(target);
      const isContainerTarget = target === container;

      if (!isMonacoTarget && !isContainerTarget) {
        return;
      }

      await performCopy(event);
    };

    const handleCut = async (event: ClipboardEvent) => {
      const target = event.target as Node;
      const monacoContainer = editor.getContainerDomNode();
      const isMonacoTarget = monacoContainer && monacoContainer.contains(target);
      const isContainerTarget = target === container;

      if (!isMonacoTarget && !isContainerTarget) {
        return;
      }

      await performCut(event);
    };

    const handleBeforeInput = async (event: InputEvent) => {
      if (event.inputType !== 'insertFromPaste') return;

      const target = event.target as Node;
      const monacoContainer = editor.getContainerDomNode();
      const isMonacoTarget = monacoContainer && monacoContainer.contains(target);
      const isContainerTarget = target === container;

      if (!isMonacoTarget && !isContainerTarget) return;

      event.preventDefault();
      event.stopPropagation();
      await pasteText(undefined, 'action');
    };

    const commandOverrideDisposables: Array<{ dispose: () => void }> = [];

    const overrideCommand = (commandId: string, handler: () => Promise<boolean> | boolean) => {
      const previous = CommandsRegistry.getCommand(commandId);
      const disposable = CommandsRegistry.registerCommand(
        commandId,
        async (accessor: any, ...args: any[]) => {
          const codeEditorService = accessor.get(ICodeEditorService);
          const focusedEditor = codeEditorService.getFocusedCodeEditor();
          if (focusedEditor !== editor) {
            return previous?.handler ? previous.handler(accessor, ...args) : undefined;
          }
          const handled = await handler();
          if (!handled && previous?.handler) {
            return previous.handler(accessor, ...args);
          }
          return undefined;
        }
      );
      commandOverrideDisposables.push(disposable);
    };

    overrideCommand('editor.action.clipboardPasteAction', () => pasteText(undefined, 'action'));
    overrideCommand('editor.action.clipboardCopyAction', () => performCopy());
    overrideCommand('editor.action.clipboardCutAction', () => performCut());

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
      void pasteText(undefined, 'action');
    });
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Insert, () => {
      void pasteText(undefined, 'action');
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
      void performCopy();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Insert, () => {
      void performCopy();
    });

    window.addEventListener('beforeinput', handleBeforeInput, true);
    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('cut', handleCut, true);
    container.addEventListener('click', handleContainerClick);

    return () => {
      container.removeEventListener('click', handleContainerClick);
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('cut', handleCut, true);
      window.removeEventListener('beforeinput', handleBeforeInput, true);
      commandOverrideDisposables.forEach(disposable => disposable.dispose());
    };
  }, [editorReady]);

  return <div ref={containerRef} style={{ height: '100%', overflow: 'hidden' }} />;
}
