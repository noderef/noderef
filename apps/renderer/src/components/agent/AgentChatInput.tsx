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

import { AgentMention, AgentMentionSuggestion } from '@/core/ipc/backend';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { useDesktopClipboardHandlers } from '@/hooks/useDesktopClipboardHandlers';
import type { QNameGroupedSuggestions } from '@/hooks/useQNameSuggestions';
import { Box } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Placeholder from '@tiptap/extension-placeholder';
import { ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import tippy from 'tippy.js';
import './AgentChatInput.css';
import { NodeMentionList, type MentionListRef } from './AgentChatSuggestionLists';
import { NodeIdentifierMention } from './NodeIdentifierMention';
import { QNameMention, findQNameSuggestionMatch } from './QNameMention';
import { QNameSuggestionList, type QNameListRef } from './QNameSuggestionList';

import { Extension } from '@tiptap/core';

const MIN_MENTION_POPUP_WIDTH = 320;
const POPUP_VIEWPORT_GUTTER = 12;
const POPUP_CONTAINER_WIDTH_FACTOR = 0.94;
const VALID_MENTION_TYPES = new Set<AgentMention['type']>(['node', 'person', 'group', 'server']);

function normalizeMentionType(value: unknown): AgentMention['type'] {
  return typeof value === 'string' && VALID_MENTION_TYPES.has(value as AgentMention['type'])
    ? (value as AgentMention['type'])
    : 'node';
}

export interface AgentChatInputRef {
  submit: () => void;
  focus: () => void;
}

export interface AgentChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, mentions: AgentMention[]) => void;
  disabled?: boolean;

  onMentionQueryChange: (query: string | null) => void;
  mentionItems: AgentMentionSuggestion[];
  mentionHasMore: boolean;
  mentionLoading: boolean;
  onLoadMoreMentions: () => void;

  // QName (colon) mention props
  qnameSuggestions: QNameGroupedSuggestions;
  onQNameQueryChange: (query: string | null) => void;
}

const ChatSubmitExtension = Extension.create({
  name: 'chatSubmit',
  addOptions() {
    return {
      shouldSubmit: (_editor: any) => true,
      onSubmit: (_editor: any) => {},
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.options.shouldSubmit(this.editor)) {
          return false;
        }
        this.options.onSubmit(this.editor);
        return true;
      },
      'Shift-Enter': () => {
        return this.editor.commands.setHardBreak();
      },
    };
  },
});

/**
 * Shared factory for suggestion popup lifecycle (tippy + ReactRenderer).
 * Used by both @ mentions and : (QName) mentions to avoid duplicated popup code.
 */
function createSuggestionPopupRenderer(config: {
  rendererRef: MutableRefObject<ReactRenderer<any> | null>;
  popupRef: MutableRefObject<any>;
  propsRef: MutableRefObject<Record<string, any>>;
  queryChangeRef: MutableRefObject<(query: string | null) => void>;
  Component: ComponentType<any>;
  getMentionReferenceClientRect: (clientRectFn?: () => DOMRect) => DOMRect;
  onStartExtra?: () => void;
}) {
  const {
    rendererRef,
    popupRef,
    propsRef,
    queryChangeRef,
    Component,
    getMentionReferenceClientRect,
    onStartExtra,
  } = config;

  return {
    onStart(props: any) {
      queryChangeRef.current(props.query);
      rendererRef.current = new ReactRenderer(Component, {
        props: { ...props, ...propsRef.current },
        editor: props.editor,
      });

      if (!props.clientRect) return;

      popupRef.current = tippy('body', {
        getReferenceClientRect: () =>
          getMentionReferenceClientRect(props.clientRect as () => DOMRect),
        appendTo: () => document.body,
        content: rendererRef.current.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'top-start',
        maxWidth: 'none',
        popperOptions: {
          modifiers: [
            { name: 'flip', enabled: false },
            { name: 'preventOverflow', options: { altAxis: false, padding: 8 } },
          ],
        },
      });

      onStartExtra?.();
    },

    onUpdate(props: any) {
      queryChangeRef.current(props.query);
      rendererRef.current?.updateProps({ ...props, ...propsRef.current });

      if (!props.clientRect) return;

      popupRef.current?.[0]?.setProps({
        getReferenceClientRect: () =>
          getMentionReferenceClientRect(props.clientRect as () => DOMRect),
      });
    },

    onKeyDown(props: any) {
      if (props.event.key === 'Escape') {
        popupRef.current?.[0]?.hide();
        return true;
      }

      if (popupRef.current?.[0] && !popupRef.current[0].state.isVisible) {
        return false;
      }

      return rendererRef.current?.ref?.onKeyDown(props) ?? false;
    },

    onExit() {
      queryChangeRef.current(null);
      if (popupRef.current?.[0] && !popupRef.current[0].state.isDestroyed) {
        popupRef.current[0].destroy();
      }
      rendererRef.current?.destroy();
      rendererRef.current = null;
      popupRef.current = null;
    },
  };
}

