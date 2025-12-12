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

import { Modal, Stack, Text, Code, Group, Avatar, Badge } from '@mantine/core';
import { useModal } from '@/hooks/useModal';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useTranslation } from 'react-i18next';

export function ServerInfoModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.SERVER_INFO);
  const { t } = useTranslation('server');
  const getServerById = useServersStore(state => state.getServerById);

  // Payload should be serverId (number)
  const serverId = typeof payload === 'number' ? payload : null;
  const server = getServerById(serverId);

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title={t('serverInfo')}
      size="md"
      centered
      trapFocus
      returnFocus
      closeOnClickOutside
      closeOnEscape
      transitionProps={{ duration: 300, transition: 'fade' }}
    >
      {server ? (
        <Stack gap="md">
          {(server.thumbnail || server.color) && (
            <Group>
              <Text fw={500} size="sm" style={{ minWidth: '100px' }}>
                Thumbnail:
              </Text>
              {server.thumbnail ? (
                <Avatar
                  src={`data:image/png;base64,${server.thumbnail}`}
                  alt={server.name}
                  size={48}
                  radius="sm"
                />
              ) : server.color ? (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 'var(--mantine-radius-sm)',
                    backgroundColor: server.color,
                  }}
                />
              ) : null}
            </Group>
          )}
          <Group>
            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
              Name:
            </Text>
            <Text size="sm">{server.name}</Text>
          </Group>
          <Group>
            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
              Base URL:
            </Text>
            <Code style={{ wordBreak: 'break-all' }}>{server.baseUrl}</Code>
          </Group>
          <Group>
            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
              ID:
            </Text>
            <Code>{server.id}</Code>
          </Group>
          <Group>
            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
              Server Type:
            </Text>
            <Badge>{server.serverType}</Badge>
          </Group>
          <Group>
            <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
              Admin:
            </Text>
            <Badge color={server.isAdmin ? 'green' : 'gray'}>{server.isAdmin ? 'Yes' : 'No'}</Badge>
          </Group>
          {server.jsconsoleEndpoint && (
            <Group>
              <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
                JS Console:
              </Text>
              <Code>{server.jsconsoleEndpoint}</Code>
            </Group>
          )}
          {server.color && (
            <Group>
              <Text fw={500} size="sm" style={{ minWidth: '120px' }}>
                Color:
              </Text>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--mantine-radius-sm)',
                  backgroundColor: server.color,
                  border: '1px solid var(--mantine-color-gray-3)',
                }}
              />
              <Code>{server.color}</Code>
            </Group>
          )}
        </Stack>
      ) : (
        <Text c="dimmed" size="sm">
          Server information not available
        </Text>
      )}
    </Modal>
  );
}
