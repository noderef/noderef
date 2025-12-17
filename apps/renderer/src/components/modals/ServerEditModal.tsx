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

import { call as alfrescoCall } from '@/core/ipc/alfresco';
import { backendRpc, refreshWorkspace } from '@/core/ipc/backend';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Code,
  ColorPicker,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  useComputedColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { filesystem, os } from '@neutralinojs/lib';
import { IconEdit, IconInfoCircle, IconPalette, IconSettings } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './SettingsModal.module.css';

type ServerEditSection = 'general' | 'appearance' | 'info';

interface UsageData {
  lastUpdate?: number;
  users?: number;
  documents?: number;
  licenseMode?: string;
  readOnly?: boolean;
  updated?: boolean;
  licenseValidUntil?: number;
  licenseHolder?: string;
  level?: number;
  warnings?: string[];
  errors?: string[];
}

export function ServerEditModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.SERVER_EDIT);
  const { t } = useTranslation('server');
  const getServerById = useServersStore(state => state.getServerById);
  const setServers = useServersStore(state => state.setServers);
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = colorScheme === 'dark';

  // Payload should be serverId (number)
  const serverId = typeof payload === 'number' ? payload : null;
  const server = getServerById(serverId);

  const [activeSection, setActiveSection] = useState<ServerEditSection>('general');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [jsconsoleEndpoint, setJsconsoleEndpoint] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailPicking, setThumbnailPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const isDesktop = isNeutralinoMode();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const MAX_THUMBNAIL_BYTES = 256 * 1024;
  const ALLOWED_THUMBNAIL_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
  const ALLOWED_THUMBNAIL_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

  const inferMimeFromName = (name?: string | null): string | null => {
    if (!name) return null;
    const lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    return null;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  };

  const getFileNameFromPath = (path: string): string => {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  };

  useEffect(() => {
    if (server && isOpen) {
      setName(server.name);
      setBaseUrl(server.baseUrl);
      setJsconsoleEndpoint(server.jsconsoleEndpoint || '');
      setColor(server.color || null);
      setLabel(server.label || null);
      setThumbnail(server.thumbnail || null);
      setActiveSection('general');
      setUsageData(null);
      setUsageError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [server, isOpen]);

  // Fetch usage data when Info tab is active and server is Alfresco
  useEffect(() => {
    if (
      server &&
      isOpen &&
      activeSection === 'info' &&
      server.serverType === 'alfresco' &&
      !usageData &&
      !usageLoading &&
      !usageError
    ) {
      setUsageLoading(true);
      setUsageError(null);

      alfrescoCall(
        'webscript.executeWebScript',
        ['GET', 'api/admin/usage', {}, 'alfresco', 'service'],
        server.baseUrl,
        server.id
      )
        .then(response => {
          if (response && typeof response === 'object' && 'entry' in response) {
            setUsageData((response as { entry: UsageData }).entry);
          } else {
            setUsageData(response as UsageData);
          }
          setUsageLoading(false);
        })
        .catch(error => {
          console.error('Failed to fetch usage data:', error);
          setUsageError(error instanceof Error ? error.message : t('failedToFetchUsageData'));
          setUsageLoading(false);
        });
    }
  }, [server, isOpen, activeSection]);

  const validateJsconsoleEndpoint = (value: string): boolean => {
    if (!value.trim()) return true; // Optional field
    // Should not start with slash (service prefix is added automatically)
    return !value.trim().startsWith('/');
  };

  const validateThumbnail = (
    mime: string | null | undefined,
    size: number | null | undefined,
    name?: string | null
  ): boolean => {
    const normalizedMime = mime?.toLowerCase() || inferMimeFromName(name);
    if (!normalizedMime || !ALLOWED_THUMBNAIL_MIMES.has(normalizedMime)) {
      notifications.show({
        title: t('invalidFileType'),
        message: t('invalidFileTypeMessage'),
        color: 'red',
      });
      return false;
    }

    if (size !== null && size !== undefined && size > MAX_THUMBNAIL_BYTES) {
      notifications.show({
        title: t('fileTooLarge'),
        message: t('fileTooLargeMessage'),
        color: 'red',
      });
      return false;
    }

    return true;
  };

  const handleThumbnailChange = (file: File | null) => {
    if (!file) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (!validateThumbnail(file.type, file.size, file.name)) {
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        setThumbnail(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleThumbnailPickDesktop = async () => {
    setThumbnailPicking(true);
    try {
      await ensureNeutralinoReady();
      const selection = await os.showOpenDialog(t('thumbnail'), {
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
      let fileSize: number | null = null;
      try {
        const stats = await filesystem.getStats(selectedPath);
        fileSize = stats.size;
      } catch {
        // best effort
      }

      const inferredMime = inferMimeFromName(fileName);
      if (!validateThumbnail(inferredMime, fileSize, fileName)) {
        return;
      }

      const buffer = await filesystem.readBinaryFile(selectedPath);
      const finalSize = fileSize ?? buffer.byteLength;
      if (!validateThumbnail(inferredMime, finalSize, fileName)) {
        return;
      }

      const base64 = arrayBufferToBase64(buffer);
      setThumbnail(base64);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to pick thumbnail (desktop)', error);
      notifications.show({
        title: t('updateError'),
        message: error instanceof Error ? error.message : t('updateErrorMessage'),
        color: 'red',
      });
    } finally {
      setThumbnailPicking(false);
    }
  };

  const handleThumbnailPick = async () => {
    if (thumbnailPicking) return;
    if (isDesktop) {
      await handleThumbnailPickDesktop();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSave = async () => {
    if (!server) return;

    setLoading(true);
    try {
      await backendRpc.servers.update(server.id, {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        jsconsoleEndpoint: jsconsoleEndpoint.trim() || null,
        color: color || null,
        label: label?.trim() || null,
        thumbnail: thumbnail || null,
      });

      // Refresh workspace to get updated server data
      const workspace = await refreshWorkspace();
      setServers(workspace.servers);

      notifications.show({
        title: t('success'),
        message: t('serverUpdated', {
          name,
        }),
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: t('updateError'),
        message: error instanceof Error ? error.message : t('updateErrorMessage'),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    name.trim().length > 0 &&
    baseUrl.trim().length > 0 &&
    validateJsconsoleEndpoint(jsconsoleEndpoint);

  const menuItems = [
    {
      key: 'general' as ServerEditSection,
      label: t('general'),
      icon: IconSettings,
      description: t('generalDescription'),
    },
    {
      key: 'appearance' as ServerEditSection,
      label: t('appearance'),
      icon: IconPalette,
      description: t('appearanceDescription'),
    },
    {
      key: 'info' as ServerEditSection,
      label: t('info'),
      icon: IconInfoCircle,
      description: t('infoDescription'),
    },
  ];

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title={
        <Group gap="xs" ml="sm">
          <IconEdit size={24} stroke={1.5} />
          <Text size="xl" fw={600}>
            {t('editServer')}
          </Text>
        </Group>
      }
      size="xl"
      centered
      trapFocus
      returnFocus
      closeOnClickOutside
      closeOnEscape
      transitionProps={{ duration: 300, transition: 'fade' }}
      withCloseButton={true}
    >
      {server ? (
        <Group align="stretch" gap={0} style={{ height: '600px' }}>
          {/* Navbar on the left */}
          <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
              {menuItems.map(item => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.key}
                    className={classes.link}
                    data-active={activeSection === item.key || undefined}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      setActiveSection(item.key);
                    }}
                  >
                    <Icon className={classes.linkIcon} stroke={1.5} />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          </nav>

          {/* Content area on the right */}
          <Box className={classes.contentArea}>
            {(() => {
              const activeItem = menuItems.find(item => item.key === activeSection);
              if (!activeItem) return null;

              const ActiveIcon = activeItem.icon;

              return (
                <Stack gap="lg">
                  {/* Title with icon */}
                  <Group gap="sm">
                    <ActiveIcon size={24} stroke={1.5} />
                    <Text size="xl" fw={600}>
                      {activeItem.label}
                    </Text>
                  </Group>

                  {/* Intro text */}
                  <Text size="sm" c="dimmed" mb={0}>
                    {activeItem.description}
                  </Text>

                  {/* Content */}
                  {activeSection === 'general' && (
                    <Stack gap="lg" mt={4}>
                      <div>
                        <Text size="sm" fw={500} mb="xs">
                          {t('label')}
                        </Text>
                        <Text size="xs" c="dimmed" mb="sm">
                          {t('labelDescription')}
                        </Text>
                        <Group gap="md" align="center">
                          <div
                            style={{
                              flex: '0 0 auto',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ position: 'relative', width: 56, height: 56 }}>
                              {thumbnail ? (
                                <Avatar
                                  src={`data:image/png;base64,${thumbnail}`}
                                  alt={name}
                                  size={56}
                                  radius="xl"
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 'var(--mantine-radius-xl)',
                                    backgroundColor: color || 'var(--mantine-color-gray-3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '1rem',
                                  }}
                                >
                                  {name.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              {label && (
                                <Badge
                                  size="xs"
                                  variant="filled"
                                  style={{
                                    position: 'absolute',
                                    bottom: -2,
                                    right: -2,
                                    minWidth: 'auto',
                                    height: 18,
                                    padding: '0 5px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    lineHeight: 1,
                                    pointerEvents: 'none',
                                    backgroundColor: 'var(--mantine-color-gray-7)',
                                    color: 'var(--mantine-color-gray-0)',
                                  }}
                                >
                                  {label}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <TextInput
                              placeholder={t('labelPlaceholder')}
                              value={label || ''}
                              onChange={e =>
                                setLabel(e.currentTarget.value.trim().toUpperCase() || null)
                              }
                              maxLength={4}
                              styles={{
                                input: {
                                  textTransform: 'uppercase',
                                },
                              }}
                            />
                          </div>
                        </Group>
                      </div>
                      <TextInput
                        label={t('serverName')}
                        value={name}
                        onChange={e => setName(e.currentTarget.value)}
                        required
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                      <TextInput
                        label={t('serverUrl')}
                        value={baseUrl}
                        readOnly
                        required
                        type="url"
                        styles={{
                          input: {
                            cursor: 'not-allowed',
                            backgroundColor: isDark
                              ? 'var(--mantine-color-dark-6)'
                              : 'var(--mantine-color-gray-0)',
                          },
                        }}
                      />
                      <TextInput
                        label={t('jsConsoleEndpoint')}
                        description={t('jsConsoleEndpointDescription')}
                        placeholder={t('jsConsoleEndpointPlaceholder')}
                        value={jsconsoleEndpoint}
                        onChange={e => {
                          // Remove leading slashes and service prefix if user adds them
                          const cleanValue = e.currentTarget.value
                            .replace(/^\/+/, '')
                            .replace(/^s\//, '');
                          setJsconsoleEndpoint(cleanValue);
                        }}
                      />
                      <Group justify="flex-end" mt="md">
                        <Button variant="subtle" onClick={close} disabled={loading}>
                          {t('cancel')}
                        </Button>
                        <Button
                          onClick={handleSave}
                          disabled={!isValid || loading}
                          loading={loading}
                        >
                          {t('save')}
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {activeSection === 'appearance' && (
                    <Stack gap="lg" mt={4}>
                      <div>
                        <Text size="sm" fw={500} mb="xs">
                          {t('color')}
                        </Text>
                        <ColorPicker
                          value={color || '#868e96'}
                          onChange={value => setColor(value || null)}
                          format="hex"
                          swatches={[
                            '#25262b',
                            '#868e96',
                            '#fa5252',
                            '#e64980',
                            '#be4bdb',
                            '#7950f2',
                            '#4c6ef5',
                            '#228be6',
                            '#15aabf',
                            '#12b886',
                            '#40c057',
                            '#82c91e',
                            '#fab005',
                            '#fd7e14',
                          ]}
                          fullWidth
                        />
                      </div>
                      <div>
                        <Text size="sm" fw={500} mb={4}>
                          {t('thumbnail')}
                        </Text>
                        {thumbnail && (
                          <Group gap="sm" mb="sm">
                            <Avatar
                              src={`data:image/png;base64,${thumbnail}`}
                              alt={t('thumbnail')}
                              size={48}
                              radius="sm"
                            />
                            <Button
                              variant="subtle"
                              size="xs"
                              onClick={() => {
                                setThumbnail(null);
                                if (fileInputRef.current) {
                                  fileInputRef.current.value = '';
                                }
                              }}
                            >
                              {t('removeThumbnail')}
                            </Button>
                          </Group>
                        )}
                        <Button
                          variant="default"
                          size="xs"
                          onClick={handleThumbnailPick}
                          loading={thumbnailPicking}
                          mb="xs"
                        >
                          {t('thumbnailPlaceholder')}
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/jpg,image/png"
                          style={{ display: 'none' }}
                          onChange={e => handleThumbnailChange(e.target.files?.[0] || null)}
                        />
                        <Text size="xs" c="dimmed" mt={4}>
                          {t('thumbnailHelp')}
                        </Text>
                      </div>
                      <Group justify="flex-end" mt="md">
                        <Button variant="subtle" onClick={close} disabled={loading}>
                          {t('cancel')}
                        </Button>
                        <Button
                          onClick={handleSave}
                          disabled={!isValid || loading}
                          loading={loading}
                        >
                          {t('save')}
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {activeSection === 'info' && (
                    <Stack gap="md" mt={4}>
                      {server.serverType === 'alfresco' ? (
                        <>
                          {usageLoading && (
                            <Group justify="center" py="xl">
                              <Loader size="sm" />
                              <Text size="sm" c="dimmed">
                                {t('loadingUsageData')}
                              </Text>
                            </Group>
                          )}
                          {usageError && (
                            <Alert color="red" title={t('error')}>
                              {usageError}
                            </Alert>
                          )}
                          {usageData && !usageLoading && (
                            <>
                              {usageData.lastUpdate && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('lastUpdate')}
                                  </Text>
                                  <Text size="sm">
                                    {new Date(usageData.lastUpdate).toLocaleString()}
                                  </Text>
                                </Group>
                              )}
                              {usageData.users !== undefined && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('users')}
                                  </Text>
                                  <Text size="sm">{usageData.users}</Text>
                                </Group>
                              )}
                              {usageData.documents !== undefined && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('documents')}
                                  </Text>
                                  <Text size="sm">{usageData.documents}</Text>
                                </Group>
                              )}
                              {usageData.licenseMode && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('licenseMode')}
                                  </Text>
                                  <Badge>{usageData.licenseMode}</Badge>
                                </Group>
                              )}
                              {usageData.readOnly !== undefined && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('readOnly')}
                                  </Text>
                                  <Badge color={usageData.readOnly ? 'orange' : 'green'}>
                                    {usageData.readOnly ? t('yes') : t('no')}
                                  </Badge>
                                </Group>
                              )}
                              {usageData.updated !== undefined && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('updated')}
                                  </Text>
                                  <Badge color={usageData.updated ? 'green' : 'gray'}>
                                    {usageData.updated ? t('yes') : t('no')}
                                  </Badge>
                                </Group>
                              )}
                              {usageData.licenseValidUntil && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('licenseValidUntil')}
                                  </Text>
                                  <Text size="sm">
                                    {new Date(usageData.licenseValidUntil).toLocaleDateString()}
                                  </Text>
                                </Group>
                              )}
                              {usageData.licenseHolder && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('licenseHolder')}
                                  </Text>
                                  <Text size="sm">{usageData.licenseHolder}</Text>
                                </Group>
                              )}
                              {usageData.level !== undefined && (
                                <Group>
                                  <Text fw={500} size="sm" style={{ minWidth: '150px' }}>
                                    {t('level')}
                                  </Text>
                                  <Text size="sm">{usageData.level}</Text>
                                </Group>
                              )}
                              {usageData.warnings &&
                                Array.isArray(usageData.warnings) &&
                                usageData.warnings.length > 0 && (
                                  <div>
                                    <Text fw={500} size="sm" mb="xs">
                                      {t('warnings')}
                                    </Text>
                                    <Stack gap="xs">
                                      {usageData.warnings.map((warning: string, index: number) => (
                                        <Alert key={index} color="yellow" title={t('warning')}>
                                          {warning}
                                        </Alert>
                                      ))}
                                    </Stack>
                                  </div>
                                )}
                              {usageData.errors &&
                                Array.isArray(usageData.errors) &&
                                usageData.errors.length > 0 && (
                                  <div>
                                    <Text fw={500} size="sm" mb="xs">
                                      {t('errors')}
                                    </Text>
                                    <Stack gap="xs">
                                      {usageData.errors.map((error: string, index: number) => (
                                        <Alert key={index} color="red" title={t('error')}>
                                          {error}
                                        </Alert>
                                      ))}
                                    </Stack>
                                  </div>
                                )}
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <Group>
                            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
                              {t('name')}
                            </Text>
                            <Text size="sm">{server.name}</Text>
                          </Group>
                          <Group>
                            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
                              {t('baseUrl')}
                            </Text>
                            <Code style={{ wordBreak: 'break-all' }}>{server.baseUrl}</Code>
                          </Group>
                          <Group>
                            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
                              {t('id')}
                            </Text>
                            <Code>{server.id}</Code>
                          </Group>
                          <Group>
                            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
                              {t('serverType')}
                            </Text>
                            <Badge>{server.serverType}</Badge>
                          </Group>
                        </>
                      )}
                    </Stack>
                  )}
                </Stack>
              );
            })()}
          </Box>
        </Group>
      ) : (
        <Text c="dimmed" size="sm">
          {t('serverNotFound')}
        </Text>
      )}
    </Modal>
  );
}
