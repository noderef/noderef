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

import { readClipboardText, writeClipboardText } from '@/core/utils/clipboard';
import { useEffect, type RefObject } from 'react';

export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type DesktopClipboardHandlersOptions = {
  isEnabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Handler for inserting pasted text. Required when paste support is needed. */
  onInsertText?: (target: EditableTarget, text: string) => void;
  /** Enable copy/cut for editable targets (input fields, textareas) */
  enableCopyCut?: boolean;
  /** Enable Ctrl+C copy for selected text in read-only (non-editable) content areas */
  enableReadOnlyCopy?: boolean;
  getSelectedText?: (target: HTMLInputElement | HTMLTextAreaElement) => string;
};

const getEditableTarget = (target: EventTarget | null): EditableTarget | null => {
  if (!target) return null;
  let node: HTMLElement | null = null;
  if (target instanceof HTMLElement) {
    node = target;
  } else if (target instanceof Node && target.parentElement) {
    node = target.parentElement;
  }
  while (node) {
    if (
      node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node.isContentEditable
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

const defaultGetSelectedText = (target: HTMLInputElement | HTMLTextAreaElement): string => {
  const { selectionStart, selectionEnd, value } = target;
  if (selectionStart === null || selectionEnd === null) return '';
  if (selectionStart === selectionEnd) return '';
  return value.slice(selectionStart, selectionEnd);
};

/**
 * Centralized clipboard handler for desktop (Neutralino) mode.
 *
 * Supports:
 * - Paste into editable targets (requires onInsertText)
 * - Copy/cut from editable targets (enableCopyCut)
 * - Copy selected text from read-only content (enableReadOnlyCopy) - useful for NodeBrowser tables
 */
export const useDesktopClipboardHandlers = ({
  isEnabled,
  containerRef,
  onInsertText,
  enableCopyCut = false,
  enableReadOnlyCopy = false,
  getSelectedText = defaultGetSelectedText,
}: DesktopClipboardHandlersOptions) => {
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let isProcessingPaste = false;

    const handlePaste = async (event: ClipboardEvent) => {
      if (!onInsertText) return;

      if (isProcessingPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget) return;
      if (!container.contains(editableTarget)) return;

      event.preventDefault();
      event.stopPropagation();
      isProcessingPaste = true;

      try {
        const text = await readClipboardText(event);
        if (text) {
          onInsertText(editableTarget, text);
        }
      } finally {
        setTimeout(() => {
          isProcessingPaste = false;
        }, 50);
      }
    };

    const handleCopy = async (event: ClipboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const target = event.target as HTMLElement | null;
      if (!target || !container.contains(target)) return;

      // Handle copy from editable targets
      if (enableCopyCut) {
        const editableTarget = getEditableTarget(event.target);
        if (
          editableTarget &&
          (editableTarget instanceof HTMLInputElement ||
            editableTarget instanceof HTMLTextAreaElement)
        ) {
          const selectedText = getSelectedText(editableTarget);
          if (selectedText) {
            await writeClipboardText(selectedText, event);
            return;
          }
        }
      }

      // Handle copy from read-only content (e.g., tables in NodeBrowser)
      if (enableReadOnlyCopy) {
        const editableTarget = getEditableTarget(event.target);
        // Only handle if not in an editable element
        if (!editableTarget) {
          const selection = window.getSelection();
          const selectedText = selection?.toString() || '';
          if (selectedText) {
            event.preventDefault();
            event.stopPropagation();
            if (event.clipboardData) {
              event.clipboardData.setData('text/plain', selectedText);
            } else {
              await writeClipboardText(selectedText);
            }
          }
        }
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();
      const container = containerRef.current;
      if (!container) return;

      const target = event.target as HTMLElement | null;
      if (!target || !container.contains(target)) return;

      // Handle Ctrl+C/X for copy/cut
      if (key === 'c' || key === 'x') {
        const editableTarget = getEditableTarget(event.target);

        // Handle editable targets (enableCopyCut)
        if (enableCopyCut && editableTarget) {
          if (
            editableTarget instanceof HTMLInputElement ||
            editableTarget instanceof HTMLTextAreaElement
          ) {
            const selectedText = getSelectedText(editableTarget);
            if (!selectedText) return;

            event.preventDefault();
            event.stopPropagation();
            const success = await writeClipboardText(selectedText);
            if (success && key === 'x' && onInsertText) {
              onInsertText(editableTarget, '');
            }
          }
          return;
        }

        // Handle read-only content (enableReadOnlyCopy) - only for copy, not cut
        if (enableReadOnlyCopy && key === 'c' && !editableTarget) {
          const selection = window.getSelection();
          const selectedText = selection?.toString() || '';
          if (selectedText) {
            event.preventDefault();
            event.stopPropagation();
            await writeClipboardText(selectedText);
          }
        }
        return;
      }

      // Handle Ctrl+V for paste
      if (key === 'v' && onInsertText) {
        if (isProcessingPaste) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const editableTarget = getEditableTarget(event.target);
        if (!editableTarget) return;

        event.preventDefault();
        event.stopPropagation();
        isProcessingPaste = true;

        try {
          const text = await readClipboardText();
          if (text) {
            onInsertText(editableTarget, text);
          }
        } finally {
          setTimeout(() => {
            isProcessingPaste = false;
          }, 50);
        }
      }
    };

    // Add paste handler only if onInsertText is provided
    if (onInsertText) {
      window.addEventListener('paste', handlePaste, true);
    }
    // Add copy handler if any copy feature is enabled
    if (enableCopyCut || enableReadOnlyCopy) {
      window.addEventListener('copy', handleCopy, true);
    }
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      if (onInsertText) {
        window.removeEventListener('paste', handlePaste, true);
      }
      if (enableCopyCut || enableReadOnlyCopy) {
        window.removeEventListener('copy', handleCopy, true);
      }
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isEnabled, containerRef, onInsertText, enableCopyCut, enableReadOnlyCopy, getSelectedText]);
};
