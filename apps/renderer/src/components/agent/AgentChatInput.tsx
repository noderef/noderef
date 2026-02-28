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
import Suggestion from '@tiptap/suggestion';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import tippy from 'tippy.js';
import './AgentChatInput.css';
import {
  ConstraintList,
  NodeMentionList,
  type ConstraintListRef,
  type MentionListRef,
} from './AgentChatSuggestionLists';
import { ConstraintHighlighter } from './ConstraintHighlighter';
import { NodeIdentifierMention } from './NodeIdentifierMention';

import { Extension } from '@tiptap/core';

export interface AgentChatInputRef {
  submit: () => void;
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

const CONSTRAINT_ITEMS = ['type', 'aspect', 'prop', 'site', 'path'];

const ChatSubmitExtension = Extension.create({
  name: 'chatSubmit',
  addOptions() {
    return {
      onSubmit: (_editor: any) => {},
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        this.options.onSubmit(this.editor);
        return true;
      },
      'Shift-Enter': () => {
        return this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock(),
        ]);
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

    // Refs to always access latest props in tiptap suggestion callbacks
    const onSendRef = useRef(onSend);
    const onMentionQueryChangeRef = useRef(onMentionQueryChange);
    const disabledRef = useRef(disabled);
    const mentionPropsRef = useRef({
      items: mentionItems,
      hasMore: mentionHasMore,
      loading: mentionLoading,
      onLoadMore: onLoadMoreMentions,
    });

    const mentionRendererRef = useRef<ReactRenderer<MentionListRef> | null>(null);
    const mentionPopupRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const isDesktopMode = useMemo(
      () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
      []
    );

    useEffect(() => {
      onSendRef.current = onSend;
    }, [onSend]);

    useEffect(() => {
      onMentionQueryChangeRef.current = onMentionQueryChange;
    }, [onMentionQueryChange]);

    useEffect(() => {
      disabledRef.current = disabled;
    }, [disabled]);

    useEffect(() => {
      mentionPropsRef.current = {
        items: mentionItems,
        hasMore: mentionHasMore,
        loading: mentionLoading,
        onLoadMore: onLoadMoreMentions,
      };

      if (mentionRendererRef.current) {
        mentionRendererRef.current.updateProps({
          ...mentionPropsRef.current,
        });
      }
    }, [mentionItems, mentionHasMore, mentionLoading, onLoadMoreMentions]);

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

      // Deduplicate by id+type
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
    }));

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // Disable features we don't need for a simple chat input
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
        ConstraintHighlighter,
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
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                    appendTo: () => document.body,
                    content: mentionRendererRef.current.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'top-start',
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
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                  });
                },

                onKeyDown(props: any) {
                  if (props.event.key === 'Escape') {
                    mentionPopupRef.current?.[0]?.hide();
                    return true;
                  }

                  if (mentionPopupRef.current?.[0] && !mentionPopupRef.current[0].state.isVisible) {
                    return false; // let the editor handle it if the popup is hidden
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
        Extension.create({
          name: 'constraintSuggestion',
          addProseMirrorPlugins() {
            return [
              Suggestion({
                editor: this.editor,
                char: ':',
                allowSpaces: false,
                items: ({ query }: { query: string }) => {
                  return CONSTRAINT_ITEMS.filter(item =>
                    item.toLowerCase().startsWith(query.toLowerCase())
                  );
                },
                command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
                  // Insert the constraint text
                  editor.chain().focus().insertContentAt(range, `${props.id}:`).run();
                },
                render: () => {
                  let component: ReactRenderer<ConstraintListRef>;
                  let popup: any;

                  return {
                    onStart: (props: any) => {
                      component = new ReactRenderer(ConstraintList, {
                        props,
                        editor: props.editor,
                      });

                      if (!props.clientRect) {
                        return;
                      }

                      popup = tippy('body', {
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: 'top-start',
                      });
                    },

                    onUpdate(props: any) {
                      component?.updateProps(props);

                      if (!props.clientRect) {
                        return;
                      }

                      popup?.[0]?.setProps({
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                      });
                    },

                    onKeyDown(props: any) {
                      if (props.event.key === 'Escape') {
                        popup?.[0]?.hide();
                        return true;
                      }

                      if (popup?.[0] && !popup[0].state.isVisible) {
                        return false; // let the editor handle it if the popup is hidden
                      }

                      return component?.ref?.onKeyDown(props) ?? false;
                    },

                    onExit() {
                      if (popup?.[0] && !popup[0].state.isDestroyed) {
                        popup[0].destroy();
                      }
                      component?.destroy();
                    },
                  };
                },
              }),
            ];
          },
        }),
        ChatSubmitExtension.configure({
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
    });

    // Sync external value changes (e.g. when cleared after sending)
    // We only sync if the editor text differs to avoid cursor jumps
    useEffect(() => {
      if (editor && value !== editor.getText()) {
        // Small timeout to prevent state update loops during rapid typing
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
                minHeight: 64, // Matches standard textarea minHeight roughly
                maxHeight: 300, // Matches maxRows=8
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
