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

import { backendRpc, type LocalFile } from '@/core/ipc/backend';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { useLocalFilesStore } from '@/core/store/localFiles';
import { useIntersection, useMediaQuery } from '@mantine/hooks';
import { useTextEditorStore } from '@/core/store/textEditor';
import { useNavigation } from '@/hooks/useNavigation';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Checkbox,
  Menu,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { filesystem, os } from '@neutralinojs/lib';
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconFileImport,
  IconFileText,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
  IconTextWrap,
} from '@tabler/icons-react';
import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_FILE_BYTES = 250 * 1024 * 1024; // 250MB
const ACCEPTED_TYPES = {
  'text/*': ['.txt', '.md', '.log', '.json', '.csv', '.yaml', '.yml'],
  'application/json': ['.json'],
  'application/x-yaml': ['.yaml', '.yml'],
  'application/javascript': ['.js', '.mjs', '.cjs'],
  'text/javascript': ['.js', '.mjs', '.cjs'],
  'application/typescript': ['.ts', '.tsx'],
  'text/x-typescript': ['.ts', '.tsx'],
  'text/tsx': ['.tsx'],
};

const getFileNameFromPath = (path: string): string => {
  if (!path) return 'file';
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || 'file';
};

const textEncoder = new TextEncoder();

function getByteLength(value: string | null | undefined): number {
  if (!value) return 0;
  return textEncoder.encode(value).length;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function guessMimeFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs'))
    return 'application/javascript';
  if (lower.endsWith('.jsx')) return 'text/jsx';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'application/typescript';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.scss')) return 'text/x-scss';
  if (lower.endsWith('.less')) return 'text/x-less';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/x-yaml';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.log')) return 'text/plain';
  return null;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString();
}

const RELATIVE_TIME_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

function formatRelativeDate(
  value: Date | string | null,
  formatter: Intl.RelativeTimeFormat
): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  let duration = (date.getTime() - Date.now()) / 1000;

  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return '-';
}

function getFileIcon(name: string, providedType?: string | null) {
  const mime = providedType || guessMimeFromName(name) || undefined;
  return getFileIconByMimeType(mime || undefined);
}

