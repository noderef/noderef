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

import { Box, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { MenuItem as MenuItemType, MenuSection as MenuSectionType } from '@/types/menu';
import { MenuItem } from './MenuItem';
import { getIconComponent } from './iconUtils';

interface MenuSectionProps {
  section: MenuSectionType;
  activeItemId?: string | null;
  onItemSelect?: (item: MenuItemType) => void;
  onItemDelete?: (item: MenuItemType) => void;
  onItemRename?: (item: MenuItemType) => void;
  onOpenedChange?: (opened: boolean) => void;
}

export function MenuSection({
  section,
  activeItemId,
  onItemSelect,
  onItemDelete,
  onItemRename,
  onOpenedChange,
}: MenuSectionProps) {
  // Use initiallyOpened if provided, otherwise default to opened if section has items
  const defaultOpened =
    section.initiallyOpened !== undefined
      ? section.initiallyOpened
      : section.collapsible !== false && section.items.length > 0;
  const [opened, { toggle }] = useDisclosure(defaultOpened);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    onOpenedChange?.(opened);
  }, [opened, onOpenedChange]);

  // If section has no items, don't render it
  if (section.items.length === 0) {
    return null;
  }

  const sectionIcon = section.icon ? getIconComponent(section.icon) : null;

  return (
    <Box>
      {section.collapsible !== false ? (
        <UnstyledButton
          onClick={toggle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: '100%',
            padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
            borderRadius: 'var(--mantine-radius-sm)',
            cursor: 'pointer',
            transition: 'background-color 150ms ease',
            backgroundColor: hovered ? 'var(--submenu-section-hover-bg)' : 'transparent',
            border: 'none',
          }}
        >
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
              {sectionIcon && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    color: 'var(--submenu-section-icon-color)',
                  }}
                >
                  {sectionIcon}
                </div>
              )}
              <Group justify="space-between" align="center" gap="xs" style={{ flex: 1 }}>
                <Text
                  fw={500}
                  size="sm"
                  style={{ flex: 1, color: 'var(--submenu-section-text-color)' }}
                >
                  {section.label}
                </Text>
                <IconChevronRight
                  size={16}
                  style={{
                    transform: opened ? 'rotate(90deg)' : undefined,
                    transition: 'transform 200ms ease',
                    color: 'var(--submenu-section-chevron-color)',
                    flexShrink: 0,
                  }}
                />
              </Group>
            </Group>
          </Group>
        </UnstyledButton>
      ) : (
        <Group gap="xs" wrap="nowrap" px="sm" py="xs">
          {sectionIcon && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                flexShrink: 0,
                color: 'var(--submenu-section-icon-color)',
              }}
            >
              {sectionIcon}
            </div>
          )}
          <Text fw={500} size="sm" style={{ color: 'var(--submenu-section-text-color)' }}>
            {section.label}
          </Text>
        </Group>
      )}
      <Collapse in={opened}>
        <Box
          style={{
            position: 'relative',
            paddingLeft: 'var(--mantine-spacing-xs)',
            marginLeft: 'calc(var(--mantine-spacing-sm) + 10px)',
          }}
        >
          {/* Vertical line - aligned with center of parent icon */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: 'var(--submenu-section-border-color)',
            }}
          />
          <Box pl="md">
            {section.items.map(item => {
              const itemIcon = item.icon ? getIconComponent(item.icon) : null;
              // Check if this is a saved search item (starts with 'saved-search-')
              const isSavedSearch = item.id.startsWith('saved-search-');
              return (
                <MenuItem
                  key={item.id}
                  item={item}
                  active={activeItemId === item.id}
                  onSelect={onItemSelect}
                  isNested={true}
                  icon={itemIcon}
                  onDelete={isSavedSearch ? onItemDelete : undefined}
                  onRename={isSavedSearch ? onItemRename : undefined}
                />
              );
            })}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
