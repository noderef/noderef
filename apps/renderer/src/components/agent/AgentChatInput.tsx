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

import { AgentMentionSuggestion } from '@/core/ipc/backend';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { useDesktopClipboardHandlers } from '@/hooks/useDesktopClipboardHandlers';
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
} from 'react';
import { useTranslation } from 'react-i18next';
import tippy from 'tippy.js';
import './AgentChatInput.css';
import { NodeMentionList, type MentionListRef } from './AgentChatSuggestionLists';
import { NodeIdentifierMention } from './NodeIdentifierMention';

import { Extension } from '@tiptap/core';

const MIN_MENTION_POPUP_WIDTH = 320;
const POPUP_VIEWPORT_GUTTER = 12;
const POPUP_CONTAINER_WIDTH_FACTOR = 0.94;

export interface AgentChatInputRef {
  submit: () => void;
  focus: () => void;
}

export interface AgentChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, mentions: AgentMentionSuggestion[]) => void;
  disabled?: boolean;

  onMentionQueryChange: (query: string | null) => void;
  mentionItems: AgentMentionSuggestion[];
  mentionHasMore: boolean;
  mentionLoading: boolean;
  onLoadMoreMentions: () => void;
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
    },
    ref
  ) => {
    const { t } = useTranslation('agent');

    const onSendRef = useRef(onSend);
    const onMentionQueryChangeRef = useRef(onMentionQueryChange);
    const disabledRef = useRef(disabled);
    const mentionPropsRef = useRef({
      items: mentionItems,
      hasMore: mentionHasMore,
      loading: mentionLoading,
      onLoadMore: onLoadMoreMentions,
      popupWidth: MIN_MENTION_POPUP_WIDTH,
    });

    const mentionRendererRef = useRef<ReactRenderer<MentionListRef> | null>(null);
    const mentionPopupRef = useRef<any>(null);
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
      const mentions: AgentMentionSuggestion[] = [];

      const traverse = (node: any) => {
        if (node.type === 'nodeMention' && node.attrs) {
          mentions.push({
            id: node.attrs.id,
            label: node.attrs.label,
            type: node.attrs.type || 'node',
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
            render: () => {
              return {
                onStart: (props: any) => {
                  onMentionQueryChangeRef.current(props.query);
                  mentionRendererRef.current = new ReactRenderer(NodeMentionList, {
                    props: {
                      ...props,
                      ...mentionPropsRef.current,
                    },
                    editor: props.editor,
                  });

                  if (!props.clientRect) {
                    return;
                  }

                  mentionPopupRef.current = tippy('body', {
                    getReferenceClientRect: () =>
                      getMentionReferenceClientRect(props.clientRect as () => DOMRect),
                    appendTo: () => document.body,
                    content: mentionRendererRef.current.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'top-start',
                    maxWidth: 'none',
                    popperOptions: {
                      modifiers: [
                        { name: 'flip', enabled: false },
                        {
                          name: 'preventOverflow',
                          options: { altAxis: false, padding: 8 },
                        },
                      ],
                    },
                  });
                },

                onUpdate(props: any) {
                  onMentionQueryChangeRef.current(props.query);
                  mentionRendererRef.current?.updateProps({
                    ...props,
                    ...mentionPropsRef.current,
                  });

                  if (!props.clientRect) {
                    return;
                  }

                  mentionPopupRef.current?.[0]?.setProps({
                    getReferenceClientRect: () =>
                      getMentionReferenceClientRect(props.clientRect as () => DOMRect),
                  });
                },

                onKeyDown(props: any) {
                  if (props.event.key === 'Escape') {
                    mentionPopupRef.current?.[0]?.hide();
                    return true;
                  }

                  if (mentionPopupRef.current?.[0] && !mentionPopupRef.current[0].state.isVisible) {
                    return false;
                  }

                  return mentionRendererRef.current?.ref?.onKeyDown(props) ?? false;
                },

                onExit() {
                  onMentionQueryChangeRef.current(null);
                  if (
                    mentionPopupRef.current?.[0] &&
                    !mentionPopupRef.current[0].state.isDestroyed
                  ) {
                    mentionPopupRef.current[0].destroy();
                  }
                  mentionRendererRef.current?.destroy();
                  mentionRendererRef.current = null;
                  mentionPopupRef.current = null;
                },
              };
            },
          },
        }),
        ChatSubmitExtension.configure({
          shouldSubmit: () => {
            const mentionPopup = mentionPopupRef.current?.[0];
            if (mentionPopup && !mentionPopup.state.isDestroyed && mentionPopup.state.isVisible) {
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
