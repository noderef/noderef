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

import { backendRpc } from '@/core/ipc/backend';
import { useSavedSearchesStore } from '@/core/store/savedSearches';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import type { PublicServer } from '@app/contracts';
import { ScrollArea, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, useState } from 'react';
import { AddServerButton } from './AddServerButton';
import { ServerIconButton } from './ServerIconButton';
import classes from './ServerIconColumn.module.css';

interface ServerIconColumnProps {
  servers: PublicServer[];
  selectedServerId: number | null;
  onSelectServer: (id: number | null) => void;
}

export function ServerIconColumn({
  servers,
  selectedServerId,
  onSelectServer,
}: ServerIconColumnProps) {
  const { navigate } = useNavigation();
  const reorderServers = useServersStore(state => state.reorderServers);
  const savedSearches = useSavedSearchesStore(state => state.savedSearches);
  const setActiveSavedSearchId = useSavedSearchesStore(state => state.setActiveSavedSearchId);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const originalOrderRef = useRef<PublicServer[]>([]);

  const handleSelectServer = async (serverId: number) => {
    const isAlreadySelected = selectedServerId === serverId;
    onSelectServer(serverId);

    const server = servers.find(s => s.id === serverId);

    // If the server is already selected, navigate to the appropriate default page
    // instead of 'repo'/'dashboard' which would show NotFoundPage
    if (isAlreadySelected && server?.serverType === 'alfresco') {
      // Check if there are saved searches for this server
      const serverSearches = savedSearches.filter(s => s.serverId === serverId);
      if (serverSearches.length > 0) {
        // Navigate to saved-search page
        const defaultSearch = serverSearches.find(s => s.isDefault);
        if (defaultSearch) {
          setActiveSavedSearchId(defaultSearch.id);
        } else {
          setActiveSavedSearchId(serverSearches[0].id);
        }
        navigate('saved-search');
      } else {
        // No saved searches, navigate to jsconsole
        navigate('jsconsole');
      }
    } else {
      // Navigate to the first page for this server type (only when switching servers)
      if (server?.serverType === 'alfresco') {
        navigate('repo');
      } else {
        navigate('dashboard');
      }
    }

    // Update last accessed (fire-and-forget)
    backendRpc.servers.updateLastAccessed(serverId).catch(err => {
      console.error('Failed to update last accessed:', err);
      notifications.show({
        title: 'Warning',
        message: 'Failed to update last accessed time',
        color: 'yellow',
      });
    });
  };

  const handleDragStart = (event: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    originalOrderRef.current = [...servers];
    // Provide payload so Chromium/Neutralino shows a drag preview and "move" cursor
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(servers[index]?.id ?? index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    // Calculate new order
    const newServers = [...servers];
    const [draggedServer] = newServers.splice(draggedIndex, 1);
    newServers.splice(dropIndex, 0, draggedServer);

    // Update displayOrder values
    const orders = newServers.map((server, idx) => ({
      id: server.id,
      displayOrder: idx,
    }));

    // Optimistically update UI
    reorderServers(orders);

    // Send to backend
    try {
      await backendRpc.servers.reorder(orders);
      notifications.show({
        title: 'Success',
        message: 'Server order updated',
        color: 'green',
      });
    } catch (error) {
      // Rollback on error
      reorderServers(
        originalOrderRef.current.map((server, idx) => ({
          id: server.id,
          displayOrder: idx,
        }))
      );
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to reorder servers',
        color: 'red',
      });
    }
    setDraggedIndex(null);
  };

  const getServerInitials = (server: PublicServer): string => {
    return (
      server.name
        .split(' ')
        .map(word => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || server.name.slice(0, 2).toUpperCase()
    );
  };

  const getServerColor = (server: PublicServer): string | undefined => {
    if (server.color) {
      return server.color;
    }
    return undefined;
  };

  return (
    <ScrollArea
      type="never"
      h="100%"
      w="100%"
      scrollbarSize={4}
      classNames={{ root: classes.scrollArea, viewport: classes.viewport }}
      style={{ flex: 1, minHeight: 0 }}
      styles={{
        scrollbar: { display: 'none' },
        thumb: { display: 'none' },
      }}
    >
      <Stack gap="sm" align="center" style={{ paddingBottom: 'var(--mantine-spacing-sm)' }}>
        {servers.map((server, index) => (
          <div
            key={server.id}
            draggable
            onDragStart={e => handleDragStart(e, index)}
            onDragOver={e => handleDragOver(e, index)}
            onDragEnter={e => handleDragOver(e, index)}
            onDragLeave={() => handleDragLeave(index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={() => {
              setDraggedIndex(null);
              setDragOverIndex(null);
            }}
            className={[
              classes.iconWrapper,
              draggedIndex === index ? classes.dragging : '',
              dragOverIndex === index && draggedIndex !== null && draggedIndex !== index
                ? classes.dragOver
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <ServerIconButton
              label={server.name}
              initials={getServerInitials(server)}
              active={selectedServerId === server.id}
              onSelect={() => handleSelectServer(server.id)}
              color={getServerColor(server)}
              thumbnail={server.thumbnail}
              serverLabel={server.label}
            />
          </div>
        ))}
        <AddServerButton />
      </Stack>
    </ScrollArea>
  );
}
