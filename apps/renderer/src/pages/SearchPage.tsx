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

import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { useSearchStore, type SearchResult } from '@/core/store/search';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useNavigationStore } from '@/core/store/navigation';
import { formatRelativeTime } from '@/utils/formatTime';
import {
  Badge,
  Box,
  Group,
  Loader,
  LoadingOverlay,
  Paper,
  Stack,
  Text,
  Title,
  Timeline,
} from '@mantine/core';
import { useIntersection } from '@mantine/hooks';
import { IconDots, IconFolder, IconSearch, IconWorld } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LoadMoreTimelineItemProps {
  isLoading: boolean;
  onLoadMore: () => void;
  idleLabel: string;
  loadingLabel: string;
}

const LoadMoreTimelineItem = ({
  isLoading,
  onLoadMore,
  idleLabel,
  loadingLabel,
}: LoadMoreTimelineItemProps) => {
  const { ref, entry } = useIntersection({ threshold: 0.25 });
  const [canAutoLoad, setCanAutoLoad] = useState(true);

  useEffect(() => {
    if (!entry) {
      return;
    }
    if (!entry.isIntersecting) {
      setCanAutoLoad(true);
      return;
    }

    if (!isLoading && canAutoLoad) {
      setCanAutoLoad(false);
      onLoadMore();
    }
  }, [entry, isLoading, canAutoLoad, onLoadMore]);

  const handleManualLoad = () => {
    if (!isLoading) {
      setCanAutoLoad(false);
      onLoadMore();
    }
  };

  return (
    <div ref={ref}>
      <Timeline.Item
        bullet={isLoading ? <Loader size={16} /> : <IconDots size={16} stroke={1.5} />}
        title={
          <Text
            size="sm"
            c="dimmed"
            onClick={handleManualLoad}
            style={{ cursor: isLoading ? 'default' : 'pointer' }}
          >
            {isLoading ? loadingLabel : idleLabel}
          </Text>
        }
      />
    </div>
  );
};

const renderResultIcon = (item: SearchResult) => {
  if (item.type === 'st:site') {
    return <IconWorld size={16} style={{ color: 'var(--mantine-color-blue-6)' }} />;
  }
  if (item.type === 'cm:folder') {
    return <IconFolder size={16} style={{ color: 'var(--mantine-color-blue-6)' }} />;
  }
  const FileIcon = getFileIconByMimeType(item.mimeType);
  return <FileIcon size={16} style={{ color: 'var(--mantine-color-gray-6)' }} />;
};