export const AgentChatInput = forwardRef<AgentChatInputRef, AgentChatInputProps>(
  (
    {
      value,
      onChange,
      onSend,
      disabled,
      onMentionQueryChange,
      mentionItems,
      mentionHasMore,
      mentionLoading,
      onLoadMoreMentions,
      qnameSuggestions,
      onQNameQueryChange,
    },
    ref
  ) => {
    const { t } = useTranslation('agent');

    const onSendRef = useRef(onSend);
    const onMentionQueryChangeRef = useRef(onMentionQueryChange);
    const onQNameQueryChangeRef = useRef(onQNameQueryChange);
    const disabledRef = useRef(disabled);
    const mentionPropsRef = useRef({
      items: mentionItems,
      hasMore: mentionHasMore,
      loading: mentionLoading,
      onLoadMore: onLoadMoreMentions,
      popupWidth: MIN_MENTION_POPUP_WIDTH,
    });
    const qnamePropsRef = useRef({
      suggestions: qnameSuggestions,
      popupWidth: MIN_MENTION_POPUP_WIDTH,
    });

    const mentionRendererRef = useRef<ReactRenderer<MentionListRef> | null>(null);
    const mentionPopupRef = useRef<any>(null);
    const qnameRendererRef = useRef<ReactRenderer<QNameListRef> | null>(null);
    const qnamePopupRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const isDesktopMode = useMemo(
      () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
      []
    );
    const editorAttributes = useMemo<Record<string, string>>(
      () => ({
        spellcheck: 'false',
        autocomplete: 'off',
        autocapitalize: isDesktopMode ? 'off' : 'sentences',
        autocorrect: isDesktopMode ? 'off' : 'on',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
      }),
      [isDesktopMode]
    );
    const [mentionPopupWidth, setMentionPopupWidth] = useState<number>(MIN_MENTION_POPUP_WIDTH);

    useEffect(() => {
      onSendRef.current = onSend;
    }, [onSend]);

    useEffect(() => {
      onMentionQueryChangeRef.current = onMentionQueryChange;
    }, [onMentionQueryChange]);

    useEffect(() => {
      onQNameQueryChangeRef.current = onQNameQueryChange;
    }, [onQNameQueryChange]);

    useEffect(() => {
      disabledRef.current = disabled;
    }, [disabled]);

    const getMentionReferenceClientRect = useCallback((clientRectFn?: () => DOMRect) => {
      const caretRect = clientRectFn?.();
      const containerRect = containerRef.current?.getBoundingClientRect();

      if (containerRect) {
        const top = caretRect?.top ?? containerRect.top;
        const bottom = caretRect?.bottom ?? top + Math.max(caretRect?.height ?? 18, 18);
        const width = Math.max(1, containerRect.width);
        const height = Math.max(1, bottom - top);
        return new DOMRect(containerRect.left, top, width, height);
      }

      if (caretRect) {
        return caretRect;
      }

      return new DOMRect(0, 0, 1, 1);
    }, []);

    useEffect(() => {
      mentionPropsRef.current = {
        items: mentionItems,
        hasMore: mentionHasMore,
        loading: mentionLoading,
        onLoadMore: onLoadMoreMentions,
        popupWidth: mentionPopupWidth,
      };

      if (mentionRendererRef.current) {
        mentionRendererRef.current.updateProps({
          ...mentionPropsRef.current,
        });
      }

      const popup = mentionPopupRef.current?.[0];
      if (popup && !popup.state.isDestroyed) {
        const shouldShow = mentionLoading || mentionItems.length > 0;
        if (shouldShow && !popup.state.isVisible) {
          popup.show();
        }
        if (!shouldShow && popup.state.isVisible) {
          popup.hide();
        }
      }
    }, [mentionItems, mentionHasMore, mentionLoading, onLoadMoreMentions, mentionPopupWidth]);

    // Sync QName suggestion props + popup visibility
    useEffect(() => {
      qnamePropsRef.current = {
        suggestions: qnameSuggestions,
        popupWidth: mentionPopupWidth,
      };

      if (qnameRendererRef.current) {
        qnameRendererRef.current.updateProps({
          ...qnamePropsRef.current,
        });
      }

      const popup = qnamePopupRef.current?.[0];
      if (popup && !popup.state.isDestroyed) {
        const hasItems =
          qnameSuggestions.types.length > 0 ||
          qnameSuggestions.aspects.length > 0 ||
          qnameSuggestions.properties.length > 0;
        if (hasItems && !popup.state.isVisible) {
          popup.show();
        }
        if (!hasItems && popup.state.isVisible) {
          popup.hide();
        }
      }
    }, [qnameSuggestions, mentionPopupWidth]);

    const calculateMentionPopupWidth = useCallback((): number => {
      const viewportWidth =
        typeof window !== 'undefined' ? window.innerWidth : MIN_MENTION_POPUP_WIDTH;
      const maxByViewport = Math.max(
        MIN_MENTION_POPUP_WIDTH,
        viewportWidth - POPUP_VIEWPORT_GUTTER
      );
      const containerWidth = containerRef.current?.getBoundingClientRect().width ?? maxByViewport;
      const targetWidth = containerWidth * POPUP_CONTAINER_WIDTH_FACTOR;

      return Math.round(Math.min(maxByViewport, Math.max(MIN_MENTION_POPUP_WIDTH, targetWidth)));
    }, []);

    useEffect(() => {
      const syncMentionPopupWidth = () => {
        setMentionPopupWidth(calculateMentionPopupWidth());
      };

      syncMentionPopupWidth();

      const resizeObserver =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => {
              syncMentionPopupWidth();
            })
          : null;
      if (resizeObserver && containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      window.addEventListener('resize', syncMentionPopupWidth);

      return () => {
        window.removeEventListener('resize', syncMentionPopupWidth);
        resizeObserver?.disconnect();
      };
    }, [calculateMentionPopupWidth]);

    const handleSend = (currentEditor: any) => {
      if (!currentEditor || disabledRef.current) {
        return;
      }

      const text = currentEditor.getText();
      const json = currentEditor.getJSON();
      const mentions: AgentMention[] = [];

      const traverse = (node: any) => {
        if (node.type === 'nodeMention' && node.attrs) {
          mentions.push({
            id: node.attrs.id,
            label: node.attrs.label,
            type: normalizeMentionType(node.attrs.type),
            path: node.attrs.path,
          });
        }
        if (node.content) {
          node.content.forEach(traverse);
        }
      };

      if (json.content) {
        json.content.forEach(traverse);
      }

      const uniqueMap = new Map();
      for (const m of mentions) {
        uniqueMap.set(`${m.type}-${m.id}`, m);
      }

      onSendRef.current(text, Array.from(uniqueMap.values()));
    };

    useImperativeHandle(ref, () => ({
      submit: () => {
        handleSend(editor);
      },
      focus: () => {
        if (editor) {
          editor.commands.focus('end');
          return;
        }
        const fallback = containerRef.current?.querySelector('.ProseMirror') as HTMLElement | null;
        fallback?.focus();
      },
    }));

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          horizontalRule: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
        }),
        Placeholder.configure({
          placeholder: t('composerPlaceholder'),
        }),
        NodeIdentifierMention.configure({
          suggestion: {
            char: '@',
            allowSpaces: true,
            render: () =>
              createSuggestionPopupRenderer({
                rendererRef: mentionRendererRef,
                popupRef: mentionPopupRef,
                propsRef: mentionPropsRef,
                queryChangeRef: onMentionQueryChangeRef,
                Component: NodeMentionList,
                getMentionReferenceClientRect,
              }),
          },
        }),
        QNameMention.configure({
          suggestion: {
            char: ':',
            findSuggestionMatch: findQNameSuggestionMatch,
            render: () =>
              createSuggestionPopupRenderer({
                rendererRef: qnameRendererRef,
                popupRef: qnamePopupRef,
                propsRef: qnamePropsRef,
                queryChangeRef: onQNameQueryChangeRef,
                Component: QNameSuggestionList,
                getMentionReferenceClientRect,
                onStartExtra: () => {
                  const s = qnamePropsRef.current as any;
                  const hasItems =
                    s.suggestions?.types?.length > 0 ||
                    s.suggestions?.aspects?.length > 0 ||
                    s.suggestions?.properties?.length > 0;
                  if (!hasItems) {
                    qnamePopupRef.current?.[0]?.hide();
                  }
                },
              }),
          },
        }),
        ChatSubmitExtension.configure({
          shouldSubmit: () => {
            const mentionPopup = mentionPopupRef.current?.[0];
            if (mentionPopup && !mentionPopup.state.isDestroyed && mentionPopup.state.isVisible) {
              return false;
            }
            const qnamePopup = qnamePopupRef.current?.[0];
            if (qnamePopup && !qnamePopup.state.isDestroyed && qnamePopup.state.isVisible) {
              return false;
            }
            return true;
          },
          onSubmit: (e: any) => {
            handleSend(e);
          },
        }),
      ],
      content: value,
      editable: !disabled,
      onUpdate({ editor }) {
        onChange(editor.getText());
      },
      editorProps: {
        attributes: editorAttributes,
      },
    });

    useEffect(() => {
      if (editor && value !== editor.getText()) {
        const t = setTimeout(() => {
          if (editor.getText() !== value) {
            editor.commands.setContent(value);
          }
        }, 0);
        return () => clearTimeout(t);
      }
    }, [editor, value]);

    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [editor, disabled]);

    const handleInsertText = useCallback(
      (editableTarget: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string) => {
        if (!editor || !text || disabledRef.current) {
          return;
        }

        if (!(editableTarget instanceof HTMLElement)) {
          return;
        }

        const isEditorTarget =
          editableTarget.isContentEditable ||
          editableTarget.classList.contains('ProseMirror') ||
          Boolean(editableTarget.closest('.ProseMirror'));
        if (!isEditorTarget) {
          return;
        }

        const normalized = text.replace(/\r\n/g, '\n');
        const lines = normalized.split('\n');
        const content: Array<Record<string, unknown>> = [];

        lines.forEach((line, index) => {
          if (line.length > 0) {
            content.push({ type: 'text', text: line });
          }
          if (index < lines.length - 1) {
            content.push({ type: 'hardBreak' });
          }
        });

        if (content.length === 0) {
          return;
        }

        editor.chain().focus().insertContent(content).run();
      },
      [editor]
    );

    useDesktopClipboardHandlers({
      isEnabled: isDesktopMode && !disabled,
      containerRef,
      onInsertText: handleInsertText,
    });

    return (
      <Box
        ref={containerRef}
        className="agent-chat-input"
        style={{
          width: '100%',
        }}
      >
        <RichTextEditor
          editor={editor}
          styles={{
            root: {
              border: 'none',
              backgroundColor: 'transparent',
            },
            content: {
              backgroundColor: 'transparent',
              padding: 0,
              fontSize: 'var(--mantine-font-size-sm)',
              '> div': {
                minHeight: 64,
                maxHeight: 300,
                overflowY: 'auto',
              },
            },
          }}
        >
          <RichTextEditor.Content />
        </RichTextEditor>
      </Box>
    );
  }
);

AgentChatInput.displayName = 'AgentChatInput';
