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

import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { backendRpc } from '@/core/ipc/backend';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { MODAL_KEYS } from '@/core/store/keys';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { type SearchResult } from '@/core/store/search';
import { useServersStore } from '@/core/store/servers';
import {
  useDesktopClipboardHandlers,
  type EditableTarget,
} from '@/hooks/useDesktopClipboardHandlers';
import { useModal } from '@/hooks/useModal';
import { useNavigation } from '@/hooks/useNavigation';
import { useSearchDictionary } from '@/hooks/useSearchDictionary';
import { formatRelativeTime } from '@/utils/formatTime';
import {
  Box,
  Button,
  Combobox,
  Group,
  Loader,
  Pill,
  PillsInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
  useCombobox,
} from '@mantine/core';
import { useIntersection } from '@mantine/hooks';
import { IconFolder, IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

type Pagination = {
  hasMoreItems?: boolean;
  skipCount?: number;
  maxItems?: number;
  totalItems?: number;
};

const formatPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) {
    return value.map(v => formatPropertyValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    if (
      'displayName' in (value as Record<string, unknown>) &&
      typeof (value as { displayName?: unknown }).displayName === 'string'
    ) {
      return (value as { displayName: string }).displayName;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export function SavedSearchNewPage() {
  const { t } = useTranslation(['search', 'common']);
  const { activeServerId, setActiveServer, navigate } = useNavigation();
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const { open: openSaveSearchModal } = useModal(MODAL_KEYS.SAVE_SEARCH);
  const servers = useServersStore(state => state.servers);
  const { ref: loadMoreRef, entry } = useIntersection({ threshold: 1 });

  const alfrescoServers = useMemo(
    () => servers.filter(server => server.serverType === 'alfresco'),
    [servers]
  );
  const isNodeRefSpaceContext = activeServerId === null;

  const initialServerId = useMemo(() => {
    if (!isNodeRefSpaceContext) {
      return null;
    }
    if (activeServerId && alfrescoServers.some(server => server.id === activeServerId)) {
      return activeServerId;
    }
    return alfrescoServers[0]?.id ?? null;
  }, [activeServerId, alfrescoServers, isNodeRefSpaceContext]);

  const [serverId, setServerId] = useState<number | null>(initialServerId);
  const [query, setQuery] = useState('');
  const [columns, setColumns] = useState<string[]>(['cm:name', 'cm:description', 'cm:modified']);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pagination, setPagination] = useState<Pagination>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [propertyInput, setPropertyInput] = useState('');
  const [currentProperties, setCurrentProperties] = useState<string[]>([]);
  const [isLoadingDynamicProps, setIsLoadingDynamicProps] = useState(false);
  const propertiesCacheRef = useRef<Record<string, { values: string[]; timestamp: number }>>({});
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const queryInputRef = useRef<HTMLTextAreaElement | null>(null);
  const isDesktopMode = useMemo(
    () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
    []
  );

  const handleInsertText = useCallback(
    (editableTarget: EditableTarget, text: string) => {
      const fieldName = editableTarget.getAttribute('data-field') || '';
      if (fieldName !== 'query') {
        return;
      }
      if (
        editableTarget instanceof HTMLInputElement ||
        editableTarget instanceof HTMLTextAreaElement
      ) {
        const { selectionStart, selectionEnd, value } = editableTarget;
        const start = selectionStart ?? value.length;
        const end = selectionEnd ?? value.length;
        const newValue = value.slice(0, start) + text + value.slice(end);
        const cursorPos = start + text.length;

        setQuery(newValue);
        setTimeout(() => {
          if (document.activeElement === editableTarget) {
            editableTarget.setSelectionRange(cursorPos, cursorPos);
          }
        }, 0);
      } else if (editableTarget.isContentEditable) {
        document.execCommand('insertText', false, text);
      }
    },
    [setQuery]
  );

  useDesktopClipboardHandlers({
    isEnabled: isDesktopMode,
    containerRef: queryInputRef as RefObject<HTMLElement | null>,
    onInsertText: handleInsertText,
    enableCopyCut: true,
  });

  useEffect(() => {
    if (isNodeRefSpaceContext && !serverId && initialServerId) {
      setServerId(initialServerId);
    }
  }, [serverId, initialServerId, isNodeRefSpaceContext]);

  const selectedServer = useMemo(() => {
    const resolvedServerId = isNodeRefSpaceContext ? serverId : activeServerId;
    if (!resolvedServerId) {
      return null;
    }
    return alfrescoServers.find(server => server.id === resolvedServerId) || null;
  }, [activeServerId, alfrescoServers, isNodeRefSpaceContext, serverId]);
  const baseUrl = selectedServer?.baseUrl ?? null;
  const { dictionary, loading: loadingDictionary } = useSearchDictionary(
    selectedServer?.id ?? null
  );

  const propertyPrefix = useMemo(() => {
    const match = propertyInput.match(/^([a-z0-9_-]+:)/i);
    return match ? match[1].toLowerCase() : null;
  }, [propertyInput]);

  const executeSearch = useCallback(
    async (skipCount = 0) => {
      const normalizedQuery = query.trim();
      if (!selectedServer || !normalizedQuery) {
        return;
      }

      const isInitial = skipCount === 0;
      setError(null);
      setIsLoading(isInitial);
      setIsLoadingMore(!isInitial);
      setHasSearched(true);

      try {
        const response = await backendRpc.alfresco.search.query(
          selectedServer.id,
          selectedServer.baseUrl,
          normalizedQuery,
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
          serverId: selectedServer.id,
          serverName: selectedServer.name,
          properties: item.properties ?? {},
        }));

        setResults(prev => (isInitial ? itemsWithServer : [...prev, ...itemsWithServer]));
      } catch (err) {
        console.error('Failed to execute new saved search query', err);
        setError(err instanceof Error ? err.message : t('savedSearchRunError'));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [query, selectedServer, t]
  );

  useEffect(() => {
    if (entry?.isIntersecting) {
      const nextSkip = (pagination.skipCount ?? 0) + (pagination.maxItems ?? 50);
      if (pagination.hasMoreItems && !isLoading && !isLoadingMore) {
        void executeSearch(nextSkip);
      }
    }
  }, [entry, pagination, executeSearch, isLoading, isLoadingMore]);

  useEffect(() => {
    setResults([]);
    setPagination({});
    setError(null);
    setHasSearched(false);
  }, [selectedServer?.id]);

  useEffect(() => {
    propertiesCacheRef.current = {};
    setCurrentProperties([]);
    setPropertyInput('');
    combobox.closeDropdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServer?.id]);

  useEffect(() => {
    if (!selectedServer?.id || !baseUrl || !propertyPrefix) {
      setCurrentProperties([]);
      setIsLoadingDynamicProps(false);
      return;
    }

    const cacheKey = `${selectedServer.id}:${propertyPrefix}`;
    const cached = propertiesCacheRef.current[cacheKey];
    const cacheTtl = 5 * 60 * 1000;
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      setCurrentProperties(cached.values);
      setIsLoadingDynamicProps(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDynamicProps(true);

    backendRpc.alfresco.search
      .propertiesByPrefix(selectedServer.id, baseUrl, propertyPrefix)
      .then(props => {
        if (cancelled) {
          return;
        }
        setCurrentProperties(props);
        propertiesCacheRef.current[cacheKey] = {
          values: props,
          timestamp: Date.now(),
        };
      })
      .catch(err => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load dynamic properties for saved search new page', err);
        setCurrentProperties([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDynamicProps(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baseUrl, propertyPrefix, selectedServer?.id]);

  const availableProperties = useMemo(() => {
    const term = propertyInput.toLowerCase();
    const combined = Array.from(new Set([...dictionary.properties, ...currentProperties]));
    return combined
      .filter(
        prop => !columns.includes(prop) && (term.length === 0 || prop.toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [columns, currentProperties, dictionary.properties, propertyInput]);

  const isValidPropertyFormat = (input: string) => /^[a-z0-9_-]+:[^:]+$/i.test(input.trim());

  const findMatchingProperty = (input: string): string | null => {
    const value = input.trim();
    if (!value) return null;
    const lower = value.toLowerCase();

    const allProperties = Array.from(new Set([...dictionary.properties, ...currentProperties]));
    const available = allProperties.filter(prop => !columns.includes(prop));
    const exact = available.find(prop => prop.toLowerCase() === lower);
    if (exact) return exact;
    const startsWith = available.find(prop => prop.toLowerCase().startsWith(lower));
    if (startsWith) return startsWith;
    if (isValidPropertyFormat(value)) {
      return value;
    }
    return null;
  };

  const handleAddColumn = (prop: string) => {
    const match = findMatchingProperty(prop);
    if (!match) {
      return;
    }
    setColumns(prev => [...prev, match]);
    setPropertyInput('');
  };

  const handleRemoveColumn = (prop: string) => {
    setColumns(prev => prev.filter(item => item !== prop));
  };

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

    let full = tryValue(item.id);
    if (!full && item.nodeRef) {
      const match = item.nodeRef.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      );
      if (match) {
        full = match[1];
      }
    }

    if (!full && item.properties) {
      const entry = Object.entries(item.properties).find(
        ([key, val]) => key.toLowerCase().includes('node-uuid') && typeof val === 'string'
      );
      const candidate = entry?.[1];
      full = tryValue(candidate as string | undefined);

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
    if (!selectedServer) {
      return;
    }
    const nodeId = extractNodeId(item.nodeRef, item.id);
    openNodeTab({
      nodeId,
      nodeName: item.name,
      serverId: selectedServer.id,
    });
    setActiveServer(selectedServer.id);
    navigate('node-browser');
  };

  if (alfrescoServers.length === 0) {
    return (
      <Paper p="xl" withBorder>
        <Text c="dimmed">{t('noAlfrescoServerForSavedSearch')}</Text>
      </Paper>
    );
  }

  const canRun = Boolean(selectedServer && query.trim());

  return (
    <Stack gap="lg" p="lg" style={{ height: '100%' }}>
      <Stack gap="sm">
        <div>
          <Title order={4}>{t('newSavedSearch')}</Title>
          <Text size="sm" c="dimmed">
            {t('newSavedSearchDescription')}
          </Text>
        </div>

        {isNodeRefSpaceContext && (
          <Select
            label={t('server')}
            data={alfrescoServers.map(server => ({
              value: String(server.id),
              label: server.name,
            }))}
            value={serverId ? String(serverId) : null}
            onChange={value => setServerId(value ? parseInt(value, 10) : null)}
            searchable
            clearable={false}
          />
        )}

        <Textarea
          label={t('searchQuery')}
          placeholder={t('searchQueryPlaceholder')}
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          minRows={4}
          autosize
          ref={queryInputRef}
          data-field="query"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('columns')}
          </Text>
          {columns.length === 0 && (
            <Text size="xs" c="dimmed" mb="xs">
              {t('columnsHelper')}
            </Text>
          )}
          <Combobox
            store={combobox}
            withinPortal={false}
            onOptionSubmit={value => {
              handleAddColumn(value);
              combobox.closeDropdown();
            }}
          >
            <Combobox.DropdownTarget>
              <PillsInput
                onClick={() => {
                  if (!selectedServer) {
                    return;
                  }
                  combobox.openDropdown();
                }}
              >
                <Pill.Group>
                  {columns.map(column => (
                    <Pill
                      key={column}
                      withRemoveButton
                      onRemove={() => handleRemoveColumn(column)}
                      styles={{ root: { borderRadius: '4px' } }}
                    >
                      {column}
                    </Pill>
                  ))}
                  <Combobox.EventsTarget>
                    <PillsInput.Field
                      value={propertyInput}
                      placeholder={
                        loadingDictionary || isLoadingDynamicProps
                          ? t('loadingPropertiesShort')
                          : t('columnsPlaceholder')
                      }
                      onChange={event => {
                        const value = event.currentTarget.value;
                        setPropertyInput(value);
                        if (value.trim().length > 0) {
                          combobox.openDropdown();
                        } else {
                          combobox.closeDropdown();
                        }
                      }}
                      onFocus={() => {
                        if (propertyInput.trim().length > 0) {
                          combobox.openDropdown();
                        }
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (propertyInput.trim()) {
                            const match = findMatchingProperty(propertyInput);
                            if (match) {
                              handleAddColumn(match);
                              combobox.closeDropdown();
                            }
                          }
                        } else if (
                          event.key === 'Backspace' &&
                          !propertyInput &&
                          columns.length > 0
                        ) {
                          event.preventDefault();
                          const last = columns[columns.length - 1];
                          handleRemoveColumn(last);
                        }
                      }}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </Combobox.EventsTarget>
                </Pill.Group>
              </PillsInput>
            </Combobox.DropdownTarget>

            <Combobox.Dropdown>
              <Combobox.Options mah={220} style={{ overflowY: 'auto' }}>
                {(loadingDictionary || isLoadingDynamicProps) && (
                  <Combobox.Empty>{t('loadingPropertiesShort')}</Combobox.Empty>
                )}
                {!loadingDictionary &&
                  !isLoadingDynamicProps &&
                  availableProperties.length === 0 && (
                    <Combobox.Empty>
                      {selectedServer ? t('noProperties') : t('selectServerToLoadProps')}
                    </Combobox.Empty>
                  )}
                {availableProperties.map(prop => (
                  <Combobox.Option value={prop} key={prop}>
                    {prop}
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </div>

        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() =>
              openSaveSearchModal({
                query: query.trim(),
                serverId: selectedServer?.id ?? null,
                columns,
              })
            }
            disabled={!canRun}
          >
            {t('common:save')}
          </Button>
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={() => void executeSearch(0)}
            loading={isLoading}
            disabled={!canRun}
          >
            {t('common:search')}
          </Button>
        </Group>
      </Stack>

      {error && (
        <Paper withBorder p="sm" c="red">
          {error}
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
        {!hasSearched ? (
          <Box
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 'var(--mantine-spacing-sm)',
              padding: 'var(--mantine-spacing-xl)',
            }}
          >
            <IconSearch size={40} style={{ opacity: 0.35 }} />
            <Text c="dimmed">{t('runSearchToSeeResults')}</Text>
          </Box>
        ) : (
          <>
            <Box p="md" pb={0}>
              <Text fw={500}>
                {pagination.totalItems !== undefined
                  ? t('totalResults', { count: pagination.totalItems ?? 0 })
                  : t('savedSearchResults')}
              </Text>
            </Box>
            <ScrollArea style={{ flex: 1 }} offsetScrollbars={false}>
              <Table stickyHeader striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 48 }}></Table.Th>
                    <Table.Th style={{ width: 80, maxWidth: 96 }}>ID</Table.Th>
                    {columns.map(column => (
                      <Table.Th key={column}>{column}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {isLoading && results.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={2 + columns.length}>
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
                      <Table.Td colSpan={2 + columns.length}>
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
                                ['cm:folder', 'st:site', 'cm:category'].some(type =>
                                  (item.type || '').includes(type)
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
                              <FileIcon
                                size={16}
                                style={{ color: 'var(--mantine-color-gray-7)' }}
                              />
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
                        {columns.map(column => {
                          const { text, tooltip } = resolveValue(column, item);
                          return (
                            <Table.Td
                              key={`${item.id}-${column}`}
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
                    void executeSearch((pagination.skipCount ?? 0) + (pagination.maxItems ?? 50))
                  }
                  loading={isLoadingMore}
                >
                  {isLoadingMore ? t('loadingMore') : t('loadMore')}
                </Button>
              </Box>
            )}
          </>
        )}
      </Paper>
    </Stack>
  );
}