export function SearchPage() {
  const { t } = useTranslation('search');
  const { results, isLoading, isLoadingMore, query, error, pagination, loadMore } =
    useSearchStore();
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);
  const navigate = useNavigationStore(state => state.navigate);
  const setActiveServer = useNavigationStore(state => state.setActiveServer);
  const activeServerId = useNavigationStore(state => state.activeServerId);
  const isNodeRefSpaceContext = activeServerId === null;

  // Extract node ID from nodeRef (workspace://SpacesStore/{nodeId})
  const extractNodeId = (nodeRef: string): string => {
    const match = nodeRef.match(/SpacesStore\/(.+)$/);
    return match ? match[1] : nodeRef;
  };

  const handleNameClick = (item: SearchResult) => {
    if (!item.serverId) return;
    const nodeId = extractNodeId(item.nodeRef);
    openNodeTab({
      nodeId,
      nodeName: item.name,
      serverId: item.serverId,
    });
    setActiveServer(item.serverId);
    navigate('node-browser');
  };

  const handlePathClick = (item: SearchResult) => {
    if (!item.serverId) return;

    // Navigate to the parent folder in file/folder browser
    // If parentId is not available, fall back to the item itself if it's a folder
    const targetNodeId =
      item.parentId ||
      (item.type === 'cm:folder' || item.type === 'st:site' ? extractNodeId(item.nodeRef) : null);

    if (targetNodeId) {
      openFolderTab({
        nodeId: targetNodeId,
        nodeName: item.name,
        serverId: item.serverId,
      });
      setActiveServer(item.serverId);
      navigate('file-folder-browser');
    }
  };

  const handleLoadMore = () => {
    loadMore();
  };

  if (!query && results.length === 0) {
    return (
      <Box
        p="xl"
        style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Stack align="center" gap="md">
          <IconSearch size={48} style={{ opacity: 0.3 }} />
          <Text c="dimmed" size="lg">
            {t('startSearching')}
          </Text>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      p="md"
      style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}
    >
      <LoadingOverlay visible={isLoading} overlayProps={{ blur: 2 }} />

      <Group justify="space-between" align="center" mb="md">
        <Title order={3}>
          {pagination.totalItems !== undefined
            ? t('totalResults', {
                count: pagination.totalItems ?? 0,
              })
            : t('searchResults')}
        </Title>
      </Group>

      {error && (
        <Paper p="md" withBorder c="red" mb="md">
          <Text>{error}</Text>
        </Paper>
      )}

      {results.length > 0 ? (
        <Paper
          withBorder
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Box style={{ padding: 'var(--mantine-spacing-md)' }}>
            <Timeline bulletSize={28} lineWidth={2}>
              {results.map((item, index) => {
                const batchSize = pagination.maxItems ?? 50;
                const chunkIndex = Math.floor(index / batchSize);
                const activeChunk = Math.floor((results.length - 1) / batchSize);
                const color = chunkIndex < activeChunk ? 'blue' : 'gray';
                const createdAtDate = item.createdAt ? new Date(item.createdAt) : null;
                const createdAtLabel = createdAtDate
                  ? createdAtDate.toLocaleString().replace(/,/g, '')
                  : t('unknown');
                return (
                  <Timeline.Item
                    key={item.id}
                    color={color}
                    bullet={renderResultIcon(item)}
                    title={
                      <Group justify="space-between" wrap="nowrap">
                        <Text
                          size="sm"
                          fw={500}
                          onClick={() => handleNameClick(item)}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = 'var(--mantine-color-blue-6)';
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = 'inherit';
                            e.currentTarget.style.textDecoration = 'none';
                          }}
                        >
                          {item.name}
                        </Text>
                        <Stack gap={2} align="flex-end">
                          <Text size="xs" c="dimmed">
                            {formatRelativeTime(item.modifiedAt)}
                          </Text>
                          {isNodeRefSpaceContext && item.serverName && (
                            <Badge size="sm" radius="sm" variant="light" color="gray">
                              {item.serverName}
                            </Badge>
                          )}
                        </Stack>
                      </Group>
                    }
                  >
                    <Group gap="xs" wrap="nowrap">
                      <IconFolder
                        size={14}
                        style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }}
                      />
                      <Text
                        size="xs"
                        c="dimmed"
                        truncate
                        onClick={() => handlePathClick(item)}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = 'var(--mantine-color-blue-6)';
                          e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = 'var(--mantine-color-dimmed)';
                          e.currentTarget.style.textDecoration = 'none';
                        }}
                      >
                        {item.path}
                      </Text>
                    </Group>
                    <Group gap="lg" mt="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <Text
                        size="xs"
                        c="dimmed"
                        title={`${t('type')}: ${item.type}`}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                        }}
                      >
                        {t('type')}: {item.type}
                      </Text>
                      <Text
                        size="xs"
                        c="dimmed"
                        title={`${t('modifier')}: ${item.modifier}`}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                        }}
                      >
                        {t('modifier')}: {item.modifier}
                      </Text>
                      <Text
                        size="xs"
                        c="dimmed"
                        title={`${t('creator')}: ${item.creator}`}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                        }}
                      >
                        {t('creator')}: {item.creator}
                      </Text>
                      <Text
                        size="xs"
                        c="dimmed"
                        title={`${t('created')}: ${createdAtLabel}`}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                        }}
                      >
                        {t('created')}: {createdAtLabel}
                      </Text>
                    </Group>
                  </Timeline.Item>
                );
              })}
              {pagination.hasMoreItems && (
                <LoadMoreTimelineItem
                  isLoading={isLoadingMore}
                  onLoadMore={handleLoadMore}
                  idleLabel={t('loadMore')}
                  loadingLabel={t('loadingMore')}
                />
              )}
            </Timeline>
          </Box>
        </Paper>
      ) : (
        !isLoading && (
          <Paper p="xl" withBorder style={{ textAlign: 'center' }}>
            <Text c="dimmed">{t('noResults')}</Text>
          </Paper>
        )
      )}
    </Box>
  );
}