export function LocalFilesPage() {
  const { t, i18n } = useTranslation(['localFiles', 'submenu']);
  const files = useLocalFilesStore(state => state.files);
  const loading = useLocalFilesStore(state => state.loading);
  const loadingMore = useLocalFilesStore(state => state.loadingMore);
  const error = useLocalFilesStore(state => state.error);
  const initialized = useLocalFilesStore(state => state.initialized);
  const setPage = useLocalFilesStore(state => state.setPage);
  const addFile = useLocalFilesStore(state => state.addFile);
  const removeFile = useLocalFilesStore(state => state.removeFile);
  const setLoading = useLocalFilesStore(state => state.setLoading);
  const setLoadingMore = useLocalFilesStore(state => state.setLoadingMore);
  const setError = useLocalFilesStore(state => state.setError);
  const setInitialized = useLocalFilesStore(state => state.setInitialized);
  const hasMoreItems = useLocalFilesStore(state => state.hasMoreItems);
  const nextOffset = useLocalFilesStore(state => state.nextOffset);
  const pageSize = useLocalFilesStore(state => state.pageSize);
  const sortBy = useLocalFilesStore(state => state.sortBy);
  const sortDir = useLocalFilesStore(state => state.sortDir);
  const setSort = useLocalFilesStore(state => state.setSort);

  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dropLoading, setDropLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuFile, setContextMenuFile] = useState<LocalFile | null>(null);
  const openRef = useRef<() => void>(null);
  const { ref: loadMoreRef, entry } = useIntersection({ threshold: 1 });
  const fetchAbortRef = useRef<AbortController | null>(null);
  const loadLocalTextFile = useTextEditorStore(state => state.loadLocalFile);
  const { navigate } = useNavigation();
  const fetchPageRef = useRef<
    | ((params: {
        reset?: boolean;
        query?: string;
        offset?: number;
        sort?: { sortBy?: typeof sortBy; sortDir?: typeof sortDir };
      }) => Promise<void>)
    | null
  >(null);
  const sortRef = useRef({ sortBy, sortDir });
  const skipFirstFilterEffect = useRef(true);
  const showTypeColumn = useMediaQuery('(min-width: 720px)');
  const showSizeColumn = useMediaQuery('(min-width: 820px)');
  const showCreatedColumn = useMediaQuery('(min-width: 920px)');
  const showLastModifiedColumn = useMediaQuery('(min-width: 1020px)');

  const filteredFiles = files; // now backend-driven filter
  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language || undefined, { numeric: 'auto' }),
    [i18n.language]
  );

  useEffect(() => {
    const existingIds = new Set(files.map(f => f.id));
    setSelectedIds(prev => prev.filter(id => existingIds.has(id)));
  }, [files]);

  const fetchPage = useCallback(
    async ({
      reset = false,
      query,
      offset = 0,
      sort,
    }: {
      reset?: boolean;
      query?: string;
      offset?: number;
      sort?: { sortBy?: typeof sortBy; sortDir?: typeof sortDir };
    }) => {
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const data = await backendRpc.localFiles.list({
          query,
          skipCount: offset,
          maxItems: pageSize || 20,
          sortBy: sort?.sortBy ?? sortBy,
          sortDir: sort?.sortDir ?? sortDir,
        });
        if (!controller.signal.aborted) {
          setPage(data, reset);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : t('localFiles:loadError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          if (reset) {
            setLoading(false);
            setInitialized(true);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
    [pageSize, setError, setInitialized, setLoading, setLoadingMore, setPage, sortBy, sortDir]
  );

  useEffect(() => {
    if (initialized) {
      return;
    }
    fetchPage({ reset: true, query: filter, offset: 0, sort: { sortBy, sortDir } });
  }, [initialized, fetchPage, filter, sortBy, sortDir]);

  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  useEffect(() => {
    sortRef.current = { sortBy, sortDir };
  }, [sortBy, sortDir]);

  const handleDelete = (file: LocalFile) => {
    modals.openConfirmModal({
      title: t('localFiles:deleteSingleTitle', {
        name: file.name,
      }),
      children: (
        <Text size="sm" c="dimmed">
          {t('localFiles:deleteSingleBody')}
        </Text>
      ),
      confirmProps: { color: 'red' },
      labels: {
        confirm: t('localFiles:delete'),
        cancel: t('localFiles:cancel'),
      },
      onConfirm: async () => {
        try {
          await backendRpc.localFiles.delete(file.id);
          removeFile(file.id);
          setSelectedIds(prev => prev.filter(id => id !== file.id));
          notifications.show({
            title: t('localFiles:deleteSuccessTitle'),
            message: t('localFiles:deleteSuccessMessage', {
              name: file.name,
            }),
            color: 'green',
          });
        } catch (err) {
          notifications.show({
            title: t('localFiles:deleteFailedTitle'),
            message: err instanceof Error ? err.message : t('localFiles:deleteFailedMessage'),
            color: 'red',
          });
        }
      },
    });
  };

  const refreshFiles = async () => {
    setRefreshing(true);
    setError(null);
    await fetchPage({ reset: true, query: filter, offset: 0, sort: { sortBy, sortDir } });
    setRefreshing(false);
  };

  const handleDrop = async (droppedFiles: File[]) => {
    if (droppedFiles.length === 0) return;
    setDropLoading(true);

    let imported = 0;
    let failed = 0;

    for (const file of droppedFiles) {
      try {
        const text = await file.text();
        const bytes = getByteLength(text);
        if (bytes > MAX_FILE_BYTES) {
          failed += 1;
          notifications.show({
            title: t('localFiles:fileTooLargeTitle'),
            message: t('localFiles:fileTooLargeMessage', {
              name: file.name,
              limit: formatBytes(MAX_FILE_BYTES),
            }),
            color: 'orange',
          });
          continue;
        }

        const created = await backendRpc.localFiles.create({
          name: file.name,
          content: text,
          type: file.type || guessMimeFromName(file.name) || 'text/plain',
        });
        addFile(created);
        imported += 1;
      } catch (err) {
        failed += 1;
        notifications.show({
          title: t('localFiles:importFailedTitle'),
          message:
            err instanceof Error
              ? err.message
              : t('localFiles:importFailedMessage', {
                  name: file.name,
                }),
          color: 'red',
        });
      }
    }

    if (imported > 0) {
      notifications.show({
        title: t('localFiles:importedTitle'),
        message: t('localFiles:importedMessage', {
          count: imported,
          plural: imported === 1 ? '' : 's',
        }),
        color: 'green',
      });
      await fetchPage({ reset: true, query: filter, offset: 0, sort: { sortBy, sortDir } });
      setSelectedIds([]);
    }
    if (failed > 0 && imported === 0) {
      notifications.show({
        title: t('localFiles:nothingImportedTitle'),
        message: t('localFiles:nothingImportedMessage', {
          limit: formatBytes(MAX_FILE_BYTES),
        }),
        color: 'orange',
      });
    }

    setDropLoading(false);
  };

  const handleReject = () => {
    notifications.show({
      title: t('localFiles:unsupportedTitle'),
      message: t('localFiles:unsupportedMessage', {
        limit: formatBytes(MAX_FILE_BYTES),
      }),
      color: 'orange',
    });
  };

  const handleBrowseFiles = useCallback(async () => {
    if (!isNeutralinoMode()) {
      openRef.current?.();
      return;
    }

    try {
      await ensureNeutralinoReady();
      const selection = await os.showOpenDialog(t('localFiles:browseFiles'), {
        multiSelections: true,
      });
      const selected = Array.isArray(selection) ? selection : selection ? [selection] : [];
      if (selected.length === 0) {
        return;
      }

      const files: File[] = [];
      for (const selectedPath of selected) {
        if (!selectedPath) continue;
        const buffer = await filesystem.readBinaryFile(selectedPath);
        const fileName = getFileNameFromPath(selectedPath);
        files.push(new File([buffer], fileName));
      }

      if (files.length > 0) {
        await handleDrop(files);
      }
    } catch (error) {
      console.error('Failed to pick files via Neutralino', error);
      notifications.show({
        title: t('localFiles:importFailedTitle'),
        message:
          error instanceof Error
            ? error.message
            : t('localFiles:importFailedMessage', { name: 'files' }),
        color: 'red',
      });
    }
  }, [handleDrop, t]);

  useEffect(() => {
    if (!initialized) {
      skipFirstFilterEffect.current = true;
      return;
    }

    if (skipFirstFilterEffect.current) {
      skipFirstFilterEffect.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      setSelectedIds([]);
      const { sortBy: currentSortBy, sortDir: currentSortDir } = sortRef.current;
      fetchPageRef.current?.({
        reset: true,
        query: filter,
        offset: 0,
        sort: { sortBy: currentSortBy, sortDir: currentSortDir },
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filter, initialized]);

  useEffect(() => {
    if (entry?.isIntersecting && hasMoreItems && !loading && !loadingMore) {
      fetchPage({ query: filter, offset: nextOffset, sort: { sortBy, sortDir } });
    }
  }, [entry, hasMoreItems, loading, loadingMore, fetchPage, filter, nextOffset, sortBy, sortDir]);

  const handleSort = (field: 'name' | 'lastModified' | 'createdAt' | 'type') => {
    const nextDir =
      sortBy === field
        ? sortDir === 'asc'
          ? 'desc'
          : 'asc'
        : field === 'lastModified'
          ? 'desc'
          : 'asc';
    setSort(field, nextDir);
    setSelectedIds([]);
    fetchPage({ reset: true, query: filter, offset: 0, sort: { sortBy: field, sortDir: nextDir } });
  };

  const renderSortIcon = (field: 'name' | 'lastModified' | 'createdAt' | 'type') => {
    if (sortBy !== field) return null;
    return sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />;
  };

  const handleOpenInEditor = (file: LocalFile) => {
    loadLocalTextFile({
      id: file.id,
      name: file.name,
      content: file.content ?? '',
      type: file.type ?? undefined,
    });
    navigate('text-editor');
  };

  const handleRowContextMenu = (event: MouseEvent, file: LocalFile) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuFile(file);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setContextMenuOpened(true);
  };

  const closeContextMenu = () => {
    setContextMenuOpened(false);
    setContextMenuFile(null);
  };

  const handleContextOpen = () => {
    if (!contextMenuFile) return;
    closeContextMenu();
    handleOpenInEditor(contextMenuFile);
  };

  const handleContextDelete = () => {
    if (!contextMenuFile) return;
    closeContextMenu();
    handleDelete(contextMenuFile);
  };

  const toggleSelectAll = (checked: boolean) => {
    const pageIds = filteredFiles.map(f => f.id);
    if (checked) {
      const merged = Array.from(new Set([...selectedIds, ...pageIds]));
      setSelectedIds(merged);
    } else {
      setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
    }
  };

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds(prev =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter(item => item !== id)
    );
  };

  const allVisibleSelected =
    filteredFiles.length > 0 && filteredFiles.every(file => selectedIds.includes(file.id));

  const anySelected = selectedIds.length > 0;

  const handleBulkDelete = () => {
    if (!anySelected) {
      notifications.show({
        title: t('localFiles:noSelectionTitle'),
        message: t('localFiles:noSelectionMessage'),
        color: 'orange',
      });
      return;
    }

    modals.openConfirmModal({
      title: t('localFiles:bulkDeleteTitle', {
        count: selectedIds.length,
        plural: selectedIds.length === 1 ? '' : 's',
      }),
      children: (
        <Text size="sm" c="dimmed">
          {t('localFiles:bulkDeleteBody')}
        </Text>
      ),
      confirmProps: { color: 'red' },
      labels: {
        confirm: t('localFiles:delete'),
        cancel: t('localFiles:cancel'),
      },
      onConfirm: async () => {
        setBulkDeleting(true);
        const idsToDelete = [...selectedIds];
        const results = await Promise.allSettled(
          idsToDelete.map(async id => {
            await backendRpc.localFiles.delete(id);
            removeFile(id);
          })
        );
        const failures = results.filter(r => r.status === 'rejected').length;
        const successes = results.length - failures;
        setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)));
        setBulkDeleting(false);

        if (successes > 0) {
          notifications.show({
            title: t('localFiles:bulkDeleteSuccessTitle'),
            message: t('localFiles:bulkDeleteSuccessMessage', {
              count: successes,
              plural: successes === 1 ? '' : 's',
            }),
            color: 'green',
          });
        }
        if (failures > 0) {
          notifications.show({
            title: t('localFiles:bulkDeletePartialTitle'),
            message: t('localFiles:bulkDeletePartialMessage', {
              count: failures,
              plural: failures === 1 ? '' : 's',
            }),
            color: 'orange',
          });
        }
        await fetchPage({ reset: true, query: filter, offset: 0, sort: { sortBy, sortDir } });
      },
    });
  };

  return (
    <Box p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder={t('localFiles:filterPlaceholder')}
            value={filter}
            onChange={event => setFilter(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Group gap="xs">
            <Button
              variant="light"
              onClick={refreshFiles}
              loading={refreshing}
              aria-label={t('localFiles:refresh')}
              title={t('localFiles:refresh')}
              px="xs"
            >
              <IconRefresh size={16} />
            </Button>
            <Tooltip
              label={t('localFiles:deleteSelectedCount', {
                count: selectedIds.length,
              })}
              disabled={!anySelected}
            >
              <Button
                variant="outline"
                color="red"
                onClick={handleBulkDelete}
                disabled={!anySelected}
                loading={bulkDeleting}
                aria-label={t('localFiles:deleteSelected')}
                px="xs"
              >
                <IconTrash size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />} variant="light">
            {error}
          </Alert>
        )}

        <Dropzone
          onDrop={handleDrop}
          onReject={handleReject}
          maxSize={MAX_FILE_BYTES}
          accept={ACCEPTED_TYPES}
          loading={dropLoading}
          openRef={openRef}
          activateOnClick={false}
          style={{ border: 'none', borderRadius: 12 }}
        >
          <Paper withBorder p="sm" style={{ position: 'relative', minHeight: 240 }}>
            <Group justify="space-between" align="center" mb="sm">
              <Group gap="xs">
                <IconUpload size={18} />
                <Text fw={600}>{t('localFiles:dragDropTitle')}</Text>
              </Group>
              <Button
                variant="subtle"
                leftSection={<IconFileImport size={16} />}
                onClick={handleBrowseFiles}
              >
                {t('localFiles:browseFiles')}
              </Button>
            </Group>

            {loading ? (
              <Group justify="center" align="center" style={{ height: 200 }}>
                <Loader />
              </Group>
            ) : filteredFiles.length === 0 ? (
              <Group
                justify="center"
                align="center"
                style={{ height: 200, color: 'var(--mantine-color-dimmed)' }}
              >
                <IconFileText size={24} />
                <Text size="sm">{t('localFiles:emptyState')}</Text>
              </Group>
            ) : (
              <ScrollArea>
                <Table highlightOnHover verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 32 }}>
                        <Checkbox
                          size="xs"
                          checked={allVisibleSelected}
                          indeterminate={anySelected && !allVisibleSelected}
                          onChange={event => toggleSelectAll(event.currentTarget.checked)}
                          aria-label={t('localFiles:selectAll')}
                        />
                      </Table.Th>
                      <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                        <Group gap={4} wrap="nowrap">
                          <Text size="sm" fw={600}>
                            {t('localFiles:columnName')}
                          </Text>
                          {renderSortIcon('name')}
                        </Group>
                      </Table.Th>
                      {showTypeColumn && (
                        <Table.Th style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" fw={600}>
                              {t('localFiles:columnType')}
                            </Text>
                            {renderSortIcon('type')}
                          </Group>
                        </Table.Th>
                      )}
                      {showSizeColumn && (
                        <Table.Th>
                          <Text size="sm" fw={600}>
                            {t('localFiles:columnSize')}
                          </Text>
                        </Table.Th>
                      )}
                      {showCreatedColumn && (
                        <Table.Th
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleSort('createdAt')}
                        >
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" fw={600}>
                              {t('localFiles:columnCreated')}
                            </Text>
                            {renderSortIcon('createdAt')}
                          </Group>
                        </Table.Th>
                      )}
                      {showLastModifiedColumn && (
                        <Table.Th
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleSort('lastModified')}
                        >
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" fw={600}>
                              {t('localFiles:columnLastModified')}
                            </Text>
                            {renderSortIcon('lastModified')}
                          </Group>
                        </Table.Th>
                      )}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredFiles.map(file => {
                      const FileIcon = getFileIcon(file.name, file.type);
                      return (
                        <Table.Tr
                          key={file.id}
                          onClick={() => handleOpenInEditor(file)}
                          onContextMenu={event => handleRowContextMenu(event, file)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Table.Td style={{ width: 32 }}>
                            <Checkbox
                              size="xs"
                              checked={selectedIds.includes(file.id)}
                              onChange={event => toggleRow(file.id, event.currentTarget.checked)}
                              aria-label={t('localFiles:selectFile', {
                                name: file.name,
                              })}
                              onClick={event => event.stopPropagation()}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                              <FileIcon size={16} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  size="sm"
                                  fw={500}
                                  lineClamp={1}
                                  style={{
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {file.name}
                                </Text>
                              </div>
                            </Group>
                          </Table.Td>
                          {showTypeColumn && (
                            <Table.Td>
                              <Badge variant="light" size="xs" radius="xs">
                                {file.type || 'text/plain'}
                              </Badge>
                            </Table.Td>
                          )}
                          {showSizeColumn && (
                            <Table.Td>
                              <Text size="sm">{formatBytes(getByteLength(file.content))}</Text>
                            </Table.Td>
                          )}
                          {showCreatedColumn && (
                            <Table.Td>
                              <Tooltip label={formatDate(file.createdAt)}>
                                <Text size="sm">
                                  {formatRelativeDate(file.createdAt, relativeTimeFormatter)}
                                </Text>
                              </Tooltip>
                            </Table.Td>
                          )}
                          {showLastModifiedColumn && (
                            <Table.Td>
                              <Tooltip label={formatDate(file.lastModified ?? file.createdAt)}>
                                <Text size="sm">
                                  {formatRelativeDate(
                                    file.lastModified ?? file.createdAt,
                                    relativeTimeFormatter
                                  )}
                                </Text>
                              </Tooltip>
                            </Table.Td>
                          )}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
                {hasMoreItems && (
                  <Group ref={loadMoreRef} justify="center" p="sm">
                    {loadingMore ? (
                      <Loader size="sm" />
                    ) : (
                      <Text size="xs">{t('localFiles:loadingMore')}</Text>
                    )}
                  </Group>
                )}
              </ScrollArea>
            )}
          </Paper>
        </Dropzone>
      </Stack>

      <Menu
        opened={contextMenuOpened}
        onChange={opened => {
          setContextMenuOpened(opened);
          if (!opened) {
            setContextMenuFile(null);
          }
        }}
        onClose={closeContextMenu}
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
          <Menu.Item leftSection={<IconTextWrap size={14} />} onClick={handleContextOpen}>
            {t('submenu:textEditor')}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconTrash size={14} />}
            color="red"
            onClick={handleContextDelete}
          >
            {t('localFiles:delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
