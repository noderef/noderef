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

import { Table, Text, Paper, Stack, Anchor, Menu } from '@mantine/core';
import { IconFileSearch } from '@tabler/icons-react';
import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { useTranslation } from 'react-i18next';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useNavigationStore } from '@/core/store/navigation';
import { useState } from 'react';

interface NodeParentsProps {
  parents: AlfrescoNodeDetails['parents'];
  serverId: number;
}

export function NodeParents({ parents, serverId }: NodeParentsProps) {
  const { t } = useTranslation(['nodeBrowser', 'submenu']);
  const { openTab } = useNodeBrowserTabsStore();
  const { navigate } = useNavigationStore();
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedNodeRef, setSelectedNodeRef] = useState<{
    nodeRef: string;
    nodeName: string;
  } | null>(null);

  // Extract node ID from nodeRef (workspace://SpacesStore/{nodeId})
  const extractNodeId = (nodeRef: string): string => {
    const match = nodeRef.match(/SpacesStore\/(.+)$/);
    return match ? match[1] : nodeRef;
  };

  const handleNodeRefClick = (nodeRef: string, nodeName: string) => {
    const nodeId = extractNodeId(nodeRef);
    openTab({
      nodeId,
      nodeName,
      serverId,
    }); // Open in same tab (preview mode)
    navigate('node-browser');
  };

  const handleNodeRefContextMenu = (e: React.MouseEvent, nodeRef: string, nodeName: string) => {
    e.preventDefault();
    setSelectedNodeRef({ nodeRef, nodeName });
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpened(true);
  };

  const handleOpenInNewTab = () => {
    if (selectedNodeRef) {
      const nodeId = extractNodeId(selectedNodeRef.nodeRef);
      openTab(
        {
          nodeId,
          nodeName: selectedNodeRef.nodeName,
          serverId,
        },
        { pinned: true }
      ); // Open in new pinned tab
      navigate('node-browser');
    }
    setContextMenuOpened(false);
  };

  return (
    <Stack gap="md" p="md">
      <Paper withBorder p="md">
        {parents.length === 0 ? (
          <Text c="dimmed">{t('nodeBrowser:noParents')}</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('nodeBrowser:parentName')}</Table.Th>
                <Table.Th>{t('nodeBrowser:parentType')}</Table.Th>
                <Table.Th>{t('nodeBrowser:reference')}</Table.Th>
                <Table.Th>{t('nodeBrowser:associationType')}</Table.Th>
                <Table.Th>{t('nodeBrowser:primary')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {parents.map((parent, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td>
                    <Text size="sm">{parent.name.prefixedName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {parent.type.prefixedName}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      size="sm"
                      style={{ wordBreak: 'break-all', cursor: 'pointer' }}
                      onClick={() => handleNodeRefClick(parent.nodeRef, parent.name.prefixedName)}
                      onContextMenu={e =>
                        handleNodeRefContextMenu(e, parent.nodeRef, parent.name.prefixedName)
                      }
                    >
                      {parent.nodeRef}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {parent.assocType.prefixedName}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{parent.primary ? 'true' : 'false'}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Context Menu */}
      <Menu
        opened={contextMenuOpened}
        onChange={setContextMenuOpened}
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
          <Menu.Item leftSection={<IconFileSearch size={14} />} onClick={handleOpenInNewTab}>
            {t('submenu:openInNewTab')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Stack>
  );
}
