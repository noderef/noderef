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

import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useNavigationStore } from '@/core/store/navigation';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { Anchor, Badge, Group, Menu, Paper, Stack, Table, Text } from '@mantine/core';
import { IconFileSearch, IconFolder } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NodeInfoProps {
  nodeData: AlfrescoNodeDetails;
  serverId: number;
}

export function NodeInfo({ nodeData, serverId }: NodeInfoProps) {
  const { t } = useTranslation(['nodeBrowser', 'submenu']);
  const { openTab } = useNodeBrowserTabsStore();
  const { openTab: openFolderTab } = useFileFolderBrowserTabsStore();
  const { navigate } = useNavigationStore();
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedNodeRef, setSelectedNodeRef] = useState<string | null>(null);

  // Extract node ID from nodeRef (workspace://SpacesStore/{nodeId})
  const extractNodeId = (nodeRef: string): string => {
    const match = nodeRef.match(/SpacesStore\/(.+)$/);
    return match ? match[1] : nodeRef;
  };

  const handleNodeRefClick = (nodeRef: string) => {
    const nodeId = extractNodeId(nodeRef);
    openTab({
      nodeId,
      nodeName: nodeId,
      serverId,
    }); // Open in same tab (preview mode)
    navigate('node-browser');
  };

  const handleParentNodeClick = (nodeRef: string) => {
    const nodeId = extractNodeId(nodeRef);
    const primaryPath = nodeData.qnamePath.prefixedName;
    const isSystemNode = primaryPath.startsWith('/sys:system');

    if (isSystemNode) {
      // For system nodes, open in Node Browser
      openTab({
        nodeId,
        nodeName: nodeId,
        serverId,
      });
      navigate('node-browser');
    } else {
      // For regular nodes, open in File/Folder Browser
      openFolderTab({
        nodeId,
        nodeName: nodeId,
        serverId,
      });
      navigate('file-folder-browser');
    }
  };

  const handleNodeRefContextMenu = (e: React.MouseEvent, nodeRef: string) => {
    e.preventDefault();
    setSelectedNodeRef(nodeRef);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpened(true);
  };

  const handleOpenInNewTab = () => {
    if (selectedNodeRef) {
      const nodeId = extractNodeId(selectedNodeRef);
      openTab(
        {
          nodeId,
          nodeName: nodeId,
          serverId,
        },
        { pinned: true }
      ); // Open in new pinned tab
      navigate('node-browser');
    }
    setContextMenuOpened(false);
  };

  const primaryPath = nodeData.qnamePath.prefixedName;
  const isSystemNode = primaryPath.startsWith('/sys:system');

  const infoRows = [
    {
      label: t('nodeBrowser:reference'),
      value: nodeData.nodeRef,
      isNodeRef: false,
      isParent: false,
    },
    {
      label: t('nodeBrowser:primaryPath'),
      value: nodeData.qnamePath.prefixedName,
      isNodeRef: false,
      isParent: false,
    },
    {
      label: t('nodeBrowser:type'),
      value: nodeData.type.prefixedName,
      isNodeRef: false,
      isParent: false,
    },
    {
      label: t('nodeBrowser:parentNode'),
      value: nodeData.parentNodeRef,
      isNodeRef: true,
      isParent: true,
    },
  ];

  return (
    <Stack gap="md" p="md">
      <Paper withBorder p="md">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '30%' }}>{t('nodeBrowser:property')}</Table.Th>
              <Table.Th>{t('nodeBrowser:value')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {infoRows.map((row, idx) => (
              <Table.Tr key={idx}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {row.label}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {row.isNodeRef ? (
                    row.isParent ? (
                      <Anchor
                        size="sm"
                        style={{ wordBreak: 'break-all', cursor: 'pointer' }}
                        onClick={() => handleParentNodeClick(row.value)}
                        onContextMenu={e => handleNodeRefContextMenu(e, row.value)}
                      >
                        <Group gap="xs" wrap="nowrap" style={{ display: 'inline-flex' }}>
                          {!isSystemNode && <IconFolder size={16} style={{ flexShrink: 0 }} />}
                          <Text component="span" size="sm" style={{ wordBreak: 'break-all' }}>
                            {row.value}
                          </Text>
                        </Group>
                      </Anchor>
                    ) : (
                      <Anchor
                        size="sm"
                        style={{ wordBreak: 'break-all', cursor: 'pointer' }}
                        onClick={() => handleNodeRefClick(row.value)}
                        onContextMenu={e => handleNodeRefContextMenu(e, row.value)}
                      >
                        {row.value}
                      </Anchor>
                    )
                  ) : row.label === t('nodeBrowser:type') ? (
                    <Badge
                      variant="light"
                      color="blue"
                      size="sm"
                      radius="sm"
                      style={{ textTransform: 'none' }}
                    >
                      {row.value}
                    </Badge>
                  ) : (
                    <Text size="sm" style={{ wordBreak: 'break-all' }}>
                      {row.value}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
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
