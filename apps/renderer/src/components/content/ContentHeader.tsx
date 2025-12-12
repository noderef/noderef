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

import {
  ActionIcon,
  Box,
  Group,
  Menu,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { IconDotsVertical, IconSearch } from '@tabler/icons-react';
import { ReactNode } from 'react';

interface ActionIconItem {
  icon?: ReactNode;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  customNode?: ReactNode;
}

interface MoreMenuAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  divider?: boolean;
}

interface ContentHeaderProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  actionIcons?: ActionIconItem[];
  moreMenuActions?: MoreMenuAction[];
  searchPlaceholder?: string;
  searchComponent?: ReactNode;
  searchWrapperStyle?: React.CSSProperties;
}

export function ContentHeader({
  title,
  icon,
  actionIcons = [],
  moreMenuActions = [],
  searchPlaceholder = 'Search...',
  searchComponent,
  searchWrapperStyle,
}: ContentHeaderProps) {
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const searchBackground =
    colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-0)';
  const borderColor =
    colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)';

  // Display all action icons
  const displayIcons = actionIcons;
  const hasMoreMenu = moreMenuActions.length > 0;

  return (
    <Box
      style={{
        padding: 'var(--mantine-spacing-md)',
        borderTop: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--mantine-spacing-md)',
        height: 60,
      }}
    >
      {/* Left: Title with icon */}
      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        {icon && <Box style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</Box>}
        {title && (
          <Text fw={600} size="md" style={{ flexShrink: 0 }}>
            {title}
          </Text>
        )}
      </Group>

      {/* Right: Action Icons, More Menu, Search */}
      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 1, minWidth: 0 }}>
        {/* Action Icons */}
        {displayIcons.map((action, index) => {
          if (action.customNode) {
            return (
              <Box key={`custom-action-${index}`} style={{ display: 'flex', alignItems: 'center' }}>
                {action.customNode}
              </Box>
            );
          }
          if (!action.icon || !action.label) {
            return null;
          }
          return (
            <Tooltip key={`action-${index}`} label={action.label} position="bottom" withArrow>
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={action.onClick}
                disabled={action.disabled}
                styles={{
                  root: {
                    color: 'var(--mantine-color-text)',
                  },
                }}
              >
                {action.icon}
              </ActionIcon>
            </Tooltip>
          );
        })}

        {/* More Menu (if there are more actions or moreMenuActions) */}
        {hasMoreMenu && (
          <Menu withinPortal position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
              <Tooltip label="More actions" position="bottom" withArrow>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  styles={{
                    root: {
                      color: 'var(--mantine-color-text)',
                    },
                  }}
                >
                  <IconDotsVertical size={18} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {/* More menu actions */}
              {moreMenuActions.map((action, index) => (
                <div key={`more-${index}`}>
                  {action.divider && index > 0 && <Menu.Divider />}
                  <Menu.Item leftSection={action.icon} onClick={action.onClick}>
                    {action.label}
                  </Menu.Item>
                </div>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Search Bar */}
        <Box
          w={400}
          maw={400}
          miw={200}
          style={{
            flexShrink: 1,
            flexGrow: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            overflow: 'hidden',
            ...searchWrapperStyle,
          }}
        >
          {searchComponent ?? (
            <TextInput
              placeholder={searchPlaceholder}
              leftSection={<IconSearch size={16} />}
              size="sm"
              style={{ width: '100%' }}
              styles={{
                input: {
                  backgroundColor: searchBackground,
                  color: 'var(--mantine-color-text)',
                },
              }}
            />
          )}
        </Box>
      </Group>
    </Box>
  );
}
