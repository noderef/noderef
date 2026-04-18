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
type TextInputTarget = HTMLInputElement | HTMLTextAreaElement;

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

const isTextInputTarget = (target: EditableTarget | null): target is TextInputTarget =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

const stopHandledEvent = (event: Event) => {
  event.preventDefault();
  event.stopPropagation();
};

const getTextInputTargetInContainer = (
  target: EventTarget | null,
  container: HTMLElement
): TextInputTarget | null => {
  const editableTarget = getEditableTarget(target);
  if (!isTextInputTarget(editableTarget)) return null;
  return container.contains(editableTarget) ? editableTarget : null;
};

const isNodeWithinContainer = (node: Node | null | undefined, container: HTMLElement): boolean => {
  if (!node) return false;
  const resolvedNode =
    node.nodeType === Node.TEXT_NODE ? (node.parentElement ?? node.parentNode) : node;
  if (!resolvedNode) return false;
  return resolvedNode === container || container.contains(resolvedNode);
};

const getSelectionTextInContainer = (container: HTMLElement): string => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return '';

  const anchorInside = isNodeWithinContainer(selection.anchorNode, container);
  const focusInside = isNodeWithinContainer(selection.focusNode, container);
  if (!anchorInside && !focusInside) return '';

  const anchorEditable = getEditableTarget(selection.anchorNode);
  const focusEditable = getEditableTarget(selection.focusNode);
  if (anchorEditable || focusEditable) return '';

  return selection.toString();
};

/**
 * Centralized clipboard handler for desktop (Neutralino) and browser fallback cases.
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
    const releasePasteLock = () => {
      setTimeout(() => {
        isProcessingPaste = false;
      }, 50);
    };

    const copyEditableSelection = async (
      target: TextInputTarget,
      event?: ClipboardEvent
    ): Promise<boolean> => {
      const selectedText = getSelectedText(target);
      if (!selectedText) return false;
      return writeClipboardText(selectedText, event);
    };

    const copyReadOnlySelection = async (
      container: HTMLElement,
      event?: ClipboardEvent
    ): Promise<boolean> => {
      const selectedText = getSelectionTextInContainer(container);
      if (!selectedText) return false;
      return writeClipboardText(selectedText, event);
    };

    const pasteIntoTarget = async (
      target: EditableTarget,
      event?: ClipboardEvent | KeyboardEvent
    ): Promise<boolean> => {
      if (!onInsertText) return false;
      if (isProcessingPaste) {
        if (event) stopHandledEvent(event);
        return false;
      }

      if (event) {
        stopHandledEvent(event);
      }
      isProcessingPaste = true;

      try {
        const text = await readClipboardText(event instanceof ClipboardEvent ? event : undefined);
        if (!text) return false;
        onInsertText(target, text);
        return true;
      } finally {
        releasePasteLock();
      }
    };

    const handleSelectAllShortcut = (event: KeyboardEvent, container: HTMLElement): boolean => {
      if (event.key.toLowerCase() !== 'a' || !enableCopyCut) return false;

      const target = getTextInputTargetInContainer(event.target, container);
      if (!target) return false;

      stopHandledEvent(event);
      target.focus();
      target.setSelectionRange(0, target.value.length);
      return true;
    };

    const handleEditableCopyCutShortcut = async (
      event: KeyboardEvent,
      container: HTMLElement
    ): Promise<boolean> => {
      const key = event.key.toLowerCase();
      if ((key !== 'c' && key !== 'x') || !enableCopyCut) return false;

      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget || !container.contains(editableTarget)) return false;
      if (!isTextInputTarget(editableTarget)) return true;

      const selectedText = getSelectedText(editableTarget);
      if (!selectedText) return true;

      stopHandledEvent(event);
      const copied = await writeClipboardText(selectedText);
      if (!copied) return true;
      if (key === 'x' && onInsertText) {
        onInsertText(editableTarget, '');
      }
      return true;
    };

    const handleReadOnlyCopyShortcut = async (
      event: KeyboardEvent,
      container: HTMLElement
    ): Promise<boolean> => {
      if (event.key.toLowerCase() !== 'c' || !enableReadOnlyCopy) return false;

      const selectedText = getSelectionTextInContainer(container);
      if (!selectedText) return false;

      stopHandledEvent(event);
      await writeClipboardText(selectedText);
      return true;
    };

    const handlePasteShortcut = async (
      event: KeyboardEvent,
      container: HTMLElement
    ): Promise<boolean> => {
      if (event.key.toLowerCase() !== 'v' || !onInsertText) return false;

      const target = getEditableTarget(event.target);
      if (!target || !container.contains(target)) return false;

      return pasteIntoTarget(target, event);
    };

    const handlePaste = async (event: ClipboardEvent) => {
      if (!onInsertText) return;

      const container = containerRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget) return;
      if (!container.contains(editableTarget)) return;

      await pasteIntoTarget(editableTarget, event);
    };

    const handleCopy = async (event: ClipboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Handle copy from editable targets
      if (enableCopyCut) {
        const target = getTextInputTargetInContainer(event.target, container);
        if (target) {
          const copied = await copyEditableSelection(target, event);
          if (copied) return;
        }
      }

      // Handle copy from read-only content (e.g., tables in NodeBrowser)
      if (enableReadOnlyCopy) {
        await copyReadOnlySelection(container, event);
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const container = containerRef.current;
      if (!container) return;

      if (handleSelectAllShortcut(event, container)) return;
      if (await handleEditableCopyCutShortcut(event, container)) return;
      if (await handleReadOnlyCopyShortcut(event, container)) return;
      await handlePasteShortcut(event, container);
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
