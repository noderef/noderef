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

import { ActionIcon, Checkbox, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { IconServer2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSearchStore } from '@/core/store/search';
import { useServersStore } from '@/core/store/servers';

export function MultiServerSelectorControl() {
  const servers = useServersStore(state => state.servers);
  const selectedServerIds = useSearchStore(state => state.selectedServerIds);
  const setSelectedServerIds = useSearchStore(state => state.setSelectedServerIds);
  const { t } = useTranslation(['search', 'common']);

  const toggleSelection = (id: number) => {
    if (selectedServerIds.includes(id)) {
      if (selectedServerIds.length === 1) {
        return;
      }
      setSelectedServerIds(selectedServerIds.filter(serverId => serverId !== id));
    } else {
      setSelectedServerIds([...selectedServerIds, id]);
    }
  };

  return (
    <Menu width={240} position="bottom-start" closeOnItemClick={false} withinPortal={false}>
      <Menu.Target>
        <Tooltip
          label={t('selectedServers', {
            count: selectedServerIds.length,
          })}
          position="left"
          withArrow
          middlewares={{ flip: false }}
        >
          <ActionIcon variant="subtle" size="lg" style={{ color: 'var(--mantine-color-text)' }}>
            <IconServer2 size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap="xs" p="xs">
          {servers.length === 0 ? (
            <Text size="xs" c="dimmed">
              {t('common:noServers')}
            </Text>
          ) : (
            servers.map(server => (
              <Checkbox
                key={server.id}
                label={server.name}
                checked={selectedServerIds.includes(server.id)}
                onChange={() => toggleSelection(server.id)}
              />
            ))
          )}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}
