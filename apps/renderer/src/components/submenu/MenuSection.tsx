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

import { MenuItem as MenuItemType, MenuSection as MenuSectionType } from '@/types/menu';
import { ActionIcon, Box, Collapse, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronRight } from '@tabler/icons-react';
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem } from './MenuItem';
import { getIconComponent } from './iconUtils';

interface MenuSectionProps {
  section: MenuSectionType;
  activeItemId?: string | null;
  onItemSelect?: (item: MenuItemType) => void;
  onItemDelete?: (item: MenuItemType) => void;
  onItemRename?: (item: MenuItemType) => void;
  onSectionAction?: (section: MenuSectionType, actionId: string) => void;
  onOpenedChange?: (opened: boolean) => void;
  maxInitialItems?: number;
}

export function MenuSection({
  section,
  activeItemId,
  onItemSelect,
  onItemDelete,
  onItemRename,
  onSectionAction,
  onOpenedChange,
  maxInitialItems,
}: MenuSectionProps) {
  const { t } = useTranslation(['submenu']);
  // Use initiallyOpened if provided, otherwise default to opened if section has items
  const defaultOpened =
    section.initiallyOpened !== undefined
      ? section.initiallyOpened
      : section.collapsible !== false && section.items.length > 0;
  const [opened, { toggle }] = useDisclosure(defaultOpened);
  const [hovered, setHovered] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    onOpenedChange?.(opened);
  }, [opened, onOpenedChange]);

  // Hide truly empty sections unless explicitly configured to stay visible.
  if (section.items.length === 0 && !section.showWhenEmpty && !section.action) {
    return null;
  }

  const sectionIcon = section.icon ? getIconComponent(section.icon) : null;
  const actionIcon = section.action?.icon ? getIconComponent(section.action.icon) : null;

  const handleSectionActionClick = (event: MouseEvent<HTMLButtonElement>, actionId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const id = actionId || section.action?.id;
    if (!id) {
      return;
    }
    onSectionAction?.(section, id);
  };

  const handleSectionHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <Box>
      {section.collapsible !== false ? (
        <UnstyledButton
          component="div"
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={handleSectionHeaderKeyDown}
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
                <Group gap={4} wrap="nowrap">
                  {section.actions ? (
                    section.actions.map(
                      action =>
                        (!action.showOnHover || hovered) && (
                          <Tooltip key={action.id} label={action.label}>
                            <ActionIcon
                              aria-label={action.label}
                              variant="subtle"
                              color="gray"
                              size="sm"
                              onClick={e => handleSectionActionClick(e, action.id)}
                            >
                              {getIconComponent(action.icon || '')}
                            </ActionIcon>
                          </Tooltip>
                        )
                    )
                  ) : section.action && (!section.action.showOnHover || hovered) ? (
                    <Tooltip label={section.action.label}>
                      <ActionIcon
                        aria-label={section.action.label}
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={e => handleSectionActionClick(e)}
                      >
                        {actionIcon}
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
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
          </Group>
        </UnstyledButton>
      ) : (
        <Group justify="space-between" gap="xs" wrap="nowrap" px="sm" py="xs">
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
            <Text fw={500} size="sm" style={{ color: 'var(--submenu-section-text-color)' }}>
              {section.label}
            </Text>
          </Group>
          {section.actions ? (
            <Group gap={4} wrap="nowrap">
              {section.actions.map(
                action =>
                  (!action.showOnHover || hovered) && (
                    <Tooltip key={action.id} label={action.label}>
                      <ActionIcon
                        aria-label={action.label}
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={e => handleSectionActionClick(e, action.id)}
                      >
                        {getIconComponent(action.icon || '')}
                      </ActionIcon>
                    </Tooltip>
                  )
              )}
            </Group>
          ) : section.action && (!section.action.showOnHover || hovered) ? (
            <Tooltip label={section.action.label}>
              <ActionIcon
                aria-label={section.action.label}
                variant="subtle"
                color="gray"
                size="sm"
                onClick={e => handleSectionActionClick(e)}
              >
                {actionIcon}
              </ActionIcon>
            </Tooltip>
          ) : null}
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
            {section.items.length === 0 ? (
              section.emptyLabel ? (
                <Text size="xs" c="dimmed" py={4}>
                  {section.emptyLabel}
                </Text>
              ) : null
            ) : (
              <>
                {(maxInitialItems && !showAll
                  ? section.items.slice(0, maxInitialItems)
                  : section.items
                ).map(item => {
                  const itemIcon = item.icon ? getIconComponent(item.icon) : null;
                  const supportsContextActions =
                    item.id.startsWith('saved-search-') || item.id.startsWith('agent-chat-');
                  return (
                    <MenuItem
                      key={item.id}
                      item={item}
                      active={activeItemId === item.id}
                      onSelect={onItemSelect}
                      isNested={true}
                      icon={itemIcon}
                      onDelete={supportsContextActions ? onItemDelete : undefined}
                      onRename={item.id.startsWith('saved-search-') ? onItemRename : undefined}
                    />
                  );
                })}
                {maxInitialItems && section.items.length > maxInitialItems && (
                  <Text
                    size="xs"
                    c="dimmed"
                    py={4}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowAll(prev => !prev)}
                  >
                    {showAll
                      ? t('submenu:showLess')
                      : t('submenu:showMore', { count: section.items.length - maxInitialItems })}
                  </Text>
                )}
              </>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
