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

import { BrandLogo } from '@/components/BrandLogo';
import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { backendRpc, type SavedSearch } from '@/core/ipc/backend';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useSavedSearchesStore } from '@/core/store/savedSearches';
import { type SearchResult } from '@/core/store/search';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import {
  Box,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useIntersection } from '@mantine/hooks';
import { IconAlertCircle, IconFolder, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Pagination = {
  hasMoreItems?: boolean;
  skipCount?: number;
  maxItems?: number;
  totalItems?: number;
};

const parseColumns = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(item => (typeof item === 'string' ? item : '')).filter(Boolean);
    }
  } catch {
    // Ignore JSON parse errors and fall through
  }
  return [];
};

const formatPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) {
    return value.map(v => formatPropertyValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    if (
      'displayName' in (value as Record<string, unknown>) &&
      typeof (value as any).displayName === 'string'
    ) {
      return (value as any).displayName;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const formatRelativeTime = (date: string) => {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let duration = (new Date(date).getTime() - Date.now()) / 1000;
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Infinity, unit: 'year' },
  ];
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), 'year');
};

export function SavedSearchPage() {
  const { t } = useTranslation('search');
  const activeSavedSearchId = useSavedSearchesStore(state => state.activeSavedSearchId);
  const getSavedSearchById = useSavedSearchesStore(state => state.getSavedSearchById);
  const addSavedSearch = useSavedSearchesStore(state => state.addSavedSearch);
  const servers = useServersStore(state => state.servers);
  const savedSearches = useSavedSearchesStore(state => state.savedSearches);
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const { setActiveServer, navigate, activeServerId } = useNavigation();

  const [savedSearch, setSavedSearch] = useState<SavedSearch | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pagination, setPagination] = useState<Pagination>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ref: loadMoreRef, entry } = useIntersection({ threshold: 1 });

  // Load saved search details (prefer store, fallback to backend)
  useEffect(() => {
    const loadSavedSearch = async () => {
      if (!activeSavedSearchId) {
        setSavedSearch(null);
        setColumns([]);
        return;
      }

      const existing = getSavedSearchById(activeSavedSearchId);
      if (existing) {
        setSavedSearch(existing);
        setColumns(parseColumns(existing.columns));
        return;
      }

      try {
        const remote = await backendRpc.savedSearches.get(activeSavedSearchId);
        setSavedSearch(remote);
        setColumns(parseColumns(remote.columns));
        addSavedSearch(remote);
      } catch (err) {
        console.error('Failed to load saved search', err);
        setSavedSearch(null);
        setColumns([]);
        setError(err instanceof Error ? err.message : t('savedSearchRunError'));
      }
    };

    loadSavedSearch();
  }, [activeSavedSearchId, savedSearches, getSavedSearchById, t]);

  const server = useMemo(
    () => (savedSearch ? servers.find(s => s.id === savedSearch.serverId) || null : null),
    [savedSearch, servers]
  );

  const executeSearch = useCallback(
    async (skipCount = 0) => {
      if (!savedSearch || !server) {
        return;
      }
      const isInitial = skipCount === 0;
      setError(null);
      setIsLoading(isInitial);
      setIsLoadingMore(!isInitial);

      try {
        const response = await backendRpc.alfresco.search.query(
          savedSearch.serverId,
          server.baseUrl,
          savedSearch.query,
          {
            maxItems: 50,
            skipCount,
          }
        );

        setPagination({
          hasMoreItems: response.pagination?.hasMoreItems,
          maxItems: response.pagination?.maxItems,
          skipCount: response.pagination?.skipCount,
          totalItems:
            response.pagination?.totalItems ??
            (response.pagination?.skipCount ?? 0) +
              (response.pagination?.count ?? response.items.length),
        });

        const itemsWithServer = response.items.map(item => ({
          ...item,
          serverId: savedSearch.serverId,
          serverName: server.name,
        }));

        setResults(prev => (isInitial ? itemsWithServer : [...prev, ...itemsWithServer]));
      } catch (err) {
        console.error('Failed to execute saved search', err);
        setError(err instanceof Error ? err.message : t('savedSearchRunError'));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [savedSearch, server, t]
  );

  // Auto-run when search changes
  useEffect(() => {
    if (savedSearch && server) {
      executeSearch(0);
    }
  }, [savedSearch, server, executeSearch]);

  // Infinite scroll trigger
  useEffect(() => {
    if (entry?.isIntersecting) {
      const nextSkip = (pagination.skipCount ?? 0) + (pagination.maxItems ?? 50);
      if (pagination.hasMoreItems && !isLoading && !isLoadingMore) {
        executeSearch(nextSkip);
      }
    }
  }, [entry, pagination, executeSearch, isLoading, isLoadingMore]);

  if (!activeSavedSearchId) {
    return (
      <Box
        style={{
          flex: 1,
          width: '100%',
          minHeight: 'calc(100vh - 160px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          paddingTop: '4rem',
        }}
      >
        <Text c="dimmed">{t('savedSearchNoSelection')}</Text>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <div style={{ opacity: 0.08 }}>
            <BrandLogo size={240} color="var(--mantine-color-gray-6)" />
          </div>
        </div>
      </Box>
    );
  }

  if (!savedSearch) {
    return (
      <Paper p="xl" withBorder>
        <Group gap="xs">
          <IconAlertCircle size={16} />
          <Text c="dimmed">{t('savedSearchMissing')}</Text>
        </Group>
        {error && (
          <Text size="sm" c="red" mt="xs">
            {error}
          </Text>
        )}
      </Paper>
    );
  }

  if (!server) {
    return (
      <Paper p="xl" withBorder>
        <Group gap="xs">
          <IconAlertCircle size={16} />
          <Text c="dimmed">{t('savedSearchNoServer')}</Text>
        </Group>
      </Paper>
    );
  }

  const columnsToRender = columns;

  const resolveValue = (key: string, item: SearchResult): { text: string; tooltip?: string } => {
    if (key === 'cm:name') {
      const text = item.name || '-';
      return { text, tooltip: text };
    }
    if (key === 'modifier' || key === 'cm:modifier') {
      const text = item.modifier || '-';
      return { text, tooltip: text };
    }
    if (key === 'cm:creator') {
      const text = item.creator || '-';
      return { text, tooltip: text };
    }
    if (key === 'cm:modified' && item.modifiedAt) {
      return {
        text: formatRelativeTime(item.modifiedAt),
        tooltip: new Date(item.modifiedAt).toLocaleString(),
      };
    }
    if (key === 'cm:created' && item.createdAt) {
      return {
        text: formatRelativeTime(item.createdAt),
        tooltip: new Date(item.createdAt).toLocaleString(),
      };
    }
    const text = formatPropertyValue(item.properties?.[key]);
    return { text, tooltip: text };
  };

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const extractUuid = (item: SearchResult): { short: string; full: string } => {
    const tryValue = (val?: unknown): string | null => {
      if (typeof val !== 'string') return null;
      const trimmed = val.trim();
      if (uuidRegex.test(trimmed)) {
        return trimmed;
      }
      return null;
    };

    // 1) Direct id
    let full = tryValue(item.id);

    // 2) nodeRef segment
    if (!full && item.nodeRef) {
      const match = item.nodeRef.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      );
      if (match) {
        full = match[1];
      }
    }

    // 3) properties that look like node-uuid
    if (!full && item.properties) {
      const entry = Object.entries(item.properties).find(
        ([key, val]) => key.toLowerCase().includes('node-uuid') && typeof val === 'string'
      );
      const candidate = entry?.[1];
      full = tryValue(candidate as string | undefined);

      // Handle array values
      if (!full && entry && Array.isArray(entry[1])) {
        const first = (entry[1] as unknown[]).find(v => typeof v === 'string') as
          | string
          | undefined;
        full = tryValue(first);
      }
    }

    const resolvedFull = full ?? (typeof item.id === 'string' ? item.id : '-');
    const short = resolvedFull.includes('-') ? resolvedFull.split('-')[0] : resolvedFull;
    return { short, full: resolvedFull };
  };

  const extractNodeId = (nodeRef: string, fallback: string) => {
    const match = nodeRef?.match(/([0-9a-f-]{36})$/i);
    return match ? match[1] : fallback;
  };

  const handleRowClick = (item: SearchResult) => {
    if (!savedSearch) return;
    const nodeId = extractNodeId(item.nodeRef, item.id);
    openNodeTab({
      nodeId,
      nodeName: item.name,
      serverId: savedSearch.serverId,
    });
    if (activeServerId) {
      setActiveServer(savedSearch.serverId);
    }
    navigate('node-browser');
  };

  return (
    <Stack gap="md" p="md" style={{ height: '100%' }}>
      <Group justify="space-between" align="center">
        <div>
          <Title order={3}>{savedSearch.name}</Title>
          <Text size="sm" c="dimmed">
            {pagination.totalItems !== undefined
              ? t('totalResults', {
                  count: pagination.totalItems ?? 0,
                })
              : t('savedSearchResults')}{' '}
            · {server.name}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={() => executeSearch(0)}
            loading={isLoading}
          >
            {t('savedSearchRefresh')}
          </Button>
        </Group>
      </Group>

      {error && (
        <Paper withBorder p="sm" c="red">
          {error}
        </Paper>
      )}

      {columnsToRender.length === 0 && (
        <Paper withBorder p="sm">
          <Text c="dimmed">{t('savedSearchColumnsEmpty')}</Text>
        </Paper>
      )}

      <Paper
        withBorder
        radius="md"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <ScrollArea style={{ flex: 1 }} offsetScrollbars={false}>
          <Table stickyHeader striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 48 }}></Table.Th>
                <Table.Th style={{ width: 80, maxWidth: 96 }}>ID</Table.Th>
                {columnsToRender.map(col => (
                  <Table.Th key={col}>{col}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && results.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={2 + columnsToRender.length}>
                    <Group gap="xs">
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        {t('loadingMore')}
                      </Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : results.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={2 + columnsToRender.length}>
                    <Text c="dimmed">{t('noResults')}</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                results.map((item, index) => (
                  <Table.Tr
                    key={`${item.serverId}-${item.id}-${index}`}
                    onClick={() => handleRowClick(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      {(() => {
                        const isFolderLike =
                          item.isFolder ||
                          (!item.isFile &&
                            ['cm:folder', 'st:site', 'cm:category'].some(t =>
                              (item.type || '').includes(t)
                            ));
                        if (isFolderLike) {
                          return (
                            <IconFolder
                              size={16}
                              style={{ color: 'var(--mantine-color-blue-6)' }}
                            />
                          );
                        }
                        const FileIcon = getFileIconByMimeType(
                          item.mimeType || 'application/octet-stream'
                        );
                        return (
                          <FileIcon size={16} style={{ color: 'var(--mantine-color-gray-7)' }} />
                        );
                      })()}
                    </Table.Td>
                    <Table.Td style={{ width: 80, maxWidth: 96 }}>
                      {(() => {
                        const { short, full } = extractUuid(item);
                        return (
                          <Tooltip label={full} position="top" withinPortal>
                            <Text
                              fw={500}
                              ff="monospace"
                              size="sm"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                              }}
                            >
                              {short}
                            </Text>
                          </Tooltip>
                        );
                      })()}
                    </Table.Td>
                    {columnsToRender.map(col => {
                      const { text, tooltip } = resolveValue(col, item);
                      return (
                        <Table.Td
                          key={`${item.id}-${col}`}
                          style={{
                            maxWidth: 220,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={tooltip ?? text}
                        >
                          {text}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
          <div ref={loadMoreRef} />
        </ScrollArea>

        {pagination.hasMoreItems && (
          <Box p="sm">
            <Button
              fullWidth
              variant="subtle"
              onClick={() =>
                executeSearch((pagination.skipCount ?? 0) + (pagination.maxItems ?? 50))
              }
              loading={isLoadingMore}
            >
              {isLoadingMore ? t('loadingMore') : t('loadMore')}
            </Button>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
