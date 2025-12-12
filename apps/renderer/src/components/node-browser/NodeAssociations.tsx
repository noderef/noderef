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

import { type AlfrescoNodeAssociation } from '@/core/ipc/backend';
import { useNavigationStore } from '@/core/store/navigation';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { Anchor, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface NodeAssociationsProps {
  associations: AlfrescoNodeAssociation[];
  serverId: number;
  type: 'source' | 'target';
}

export function NodeAssociations({ associations, serverId, type }: NodeAssociationsProps) {
  const { t } = useTranslation(['nodeBrowser']);
  const { openTab } = useNodeBrowserTabsStore();
  const { navigate } = useNavigationStore();

  if (!associations || associations.length === 0) {
    return (
      <Text c="dimmed" size="sm" fs="italic" p="md">
        {t('nodeBrowser:noAssociations')}
      </Text>
    );
  }

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
    });
    navigate('node-browser');
  };

  return (
    <Stack gap="md" p="md">
      <Paper withBorder p="md" radius="xs">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('nodeBrowser:assocType')}</Table.Th>
              <Table.Th>
                {type === 'source' ? t('nodeBrowser:sourceNode') : t('nodeBrowser:targetNode')}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {associations.map((assoc, idx) => {
              const targetRef = type === 'source' ? assoc.sourceRef : assoc.targetRef;

              return (
                <Table.Tr key={idx}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {assoc.assocType.prefixedName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {assoc.type.prefixedName}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      size="sm"
                      style={{ wordBreak: 'break-all', cursor: 'pointer' }}
                      onClick={() => handleNodeRefClick(targetRef)}
                    >
                      <Group gap="xs" wrap="nowrap" style={{ display: 'inline-flex' }}>
                        <IconFolder size={16} style={{ flexShrink: 0 }} />
                        <Text component="span" size="sm" style={{ wordBreak: 'break-all' }}>
                          {targetRef}
                        </Text>
                      </Group>
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
