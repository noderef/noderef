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

import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useNavigationStore } from '@/core/store/navigation';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { writeClipboardText } from '@/core/utils/clipboard';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy, IconFileSearch, IconFolder, IconPencil } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSubtypeNames } from './dictionaryClasses';

interface NodeInfoProps {
  nodeData: AlfrescoNodeDetails;
  serverId: number;
  pendingNodeType?: string | null;
  availableTypes?: string[];
  dictionaryClasses?: unknown[];
  typesLoading?: boolean;
  onRequestTypes?: () => void;
  onChangeType?: (nodeType: string | null) => void;
}

export function NodeInfo({
  nodeData,
  serverId,
  pendingNodeType = null,
  availableTypes = [],
  dictionaryClasses = [],
  typesLoading = false,
  onRequestTypes,
  onChangeType,
}: NodeInfoProps) {
  const { t } = useTranslation(['nodeBrowser', 'submenu', 'common']);
  const { openTab } = useNodeBrowserTabsStore();
  const { openTab: openFolderTab } = useFileFolderBrowserTabsStore();
  const { navigate } = useNavigationStore();
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedNodeRef, setSelectedNodeRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [typeModalOpened, setTypeModalOpened] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);
  const currentType = nodeData.type.prefixedName;
  const displayedType = pendingNodeType || currentType;
  const canChangeType = Boolean(onChangeType);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

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

  const handleCopyNodeRef = async (nodeRef: string) => {
    const success = await writeClipboardText(nodeRef);
    if (!success) {
      return;
    }
    setCopied(true);
    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimeoutRef.current = null;
    }, 2000);
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

  const subtypeNames = useMemo(
    () => getSubtypeNames(dictionaryClasses, currentType),
    [currentType, dictionaryClasses]
  );

  const typeOptions = useMemo(() => {
    const all = availableTypes
      .filter(name => name !== currentType)
      .map(name => ({ value: name, label: name }));
    if (subtypeNames.length === 0) {
      return all;
    }
    const subtypeSet = new Set(subtypeNames);
    const subtypes = all.filter(option => subtypeSet.has(option.value));
    const others = all.filter(option => !subtypeSet.has(option.value));
    if (subtypes.length === 0) {
      return all;
    }
    return [
      { group: t('nodeBrowser:subtypes'), items: subtypes },
      ...(others.length > 0 ? [{ group: t('nodeBrowser:allTypes'), items: others }] : []),
    ];
  }, [availableTypes, currentType, subtypeNames, t]);

  const infoRows = [
    {
      label: t('nodeBrowser:reference'),
      value: nodeData.nodeRef,
      isNodeRef: false,
      isParent: false,
      canCopy: true,
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
                    <Group gap="xs" wrap="nowrap">
                      <Badge
                        variant={pendingNodeType ? 'outline' : 'light'}
                        color={pendingNodeType ? 'orange' : 'blue'}
                        size="sm"
                        radius="sm"
                        style={{ textTransform: 'none' }}
                      >
                        {displayedType}
                      </Badge>
                      {pendingNodeType && (
                        <Text size="xs" c="dimmed">
                          {t('nodeBrowser:pendingType')}
                        </Text>
                      )}
                      {canChangeType && (
                        <Tooltip label={t('nodeBrowser:changeType')}>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => {
                              setSelectedType(pendingNodeType || currentType);
                              setTypeModalOpened(true);
                              onRequestTypes?.();
                            }}
                            aria-label={t('nodeBrowser:changeType')}
                          >
                            <IconPencil size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  ) : (
                    <Text size="sm" style={{ wordBreak: 'break-all' }}>
                      {row.value}
                      {row.canCopy && (
                        <Tooltip
                          label={copied ? t('nodeBrowser:copied') : t('nodeBrowser:copyReference')}
                          withArrow
                        >
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color={copied ? 'teal' : 'gray'}
                            onClick={() => handleCopyNodeRef(row.value)}
                            aria-label={t('nodeBrowser:copyReference')}
                            display="inline-flex"
                            style={{
                              verticalAlign: 'middle',
                              marginLeft: 6,
                            }}
                          >
                            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
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

      <Modal
        opened={typeModalOpened}
        onClose={() => setTypeModalOpened(false)}
        title={t('nodeBrowser:changeTypeTitle')}
      >
        <Stack gap="md">
          <Text size="sm">{t('nodeBrowser:changeTypeWarning')}</Text>
          <Select
            searchable
            data={typeOptions}
            value={selectedType}
            onChange={setSelectedType}
            placeholder={t('nodeBrowser:changeTypePlaceholder')}
            nothingFoundMessage={t('common:nothingFound')}
            disabled={typesLoading && typeOptions.length === 0}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setTypeModalOpened(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              onClick={() => {
                onChangeType?.(selectedType && selectedType !== currentType ? selectedType : null);
                setTypeModalOpened(false);
              }}
            >
              {t('nodeBrowser:changeTypeConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
