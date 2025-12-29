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

import { readClipboardText, writeClipboardText } from '@/core/utils/clipboard';
import { useEffect, type RefObject } from 'react';

export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type DesktopClipboardHandlersOptions = {
  isEnabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onInsertText: (target: EditableTarget, text: string) => void;
  enableCopyCut?: boolean;
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

export const useDesktopClipboardHandlers = ({
  isEnabled,
  containerRef,
  onInsertText,
  enableCopyCut = false,
  getSelectedText = defaultGetSelectedText,
}: DesktopClipboardHandlersOptions) => {
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let isProcessingPaste = false;

    const handlePaste = async (event: ClipboardEvent) => {
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
      if (!enableCopyCut) return;

      const container = containerRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget) return;
      if (!container.contains(editableTarget)) return;

      if (
        editableTarget instanceof HTMLInputElement ||
        editableTarget instanceof HTMLTextAreaElement
      ) {
        const selectedText = getSelectedText(editableTarget);
        if (selectedText) {
          await writeClipboardText(selectedText, event);
        }
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();

      if (enableCopyCut && (key === 'c' || key === 'x')) {
        const container = containerRef.current;
        if (!container) return;
        const editableTarget = getEditableTarget(event.target);
        if (!editableTarget || !container.contains(editableTarget)) {
          return;
        }

        if (
          editableTarget instanceof HTMLInputElement ||
          editableTarget instanceof HTMLTextAreaElement
        ) {
          const selectedText = getSelectedText(editableTarget);
          if (!selectedText) return;

          event.preventDefault();
          event.stopPropagation();
          const success = await writeClipboardText(selectedText);
          if (success && key === 'x') {
            onInsertText(editableTarget, '');
          }
        }
        return;
      }

      if (key !== 'v') return;

      if (isProcessingPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget || !container.contains(editableTarget)) {
        return;
      }

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
    };

    window.addEventListener('paste', handlePaste, true);
    if (enableCopyCut) {
      window.addEventListener('copy', handleCopy, true);
    }
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('paste', handlePaste, true);
      if (enableCopyCut) {
        window.removeEventListener('copy', handleCopy, true);
      }
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isEnabled, containerRef, onInsertText, enableCopyCut, getSelectedText]);
};
