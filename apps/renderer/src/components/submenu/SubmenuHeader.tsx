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

import { backendRpc, refreshWorkspace } from '@/core/ipc/backend';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import { useActiveServerId, useNavigation } from '@/hooks/useNavigation';
import { Avatar, Group, Loader, Menu, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { spotlight } from '@mantine/spotlight';
import { filesystem, os } from '@neutralinojs/lib';
import {
  IconChevronDown,
  IconEdit,
  IconExternalLink,
  IconFileText,
  IconSettings,
  IconTrash,
  IconUserCircle,
} from '@tabler/icons-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_THUMBNAIL_BYTES = 256 * 1024;
const ALLOWED_THUMBNAIL_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_THUMBNAIL_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function inferMimeFromName(name?: string | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

function getFileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function SubmenuHeader() {
  const { t } = useTranslation(['submenu', 'server', 'common']);
  const activeServerId = useActiveServerId();
  const { open: openServerEdit } = useModal(MODAL_KEYS.SERVER_EDIT);
  const { open: openLogsModal } = useModal(MODAL_KEYS.LOGS);
  const getServerById = useServersStore(state => state.getServerById);
  const { setActiveServer, navigate } = useNavigation();
  const [spaceTitle, setSpaceTitle] = useState<string>('');
  const [spaceTitleDraft, setSpaceTitleDraft] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [userThumbnail, setUserThumbnail] = useState<string | null>(null);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [avatarMenuOpened, setAvatarMenuOpened] = useState(false);
  const [avatarMenuPosition, setAvatarMenuPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDesktop = isNeutralinoMode();

  // Load persisted NodeRef space title from user.fullName
  useEffect(() => {
    let mounted = true;

    backendRpc.user
      .get()
      .then(async user => {
        if (!mounted) return;

        // Migrate from localStorage if user.fullName is empty but localStorage has a value
        const storedLocal = localStorage.getItem('noderef-space-title');
        if (!user.fullName && storedLocal && storedLocal.trim()) {
          // Migrate to database
          try {
            await backendRpc.user.updateFullName(storedLocal.trim());
            // Remove from localStorage after successful migration
            localStorage.removeItem('noderef-space-title');
            if (mounted) {
              setSpaceTitle(storedLocal.trim());
            }
          } catch (error) {
            console.error('Failed to migrate space title from localStorage:', error);
            // Fall through to use localStorage value for now
            if (mounted) {
              setSpaceTitle(storedLocal.trim());
            }
          }
        } else if (user.fullName && user.fullName.trim()) {
          setSpaceTitle(user.fullName.trim());
        } else {
          setSpaceTitle(t('submenu:nodeRefSpace'));
        }
        setUserThumbnail(user.thumbnail ?? null);
      })
      .catch(error => {
        console.error('Failed to load user:', error);
        if (mounted) {
          // Fallback to localStorage or default if user load fails
          const storedLocal = localStorage.getItem('noderef-space-title');
          if (storedLocal && storedLocal.trim()) {
            setSpaceTitle(storedLocal.trim());
          } else {
            setSpaceTitle(t('submenu:nodeRefSpace'));
          }
        }
      });

    return () => {
      mounted = false;
    };
  }, [t]);

  const persistSpaceTitle = async (value: string) => {
    const trimmed = value.trim() || t('submenu:nodeRefSpace');
    setSpaceTitle(trimmed);
    setSpaceTitleDraft(trimmed);

    try {
      // Save to user.fullName in database
      await backendRpc.user.updateFullName(trimmed === t('submenu:nodeRefSpace') ? null : trimmed);
    } catch (error) {
      console.error('Failed to save space title:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to save space name',
        color: 'red',
      });
    }
  };

  const server = getServerById(activeServerId);
  const title = server?.name ?? (spaceTitle || t('submenu:nodeRefSpace'));
  const subtitle = server ? server.baseUrl : t('submenu:noServerSelected');

  const userThumbnailDataUrl = useMemo(() => {
    if (!userThumbnail) return null;
    const isJpeg = userThumbnail.startsWith('/9j/');
    const mime = isJpeg ? 'jpeg' : 'png';
    return `data:image/${mime};base64,${userThumbnail}`;
  }, [userThumbnail]);

  const handleEdit = () => {
    if (server) {
      openServerEdit(server.id);
    }
  };

  const handleOpenRepoAdmin = async () => {
    if (!server) return;

    try {
      // Build admin URL: http://localhost:8080/alfresco/s/enterprise/admin/admin-systemsummary
      let baseUrl = server.baseUrl.replace(/\/$/, '');
      if (baseUrl.endsWith('/alfresco')) {
        baseUrl = baseUrl.slice(0, -9);
      }
      const adminPath = '/alfresco/s/enterprise/admin/admin-systemsummary';

      // Get authentication ticket
      const result = await backendRpc.servers.getAuthTicket(server.id);

      if (!result.ticket) {
        notifications.show({
          title: 'Error',
          message: 'Failed to get authentication ticket',
          color: 'red',
        });
        return;
      }

      const adminUrl = `${baseUrl}${adminPath}?alf_ticket=${result.ticket}`;

      // Open in system browser (desktop) or new tab (browser)
      const isDesktop = isNeutralinoMode();
      if (isDesktop) {
        await os.open(adminUrl);
      } else {
        window.open(adminUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to open repository admin:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to open admin console',
        color: 'red',
      });
    }
  };

  const handleRemove = async () => {
    if (server) {
      modals.openConfirmModal({
        title: t('server:removeServer'),
        centered: true,
        children: <Text size="sm">{`Are you sure you want to remove "${server.name}"?`}</Text>,
        labels: {
          confirm: t('common:remove'),
          cancel: t('common:cancel'),
        },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          try {
            await backendRpc.servers.delete(server.id);
            // Refresh workspace to update server list
            const workspace = await refreshWorkspace();
            const setServers = useServersStore.getState().setServers;
            setServers(workspace.servers || []);
            // If removed server was active, reset to NodeRef space
            if (activeServerId === server.id) {
              setActiveServer(null);
              navigate('dashboard');
            }
            notifications.show({
              title: 'Success',
              message: `Server "${server.name}" removed`,
              color: 'green',
            });
          } catch (error) {
            notifications.show({
              title: 'Error',
              message: error instanceof Error ? error.message : 'Failed to remove server',
              color: 'red',
            });
          }
        },
      });
    }
  };

  const validateThumbnailInput = (
    mime: string | null | undefined,
    size: number | null | undefined,
    name?: string | null
  ): boolean => {
    const normalizedMime = mime?.toLowerCase() || inferMimeFromName(name);
    if (!normalizedMime || !ALLOWED_THUMBNAIL_MIMES.has(normalizedMime)) {
      notifications.show({
        title: t('server:invalidFileType'),
        message: t('server:invalidFileTypeMessage'),
        color: 'red',
      });
      return false;
    }

    if (size !== null && size !== undefined && size > MAX_THUMBNAIL_BYTES) {
      notifications.show({
        title: t('server:fileTooLarge'),
        message: t('server:fileTooLargeMessage'),
        color: 'red',
      });
      return false;
    }

    return true;
  };

  const uploadThumbnailBase64 = async (base64: string) => {
    await backendRpc.user.updateProfile({ thumbnail: base64 });
    setUserThumbnail(base64);
    notifications.show({
      title: t('common:success'),
      message: t('submenu:thumbnailUpdated'),
      color: 'green',
    });
  };

  const handleThumbnailSelected = async (file: File | null) => {
    if (!file) return;
    if (!validateThumbnailInput(file.type, file.size, file.name)) {
      return;
    }

    setIsUploadingThumbnail(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          const result = e.target?.result;
          const value = typeof result === 'string' ? result.split(',')[1] : null;
          if (!value) {
            reject(new Error('empty_result'));
            return;
          }
          resolve(value);
        };
        reader.onerror = () => reject(reader.error ?? new Error('file_read_error'));
        reader.readAsDataURL(file);
      });

      await uploadThumbnailBase64(base64);
    } catch (error) {
      console.error('Failed to update thumbnail', error);
      notifications.show({
        title: t('common:error'),
        message:
          error instanceof Error && error.message !== 'empty_result'
            ? error.message
            : t('submenu:thumbnailReadError'),
        color: 'red',
      });
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const openThumbnailPickerNative = async () => {
    try {
      await ensureNeutralinoReady();
      const selection = await os.showOpenDialog(t('submenu:updateThumbnail'), {
        filters: [
          {
            name: 'Images',
            extensions: ALLOWED_THUMBNAIL_EXTENSIONS.map(ext => ext.replace(/^\./, '')),
          },
        ],
        multiSelections: false,
      });
      const selectedPath = Array.isArray(selection) ? selection[0] : selection;
      if (!selectedPath) return;

      const fileName = getFileNameFromPath(selectedPath);
      let statsSize: number | null = null;
      try {
        const stats = await filesystem.getStats(selectedPath);
        statsSize = stats.size;
      } catch {
        // Best effort; we'll validate again after reading
      }

      const inferredMime = inferMimeFromName(fileName);
      if (!validateThumbnailInput(inferredMime, statsSize, fileName)) {
        return;
      }

      setIsUploadingThumbnail(true);
      const buffer = await filesystem.readBinaryFile(selectedPath);
      const finalSize = statsSize ?? buffer.byteLength;
      if (!validateThumbnailInput(inferredMime, finalSize, fileName)) {
        return;
      }

      const base64 = arrayBufferToBase64(buffer);
      await uploadThumbnailBase64(base64);
    } catch (error) {
      console.error('Failed to pick thumbnail (desktop)', error);
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('submenu:thumbnailUpdateError'),
        color: 'red',
      });
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const openThumbnailPicker = async (event?: MouseEvent | KeyboardEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    if (isUploadingThumbnail) return;

    if (isDesktop) {
      await openThumbnailPickerNative();
      return;
    }

    fileInputRef.current?.click();
  };

  const handleClearThumbnail = async (event?: MouseEvent | KeyboardEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    if (!userThumbnail || isUploadingThumbnail) return;

    setIsUploadingThumbnail(true);
    try {
      await backendRpc.user.updateProfile({ thumbnail: null });
      setUserThumbnail(null);
      notifications.show({
        title: t('common:success'),
        message: t('submenu:thumbnailCleared'),
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to clear thumbnail', error);
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('submenu:thumbnailUpdateError'),
        color: 'red',
      });
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const handleAvatarKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      openThumbnailPicker(event);
    }
  };

  const handleAvatarContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setAvatarMenuPosition({ x: event.clientX, y: event.clientY });
    setAvatarMenuOpened(true);
  };

  const headerContent = (
    <Group justify="space-between" align="center" wrap="nowrap" gap="sm" style={{ width: '100%' }}>
      <div style={{ flexShrink: 0 }}>
        {server ? (
          server.thumbnail ? (
            <Avatar
              src={`data:image/png;base64,${server.thumbnail}`}
              alt={server.name}
              size={32}
              radius="xl"
            />
          ) : (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '999px',
                backgroundColor: server.color || 'var(--mantine-color-gray-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {server.name.slice(0, 2).toUpperCase()}
            </div>
          )
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label={t('submenu:updateThumbnail')}
            onClick={openThumbnailPicker}
            onKeyDown={handleAvatarKeyDown}
            onContextMenu={handleAvatarContextMenu}
            style={{
              width: 32,
              height: 32,
              borderRadius: '999px',
              backgroundColor: 'var(--mantine-color-blue-6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: isUploadingThumbnail ? 'progress' : 'pointer',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {isUploadingThumbnail ? (
              <Loader size={16} color="white" />
            ) : userThumbnailDataUrl ? (
              <Avatar src={userThumbnailDataUrl} alt="User thumbnail" size={32} radius="xl" />
            ) : (
              <IconUserCircle size={20} />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              onClick={e => e.stopPropagation()}
              onChange={e => handleThumbnailSelected(e.target.files?.[0] || null)}
            />
          </div>
        )}
      </div>
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap" align="center">
          {isEditingTitle && !server ? (
            <TextInput
              value={spaceTitleDraft}
              onChange={e => setSpaceTitleDraft(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                  setSpaceTitleDraft(spaceTitle);
                }
              }}
              onKeyUp={e => {
                e.stopPropagation();
              }}
              size="xs"
              styles={{ input: { height: 26 } }}
              autoFocus
              onFocus={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onBlurCapture={() => {
                persistSpaceTitle(spaceTitleDraft);
                setIsEditingTitle(false);
              }}
              style={{ flex: 1 }}
            />
          ) : (
            <Text fw={600} size="md" truncate style={{ flex: 1 }}>
              {title}
            </Text>
          )}
          {!server && !isEditingTitle && (
            <span
              onClick={e => {
                e.stopPropagation();
                setSpaceTitleDraft(title);
                setIsEditingTitle(true);
              }}
              style={{ display: 'inline-flex', cursor: 'pointer', padding: 4 }}
              aria-label="Edit NodeRef name"
            >
              <IconEdit size={14} />
            </span>
          )}
          {server && (
            <IconChevronDown
              size={16}
              style={{
                flexShrink: 0,
                color: 'var(--mantine-color-dimmed)',
              }}
            />
          )}
        </Group>
        {subtitle && (
          <Text size="xs" c="dimmed" truncate>
            {subtitle}
          </Text>
        )}
      </Stack>
    </Group>
  );

  if (!server) {
    const wrapperStyle = {
      width: 'calc(100% + var(--mantine-spacing-sm) * 2)',
      height: 'calc(60px - 2px)',
      padding: 'var(--mantine-spacing-sm)',
      borderRadius: 0,
      transition: 'background-color 150ms ease',
      cursor: isEditingTitle ? 'default' : 'pointer',
      margin: 'calc(var(--mantine-spacing-md) * -1) calc(var(--mantine-spacing-sm) * -1)',
      display: 'flex',
      alignItems: 'center',
    } as const;

    return (
      <>
        {isEditingTitle ? (
          <div style={wrapperStyle}>{headerContent}</div>
        ) : (
          <UnstyledButton
            style={wrapperStyle}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--submenu-header-hover-bg)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={spotlight.open}
          >
            {headerContent}
          </UnstyledButton>
        )}
        {!server && (
          <Menu
            withinPortal
            opened={avatarMenuOpened}
            onChange={setAvatarMenuOpened}
            position="bottom-start"
            shadow="md"
            width={180}
          >
            <Menu.Target>
              <div
                style={{
                  position: 'fixed',
                  left: avatarMenuPosition.x,
                  top: avatarMenuPosition.y,
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                }}
              />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconUserCircle size={14} />}
                onClick={() => {
                  setAvatarMenuOpened(false);
                  openThumbnailPicker();
                }}
              >
                {t('submenu:updateThumbnail')}
              </Menu.Item>
              {userThumbnail && (
                <Menu.Item
                  color="red"
                  onClick={e => {
                    setAvatarMenuOpened(false);
                    handleClearThumbnail(e);
                  }}
                >
                  {t('submenu:clearThumbnail')}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </>
    );
  }

  return (
    <Menu withinPortal position="bottom-start" shadow="md" width={220}>
      <Menu.Target>
        <UnstyledButton
          style={{
            width: 'calc(100% + var(--mantine-spacing-sm) * 2)',
            height: 'calc(60px - 2px)',
            padding: 'var(--mantine-spacing-sm)',
            borderRadius: 0,
            transition: 'background-color 150ms ease',
            cursor: 'pointer',
            margin: 'calc(var(--mantine-spacing-md) * -1) calc(var(--mantine-spacing-sm) * -1)',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = 'var(--submenu-header-hover-bg)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {headerContent}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {server.serverType === 'alfresco' && server.isAdmin && (
          <Menu.Item
            leftSection={<IconSettings size={14} />}
            rightSection={<IconExternalLink size={12} />}
            onClick={handleOpenRepoAdmin}
          >
            {t('submenu:repoAdmin')}
          </Menu.Item>
        )}

        <Menu.Item leftSection={<IconFileText size={14} />} onClick={openLogsModal}>
          {t('submenu:logs')}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconEdit size={14} />} onClick={handleEdit}>
          {t('server:edit')}
        </Menu.Item>
        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={handleRemove}>
          {t('server:remove')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
