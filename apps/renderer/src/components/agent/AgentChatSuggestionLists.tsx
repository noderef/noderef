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
import { Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface NodeMentionSuggestionProps extends SuggestionProps {
  items: AgentMentionSuggestion[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore?: () => void;
}

export const NodeMentionList = forwardRef<MentionListRef, NodeMentionSuggestionProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      if (index === props.items.length) {
        if (props.hasMore && !props.loading && props.onLoadMore) {
          props.onLoadMore();
        }
        return;
      }
      const item = props.items[index];
      if (item) {
        // Insert into editor
        props.command({
          id: item.id,
          label: item.label,
          type: item.type,
          path: item.path,
        });
      }
    };

    const upHandler = () => {
      setSelectedIndex(
        (selectedIndex + props.items.length + (props.hasMore ? 1 : 0)) %
          (props.items.length + (props.hasMore ? 1 : 0) + 1)
      );
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % (props.items.length + (props.hasMore ? 1 : 0) + 1));
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

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
          if (!props.items.length && !props.loading) {
            return false;
          }
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    if (!props.items.length && !props.loading) {
      return null;
    }

    return (
      <Paper
        withBorder
        shadow="md"
        p="xs"
        style={{ maxHeight: 250, overflow: 'auto', minWidth: 280, maxWidth: 350 }}
      >
        <Stack gap={4}>
          {props.items.map((item, index) => (
            <Button
              key={`${item.type}-${item.id}`}
              variant={index === selectedIndex ? 'light' : 'subtle'}
              justify="start"
              size="sm"
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              styles={{
                root: { width: '100%', paddingLeft: 8, paddingRight: 8 },
                inner: { width: '100%', justifyContent: 'flex-start' },
                label: { width: '100%' },
              }}
            >
              <Group
                justify="space-between"
                wrap="nowrap"
                style={{ width: '100%', overflow: 'hidden' }}
                gap="xs"
              >
                <Text size="sm" truncate="end" style={{ flex: 1, textAlign: 'left' }}>
                  @{item.label}
                </Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {item.type}
                </Text>
              </Group>
            </Button>
          ))}
          {props.loading && (
            <Group justify="center" py={4}>
              <Loader size="xs" />
            </Group>
          )}
          {props.hasMore && !props.loading && (
            <Button
              size="xs"
              variant={selectedIndex === props.items.length ? 'light' : 'subtle'}
              onClick={() => selectItem(props.items.length)}
              onMouseEnter={() => setSelectedIndex(props.items.length)}
            >
              Load more
            </Button>
          )}
        </Stack>
      </Paper>
    );
  }
);
NodeMentionList.displayName = 'NodeMentionList';

export interface ConstraintListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface ConstraintSuggestionProps extends SuggestionProps {
  items: string[];
}

export const ConstraintList = forwardRef<ConstraintListRef, ConstraintSuggestionProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        // We aren't inserting a custom node here, just plain text with the trigger char
        props.command({ id: item });
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

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
          if (!props.items.length) {
            return false;
          }
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    if (!props.items.length) {
      return null;
    }

    return (
      <Paper
        withBorder
        shadow="md"
        p="xs"
        style={{ maxHeight: 200, overflow: 'auto', minWidth: 150 }}
      >
        <Stack gap={4}>
          <Text size="xs" fw={500} c="dimmed" mb={4}>
            Insert filter
          </Text>
          {props.items.map((item, index) => (
            <Button
              key={index}
              variant={index === selectedIndex ? 'light' : 'subtle'}
              justify="start"
              size="xs"
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item}:
            </Button>
          ))}
        </Stack>
      </Paper>
    );
  }
);
ConstraintList.displayName = 'ConstraintList';
