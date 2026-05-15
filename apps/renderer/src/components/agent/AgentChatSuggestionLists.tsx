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

import type { AgentMentionSuggestion } from '@/core/ipc/backend';
import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { Button, Group, Loader, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconFolder, IconUser, IconUsersGroup, IconWorld } from '@tabler/icons-react';
import { SuggestionProps } from '@tiptap/suggestion';
import {
  type CSSProperties,
  type ComponentType,
  type ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface NodeMentionSuggestionProps extends SuggestionProps {
  items: AgentMentionSuggestion[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore?: () => void;
  popupWidth?: number;
}

const singleLineTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function compactDisplayPath(path: string | null | undefined): string | null {
  const cleaned = cleanText(path);
  if (!cleaned) {
    return null;
  }

  const compacted = cleaned.replace(/^\/?Company Home(?=\/|$)/i, '');
  if (!compacted.length) {
    return '/';
  }

  return compacted.startsWith('/') ? compacted : `/${compacted}`;
}

function getMentionMeta(item: AgentMentionSuggestion): string | null {
  if (item.type === 'node') {
    return compactDisplayPath(item.displayPath ?? item.path ?? null) ?? item.subtitle ?? null;
  }
  return item.subtitle ?? null;
}

function buildMentionTooltip(item: AgentMentionSuggestion): ReactNode {
  const name = cleanText(item.label);
  const title = cleanText(item.title);
  const description = cleanText(item.description);
  const path = cleanText(item.displayPath ?? item.path ?? null);

  const rows: Array<{ key: string; label: string; value: string }> = [];
  if (name) rows.push({ key: 'name', label: 'Name', value: name });
  if (title) rows.push({ key: 'title', label: 'Title', value: title });
  if (description) rows.push({ key: 'description', label: 'Description', value: description });
  if (path) rows.push({ key: 'path', label: 'Path', value: path });

  if (!rows.length) {
    return '';
  }

  return (
    <Stack gap={2}>
      {rows.map(row => (
        <Text key={row.key} size="xs" style={{ lineHeight: 1.25 }}>
          <Text span fw={600}>
            {row.label}
          </Text>
          <Text span>{`: ${row.value}`}</Text>
        </Text>
      ))}
    </Stack>
  );
}

function getMentionIcon(item: AgentMentionSuggestion): {
  Icon: ComponentType<any>;
  color: string;
} {
  if (item.type === 'person') {
    return { Icon: IconUser, color: 'var(--mantine-color-blue-6)' };
  }
  if (item.type === 'group') {
    return { Icon: IconUsersGroup, color: 'var(--mantine-color-violet-6)' };
  }
  const nodeType = typeof item.nodeType === 'string' ? item.nodeType.toLowerCase() : '';
  if (nodeType === 'st:site' || nodeType === 'st:sites') {
    return { Icon: IconWorld, color: 'var(--mantine-color-blue-6)' };
  }
  if (item.isContainer) {
    return { Icon: IconFolder, color: 'var(--mantine-color-blue-6)' };
  }

  return {
    Icon: getFileIconByMimeType(item.mimeType ?? undefined),
    color: 'var(--mantine-color-dimmed)',
  };
}

export const NodeMentionList = forwardRef<MentionListRef, NodeMentionSuggestionProps>(
  (props, ref) => {
    const { t } = useTranslation('agent');
    const { items, hasMore, loading, onLoadMore, command } = props;
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement | null>(null);
    const autoLoadRequestedForCountRef = useRef<number | null>(null);
    const selectableCount = items.length;
    const popupWidth = Math.max(320, Math.round(props.popupWidth ?? 560));
    const popupWidthStyle: CSSProperties = {
      width: `${popupWidth}px`,
      maxWidth: 'calc(100vw - 12px)',
    };

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({
          id: item.id,
          label: item.label,
          type: item.type,
          path: item.path ?? item.displayPath ?? null,
        });
      }
    };

    const upHandler = () => {
      if (!selectableCount) {
        return;
      }
      setSelectedIndex(current => (current - 1 + selectableCount) % selectableCount);
    };

    const downHandler = () => {
      if (!selectableCount) {
        return;
      }
      setSelectedIndex(current => (current + 1) % selectableCount);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => {
      if (!selectableCount) {
        setSelectedIndex(0);
        return;
      }
      setSelectedIndex(current => Math.min(current, selectableCount - 1));
    }, [selectableCount]);

    useEffect(() => {
      if (!hasMore) {
        autoLoadRequestedForCountRef.current = null;
        return;
      }

      if (!onLoadMore || loading || items.length === 0) {
        return;
      }

      const thresholdIndex = Math.max(0, items.length - 2);
      if (selectedIndex < thresholdIndex) {
        return;
      }

      if (autoLoadRequestedForCountRef.current === items.length) {
        return;
      }

      autoLoadRequestedForCountRef.current = items.length;
      onLoadMore();
    }, [hasMore, items.length, loading, onLoadMore, selectedIndex]);

    useEffect(() => {
      const listElement = listRef.current;
      if (!listElement) {
        return;
      }
      const selectedElement = listElement.querySelector<HTMLElement>(
        `[data-mention-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }

        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }

        if (event.key === 'Enter') {
          if (!selectableCount && !loading) {
            return false;
          }
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    if (!items.length && !loading) {
      return null;
    }

    if (loading && !items.length) {
      return (
        <Stack gap={4} style={popupWidthStyle}>
          <Paper
            withBorder
            shadow="md"
            style={{
              minHeight: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--mantine-spacing-sm)',
            }}
          >
            <Group justify="center" gap={6} style={{ pointerEvents: 'none' }}>
              <Loader size="xs" style={{ opacity: 0.7 }} />
              <Text size="sm" c="dimmed" fw={400} style={{ opacity: 0.72, fontFamily: 'inherit' }}>
                {t('loadingMoreResults')}
              </Text>
            </Group>
          </Paper>
        </Stack>
      );
    }

    return (
      <Stack gap={4} style={popupWidthStyle}>
        <Paper
          withBorder
          shadow="md"
          style={{
            overflow: 'hidden',
            paddingBottom: 'var(--mantine-spacing-sm)',
          }}
        >
          <div
            ref={listRef}
            style={{
              maxHeight: 300,
              overflow: 'auto',
              padding: 'var(--mantine-spacing-xs)',
            }}
          >
            <Stack gap={4}>
              {items.map((item, index) => (
                <Button
                  key={`${item.type}-${item.id}`}
                  data-mention-index={index}
                  variant={index === selectedIndex ? 'light' : 'subtle'}
                  justify="start"
                  size="sm"
                  onClick={() => selectItem(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  styles={{
                    root: { width: '100%', paddingLeft: 8, paddingRight: 8, minHeight: 44 },
                    inner: { width: '100%', justifyContent: 'flex-start', alignItems: 'center' },
                    label: { width: '100%' },
                  }}
                >
                  {(() => {
                    const { Icon, color } = getMentionIcon(item);
                    const meta = getMentionMeta(item);
                    return (
                      <Group
                        wrap="nowrap"
                        style={{ width: '100%', overflow: 'hidden', alignItems: 'center' }}
                        gap="xs"
                      >
                        <Icon size={16} stroke={1.8} style={{ flexShrink: 0, color }} aria-hidden />
                        <Tooltip
                          disabled={item.type !== 'node'}
                          label={buildMentionTooltip(item)}
                          withArrow
                          withinPortal
                          zIndex={40000}
                          openDelay={250}
                          multiline
                          maw={900}
                        >
                          <Text size="sm" style={{ ...singleLineTextStyle, flex: 1 }} ta="left">
                            <Text span inherit>
                              {item.label}
                            </Text>
                            {meta && (
                              <Text span inherit c="dimmed" style={{ opacity: 0.58 }}>
                                {` · ${meta}`}
                              </Text>
                            )}
                          </Text>
                        </Tooltip>
                      </Group>
                    );
                  })()}
                </Button>
              ))}
            </Stack>
          </div>
          {loading && (
            <Group
              justify="center"
              mt="xs"
              pt="sm"
              pb="sm"
              gap={6}
              style={{ pointerEvents: 'none' }}
            >
              <Loader size="xs" style={{ opacity: 0.7 }} />
              <Text size="sm" c="dimmed" fw={400} style={{ opacity: 0.72, fontFamily: 'inherit' }}>
                {t('loadingMoreResults')}
              </Text>
            </Group>
          )}
        </Paper>
      </Stack>
    );
  }
);
NodeMentionList.displayName = 'NodeMentionList';
