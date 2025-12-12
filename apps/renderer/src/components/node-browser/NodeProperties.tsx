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

import { buildStreamUrl } from '@/core/ipc/alfresco';
import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { backendRpc } from '@/core/ipc/backend';
import { ensureNeutralinoReady } from '@/core/ipc/neutralino';
import { useServersStore } from '@/core/store/servers';
import { formatBytes } from '@/utils/formatBytes';
import {
  ActionIcon,
  Badge,
  Box,
  Center,
  Code,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import type { NotificationData, NotificationsProps } from '@mantine/notifications';
import { notifications } from '@mantine/notifications';
import { filesystem, os } from '@neutralinojs/lib';
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconSearch,
  IconSelector,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NodePropertiesProps {
  properties: AlfrescoNodeDetails['properties'];
  serverId: number;
  nodeId: string;
  nodeName: string;
}

type SortColumn = 'name' | 'type' | 'value';
type SortDirection = 'asc' | 'desc';

export function NodeProperties({ properties, serverId, nodeId, nodeName }: NodePropertiesProps) {
  const { t } = useTranslation(['nodeBrowser']);
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterText, setFilterText] = useState('');
  const notificationPosition: NotificationsProps['position'] = 'bottom-center';
  const showNotification = (data: NotificationData) =>
    notifications.show({
      position: notificationPosition,
      withCloseButton: true,
      autoClose: 6000,
      ...data,
    });
  const getServerById = useServersStore(state => state.getServerById);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedProperties = useMemo(() => {
    // First filter
    let filtered = properties;
    if (filterText.trim()) {
      const lowerFilter = filterText.toLowerCase();
      filtered = properties.filter(prop => {
        // Search in property name
        const nameMatches = prop.name.prefixedName.toLowerCase().includes(lowerFilter);

        // Search in property values
        const valueMatches = prop.values.some(v => {
          const val = v.value;
          if (typeof val === 'boolean') {
            return (val ? 'true' : 'false').includes(lowerFilter);
          }
          if (typeof val === 'object') {
            return JSON.stringify(val).toLowerCase().includes(lowerFilter);
          }
          return String(val).toLowerCase().includes(lowerFilter);
        });

        return nameMatches || valueMatches;
      });
    }

    // Then sort
    const sorted = [...filtered].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      if (sortColumn === 'name') {
        aValue = a.name.prefixedName.toLowerCase();
        bValue = b.name.prefixedName.toLowerCase();
      } else if (sortColumn === 'type') {
        aValue = a.type.prefixedName.toLowerCase();
        bValue = b.type.prefixedName.toLowerCase();
      } else {
        // Sort by value
        aValue = formatValueForSort(a.values);
        bValue = formatValueForSort(b.values);
      }

      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });

    return sorted;
  }, [properties, sortColumn, sortDirection, filterText]);

  const formatValueForSort = (values: any[]): string => {
    if (values.length === 0) return '';
    const val = values[0].value;
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val).toLowerCase();
  };

  const handleDownloadContent = async (propertyName: string = 'cm:content') => {
    const nlPort = (window as any).NL_PORT;
    const neutralinoApiAvailable =
      typeof (window as any).Neutralino?.os?.showSaveDialog === 'function' &&
      typeof (window as any).Neutralino?.os?.getPath === 'function';
    const neutralinoTokenPresent = Boolean((window as any).NL_TOKEN);
    const neutralinoAvailable = Boolean(nlPort && neutralinoApiAvailable && neutralinoTokenPresent);

    try {
      const server = getServerById(serverId);
      if (!server?.baseUrl) {
        throw new Error('Server not found');
      }

      let blob: Blob;
      let fileName: string;

      if (propertyName === 'cm:content') {
        const streamUrl = await buildStreamUrl('nodes.getNodeContent', {
          baseUrl: server.baseUrl,
          serverId,
          nodeId: nodeId,
        });
        const response = await fetch(streamUrl, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Failed to download content: ${response.statusText}`);
        }
        blob = await response.blob();
        fileName = nodeName && nodeName.trim() ? nodeName.trim() : `content-${nodeId}`;
      } else {
        const result = await backendRpc.repository.getSlingshotContent(
          serverId,
          nodeId,
          propertyName
        );
        const uint8Array = new Uint8Array(result.buffer.data);
        blob = new Blob([uint8Array], { type: result.contentType });
        fileName = nodeName && nodeName.trim() ? nodeName.trim() : `content-${nodeId}`;
      }

      const safeFileName =
        fileName && fileName.trim() ? fileName.trim() : `content-${nodeId || 'download'}.bin`;
      const resolveSavePath = (chosenPath: string | null, fallbackPath: string) => {
        // If dialog returned nothing, use the suggested full path
        const raw = (chosenPath || '').trim() || fallbackPath.trim();
        if (!raw) return null;

        // If user picked a directory (ends with slash), append filename
        const isDirOnly = raw.endsWith('/') || raw.endsWith('\\');
        const lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
        const dir = lastSlash >= 0 ? raw.slice(0, lastSlash + (isDirOnly ? 0 : 1)) : '';
        const base = isDirOnly ? '' : lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;

        const sanitizedBase =
          !base || base.toLowerCase() === 'naamloos' || base.toLowerCase() === 'untitled'
            ? safeFileName
            : base;

        if (dir) {
          return `${dir.replace(/[\\/]+$/, '')}/${sanitizedBase}`;
        }
        return sanitizedBase;
      };
      const arrayBuffer = await blob.arrayBuffer();

      if (neutralinoAvailable) {
        try {
          await ensureNeutralinoReady();
          let defaultSuggestedPath = safeFileName;

          try {
            const downloadsDir = await os.getPath('downloads');
            if (downloadsDir) {
              defaultSuggestedPath = `${downloadsDir}/${safeFileName}`;
            }
          } catch {
            // ignore path resolution errors, fallback to filename only
          }

          const savePath = await os.showSaveDialog(t('nodeBrowser:desktopSaveDialogTitle'), {
            defaultPath: defaultSuggestedPath,
          });

          const finalPath = resolveSavePath(savePath, defaultSuggestedPath);

          if (!finalPath) {
            showNotification({
              title: t('nodeBrowser:downloadCancelled'),
              message: t('nodeBrowser:desktopDownloadCancelled'),
              color: 'yellow',
              autoClose: 4000,
            });
            // Fall back to browser download to keep the flow working even if the native dialog returns empty
          }

          if (finalPath) {
            await filesystem.writeBinaryFile(finalPath, arrayBuffer);

            showNotification({
              title: t('nodeBrowser:downloadSuccess'),
              message: t('nodeBrowser:desktopDownloadSaved', {
                path: finalPath,
                bytes: arrayBuffer.byteLength,
              }),
              color: 'green',
            });

            return;
          }
        } catch (desktopError) {
          showNotification({
            title: t('nodeBrowser:desktopDownloadFallback'),
            message:
              desktopError instanceof Error
                ? desktopError.message
                : t('nodeBrowser:desktopDownloadFallbackMessage'),
            color: 'orange',
            autoClose: 5000,
          });
        }
      }

      // Browser (and desktop fallback) download logic
      const fileForBrowser = new File([blob], safeFileName, {
        type: blob.type || 'application/octet-stream',
      });
      const url = URL.createObjectURL(fileForBrowser);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeFileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      showNotification({
        title: t('nodeBrowser:downloadSuccess'),
        message: t('nodeBrowser:contentDownloaded'),
        color: 'green',
        autoClose: 5000,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download content';
      showNotification({
        title: t('nodeBrowser:downloadError'),
        message: neutralinoAvailable
          ? t('nodeBrowser:desktopDownloadError', {
              message: errorMessage,
            })
          : errorMessage,
        color: 'red',
        autoClose: 6000,
      });
    }
  };

  const formatValue = (values: any[], propertyName: string) => {
    if (values.length === 0) return '-';
    if (values.length === 1) {
      const val = values[0].value;
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (typeof val === 'object') return JSON.stringify(val);
      const valueStr = String(val);

      // Check if this is cm:content or cm:preferenceValues property (contains contentUrl)
      // Property name can be 'cm:content' or 'd:content' depending on the type
      const isContentProperty =
        (propertyName === 'cm:content' ||
          propertyName === 'cm:preferenceValues' ||
          propertyName.toLowerCase().includes('content')) &&
        valueStr.includes('contentUrl=');
      if (isContentProperty) {
        return (
          <Group gap="xs" wrap="nowrap" style={{ alignItems: 'flex-start', width: '100%' }}>
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" style={{ wordBreak: 'break-word' }}>
                {valueStr}
              </Text>
              {(() => {
                const match = valueStr.match(/size=(\d+)/);
                if (match && match[1]) {
                  const size = parseInt(match[1], 10);
                  if (!isNaN(size)) {
                    return (
                      <Badge variant="light" color="gray" size="sm" radius="sm">
                        {formatBytes(size)}
                      </Badge>
                    );
                  }
                }
                return null;
              })()}
            </Stack>
            <Tooltip label={t('nodeBrowser:downloadContent')}>
              <ActionIcon
                variant="light"
                color="blue"
                size="md"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDownloadContent(propertyName);
                }}
                style={{ flexShrink: 0, cursor: 'pointer' }}
              >
                <IconDownload size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      }

      return valueStr;
    }
    // Multiple values
    return values.map((v, idx) => (
      <div key={idx} style={{ marginBottom: '4px' }}>
        <Code>{String(v.value)}</Code>
      </div>
    ));
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <IconSelector size={14} />;
    }
    return sortDirection === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
  };

  return (
    <Stack gap="md" p="md">
      <Paper withBorder p="md">
        <Group justify="space-between" mb="md">
          <TextInput
            placeholder={t('nodeBrowser:filterProperties')}
            leftSection={<IconSearch size={16} />}
            value={filterText}
            onChange={e => setFilterText(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <Text size="sm" c="dimmed">
            {filteredAndSortedProperties.length === properties.length
              ? `${properties.length} ${t('nodeBrowser:propertiesCount')}`
              : `${filteredAndSortedProperties.length} / ${properties.length}`}
          </Text>
        </Group>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '35%' }}>
                <UnstyledButton onClick={() => handleSort('name')} style={{ width: '100%' }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={700} size="sm">
                      {t('nodeBrowser:name')}
                    </Text>
                    <Center>
                      <SortIcon column="name" />
                    </Center>
                  </Group>
                </UnstyledButton>
              </Table.Th>
              <Table.Th style={{ width: '20%' }}>
                <UnstyledButton onClick={() => handleSort('type')} style={{ width: '100%' }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={700} size="sm">
                      {t('nodeBrowser:type')}
                    </Text>
                    <Center>
                      <SortIcon column="type" />
                    </Center>
                  </Group>
                </UnstyledButton>
              </Table.Th>
              <Table.Th>
                <UnstyledButton onClick={() => handleSort('value')} style={{ width: '100%' }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={700} size="sm">
                      {t('nodeBrowser:value')}
                    </Text>
                    <Center>
                      <SortIcon column="value" />
                    </Center>
                  </Group>
                </UnstyledButton>
              </Table.Th>
              <Table.Th style={{ width: '15%' }}>
                <Text fw={700} size="sm">
                  {t('nodeBrowser:readonly')}
                </Text>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredAndSortedProperties.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4} style={{ textAlign: 'center' }}>
                  <Text c="dimmed" size="sm">
                    {filterText.trim()
                      ? t('nodeBrowser:noMatchingProperties')
                      : t('nodeBrowser:noProperties')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredAndSortedProperties.map((prop, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {prop.name.prefixedName}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color="gray"
                      size="sm"
                      radius="sm"
                      style={{ textTransform: 'none' }}
                    >
                      {prop.type.prefixedName}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Box
                      style={{ fontSize: 'var(--mantine-font-size-sm)', wordBreak: 'break-word' }}
                    >
                      {formatValue(prop.values, prop.name.prefixedName)}
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={prop.residual ? 'red' : 'gray'} size="sm" radius="sm">
                      {prop.residual ? t('nodeBrowser:false') : t('nodeBrowser:false')}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
