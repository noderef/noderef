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

import { MenuItem as MenuItemType } from '@/types/menu';
import { Group, Menu, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MenuItemProps {
  item: MenuItemType;
  active?: boolean;
  onSelect?: (item: MenuItemType) => void;
  isNested?: boolean;
  icon?: React.ReactNode;
  onDelete?: (item: MenuItemType) => void;
  onRename?: (item: MenuItemType) => void;
}

export function MenuItem({
  item,
  active,
  onSelect,
  icon,
  onDelete,
  onRename,
  isNested,
}: MenuItemProps) {
  const { t } = useTranslation(['common']);
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasContextMenu = onDelete || onRename;

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (hasContextMenu) {
      e.preventDefault();
      setContextMenuPosition({ x: e.clientX, y: e.clientY });
      setContextMenuOpened(true);
    }
  };

  const handleRenameStart = () => {
    setRenameValue(item.label);
    setIsRenaming(true);
    setContextMenuOpened(false);
  };

  const handleRenameSave = () => {
    if (renameValue.trim() && renameValue !== item.label && onRename) {
      // Create a modified item with the new label for the callback
      onRename({ ...item, label: renameValue.trim() });
    }
    setIsRenaming(false);
  };

  const handleRenameCancel = () => {
    setRenameValue(item.label);
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSave();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  // If in rename mode, show input instead
  if (isRenaming) {
    return (
      <div
        style={{
          width: '100%',
          padding: isNested
            ? 'var(--mantine-spacing-xs) var(--mantine-spacing-sm) var(--mantine-spacing-xs) 0'
            : 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
        }}
      >
        <Group gap="xs" wrap="nowrap">
          {icon && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                flexShrink: 0,
                color: 'var(--mantine-color-dimmed)',
              }}
            >
              {icon}
            </div>
          )}
          <TextInput
            ref={inputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRenameSave}
            size="xs"
            styles={{
              input: {
                minHeight: 'unset',
                height: '24px',
                fontSize: 'var(--mantine-font-size-sm)',
              },
            }}
            style={{ flex: 1 }}
          />
        </Group>
      </div>
    );
  }

  const content = (
    <UnstyledButton
      onClick={() => onSelect?.(item)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
      style={{
        width: '100%',
        display: 'block',
        padding: isNested
          ? 'var(--mantine-spacing-xs) var(--mantine-spacing-sm) var(--mantine-spacing-xs) 0'
          : 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
        borderRadius: 'var(--mantine-radius-sm)',
        textDecoration: 'none',
        textAlign: 'left',
        color: active ? 'var(--submenu-item-active-color)' : 'var(--submenu-item-text-color)',
        backgroundColor: active
          ? 'var(--submenu-item-active-bg)'
          : isHovered
            ? 'var(--submenu-item-hover-bg)'
            : 'transparent',
        fontWeight: active ? 500 : 400,
        transition: 'all 150ms ease',
      }}
    >
      <Group gap="xs" wrap="nowrap">
        {icon && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              flexShrink: 0,
              color: active ? 'var(--submenu-item-active-color)' : 'var(--submenu-item-icon-color)',
            }}
          >
            {icon}
          </div>
        )}
        <Text size="sm" style={{ flex: 1 }}>
          {item.label}
        </Text>
      </Group>
    </UnstyledButton>
  );

  if (!hasContextMenu) {
    return content;
  }

  return (
    <>
      {content}
      <Menu
        opened={contextMenuOpened}
        onChange={setContextMenuOpened}
        withinPortal
        shadow="md"
        width={200}
        position="bottom-start"
        offset={0}
        transitionProps={{ duration: 0 }}
      >
        <Menu.Target>
          <div
            style={{
              position: 'fixed',
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          {onRename && (
            <Menu.Item leftSection={<IconEdit size={14} />} onClick={handleRenameStart}>
              {t('common:rename')}
            </Menu.Item>
          )}
          {onDelete && (
            <Menu.Item
              leftSection={<IconTrash size={14} />}
              color="red"
              onClick={() => {
                onDelete(item);
                setContextMenuOpened(false);
              }}
            >
              {t('common:delete')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
