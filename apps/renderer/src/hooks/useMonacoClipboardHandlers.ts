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

import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { readClipboardText, writeClipboardText } from '@/core/utils/clipboard';
import * as monaco from 'monaco-editor';
import { ICodeEditorService } from 'monaco-editor/esm/vs/editor/browser/services/codeEditorService';
import { CommandsRegistry } from 'monaco-editor/esm/vs/platform/commands/common/commands';
import { useEffect, type RefObject } from 'react';

type UseMonacoClipboardHandlersOptions = {
  isEnabled: boolean;
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  containerRef: RefObject<HTMLDivElement | null>;
};

const isEventInEditor = (
  event: Event,
  editor: monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement
): boolean => {
  const target = event.target as Node;
  const monacoContainer = editor.getContainerDomNode();
  return Boolean(monacoContainer?.contains(target)) || target === container;
};

/**
 * Clipboard handling for Monaco editors in Neutralino (desktop) mode.
 *
 * Neutralino's webview does not wire clipboard APIs the same way as a browser,
 * so Ctrl+C/V/X and paste events need custom handlers using readClipboardText /
 * writeClipboardText.
 */
export const useMonacoClipboardHandlers = ({
  isEnabled,
  editorRef,
  containerRef,
}: UseMonacoClipboardHandlersOptions) => {
  useEffect(() => {
    if (!isEnabled || !editorRef.current || !containerRef.current) return;

    const editor = editorRef.current;
    const container = containerRef.current;

    let isProcessingPaste = false;

    const handleContainerClick = (event: MouseEvent) => {
      if (event.target === container) {
        editor.focus();
      }
    };

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

    const pasteText = async (event?: ClipboardEvent): Promise<boolean> => {
      if (isProcessingPaste) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        return false;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      isProcessingPaste = true;

      try {
        const text = await readClipboardText(event);
        if (!text) return false;

        if (!editor.hasTextFocus()) {
          editor.focus();
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
          editor.pushUndoStop();
          return true;
        }

        editor.executeEdits('paste', [
          {
            range: selection,
            text,
          },
        ]);
        editor.pushUndoStop();
        return true;
      } finally {
        setTimeout(() => {
          isProcessingPaste = false;
        }, 50);
      }
    };

    const handlePaste = async (event: ClipboardEvent) => {
      if (!isEventInEditor(event, editor, container)) return;
      await pasteText(event);
    };

    const handleCopy = async (event: ClipboardEvent) => {
      if (!isEventInEditor(event, editor, container)) return;
      await performCopy(event);
    };

    const handleCut = async (event: ClipboardEvent) => {
      if (!isEventInEditor(event, editor, container)) return;
      await performCut(event);
    };

    const handleBeforeInput = async (event: InputEvent) => {
      if (event.inputType !== 'insertFromPaste') return;
      if (!isEventInEditor(event, editor, container)) return;

      event.preventDefault();
      event.stopPropagation();
      await pasteText();
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

    container.addEventListener('click', handleContainerClick);

    if (!isNeutralinoMode()) {
      return () => {
        container.removeEventListener('click', handleContainerClick);
      };
    }

    overrideCommand('editor.action.clipboardPasteAction', () => pasteText());
    overrideCommand('editor.action.clipboardCopyAction', () => performCopy());
    overrideCommand('editor.action.clipboardCutAction', () => performCut());

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
      void pasteText();
    });
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Insert, () => {
      void pasteText();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
      void performCopy();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Insert, () => {
      void performCopy();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
      void performCut();
    });

    window.addEventListener('beforeinput', handleBeforeInput, true);
    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('cut', handleCut, true);

    return () => {
      container.removeEventListener('click', handleContainerClick);
      window.removeEventListener('beforeinput', handleBeforeInput, true);
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('cut', handleCut, true);
      commandOverrideDisposables.forEach(disposable => disposable.dispose());
    };
  }, [isEnabled, editorRef, containerRef]);
};
