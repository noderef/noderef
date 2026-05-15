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

import type { QNameGroupedSuggestions } from '@/hooks/useQNameSuggestions';
import { Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import { IconForms, IconSchema, IconTag } from '@tabler/icons-react';
import type { SuggestionProps } from '@tiptap/suggestion';
import {
  type CSSProperties,
  type ComponentType,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

export interface QNameListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface QNameSuggestionListProps extends SuggestionProps {
  suggestions: QNameGroupedSuggestions;
  popupWidth?: number;
}

interface FlatItem {
  qname: string;
  category: 'type' | 'aspect' | 'property';
}

const singleLineTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

const GROUP_CONFIG: Array<{
  key: keyof QNameGroupedSuggestions;
  category: FlatItem['category'];
  i18nKey: string;
  Icon: ComponentType<any>;
  color: string;
}> = [
  {
    key: 'types',
    category: 'type',
    i18nKey: 'qnameGroupTypes',
    Icon: IconSchema,
    color: 'var(--mantine-color-blue-6)',
  },
  {
    key: 'aspects',
    category: 'aspect',
    i18nKey: 'qnameGroupAspects',
    Icon: IconTag,
    color: 'var(--mantine-color-violet-6)',
  },
  {
    key: 'properties',
    category: 'property',
    i18nKey: 'qnameGroupProperties',
    Icon: IconForms,
    color: 'var(--mantine-color-orange-6)',
  },
];

export const QNameSuggestionList = forwardRef<QNameListRef, QNameSuggestionListProps>(
  (props, ref) => {
    const { t } = useTranslation('agent');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement | null>(null);
    const popupWidth = Math.max(320, Math.round(props.popupWidth ?? 560));
    const popupWidthStyle: CSSProperties = {
      width: `${popupWidth}px`,
      maxWidth: 'calc(100vw - 12px)',
    };

    // Flatten grouped suggestions into a single selectable list
    const flatItems: FlatItem[] = [];
    for (const group of GROUP_CONFIG) {
      const items = props.suggestions[group.key];
      for (const qname of items) {
        flatItems.push({ qname, category: group.category });
      }
    }

    const selectableCount = flatItems.length;

    const selectItem = (index: number) => {
      const item = flatItems[index];
      if (item) {
        props.command({
          id: item.qname,
          label: item.qname,
          type: item.category,
        });
      }
    };

    const upHandler = () => {
      if (!selectableCount) return;
      setSelectedIndex(current => (current - 1 + selectableCount) % selectableCount);
    };

    const downHandler = () => {
      if (!selectableCount) return;
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
      const listElement = listRef.current;
      if (!listElement) return;
      const selectedElement = listElement.querySelector<HTMLElement>(
        `[data-qname-index="${selectedIndex}"]`
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
          if (!selectableCount) return false;
          enterHandler();
          return true;
        }
        return false;
      },
    }));

    // No matches = no dropdown
    if (!selectableCount) {
      return null;
    }

    // Build the grouped UI
    let globalIndex = 0;

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
              {GROUP_CONFIG.map((group, groupIdx) => {
                const items = props.suggestions[group.key];
                if (!items.length) return null;

                const startIndex = globalIndex;
                const elements = items.map((qname, i) => {
                  const itemIndex = startIndex + i;
                  return (
                    <Button
                      key={`${group.category}-${qname}`}
                      data-qname-index={itemIndex}
                      variant={itemIndex === selectedIndex ? 'light' : 'subtle'}
                      justify="start"
                      size="sm"
                      onClick={() => selectItem(itemIndex)}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      styles={{
                        root: {
                          width: '100%',
                          paddingLeft: 8,
                          paddingRight: 8,
                          minHeight: 36,
                        },
                        inner: {
                          width: '100%',
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                        },
                        label: { width: '100%' },
                      }}
                    >
                      <Text size="sm" style={{ ...singleLineTextStyle, flex: 1 }} ta="left">
                        {qname}
                      </Text>
                    </Button>
                  );
                });

                globalIndex += items.length;

                return (
                  <div key={group.key}>
                    {groupIdx > 0 &&
                      GROUP_CONFIG.slice(0, groupIdx).some(
                        g => props.suggestions[g.key].length > 0
                      ) && <Divider my={4} />}
                    <Group gap={6} px={8} py={4} style={{ opacity: 0.7 }}>
                      <group.Icon size={14} stroke={1.8} style={{ color: group.color }} />
                      <Text size="xs" fw={600} c="dimmed">
                        {t(group.i18nKey)}
                      </Text>
                    </Group>
                    {elements}
                  </div>
                );
              })}
            </Stack>
          </div>
        </Paper>
      </Stack>
    );
  }
);

QNameSuggestionList.displayName = 'QNameSuggestionList';
