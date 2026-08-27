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

import { NodeAspects } from '@/components/node-browser/NodeAspects';
import { NodeInfo } from '@/components/node-browser/NodeInfo';
import { NodeProperties } from '@/components/node-browser/NodeProperties';
import { backendRpc, type AlfrescoNodeDetails } from '@/core/ipc/backend';
import { Accordion, ActionIcon, Group, Loader, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconInfoCircle, IconListDetails, IconTags, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NodeMetadataPanelProps {
  serverId: number;
  nodeId: string;
  nodeName: string;
  onClose: () => void;
}

export function NodeMetadataPanel({ serverId, nodeId, nodeName, onClose }: NodeMetadataPanelProps) {
  const { t } = useTranslation(['common', 'fileFolderBrowser', 'nodeBrowser']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<AlfrescoNodeDetails | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchNodeDetails = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await backendRpc.repository.getNodeDetails(serverId, nodeId);
        if (!cancelled) {
          setNodeData(response.nodeData);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load node metadata:', err);
          setNodeData(null);
          setError(t('fileFolderBrowser:metadataLoadError'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchNodeDetails();

    return () => {
      cancelled = true;
    };
  }, [serverId, nodeId, t]);

  const renderBody = () => {
    if (loading) {
      return (
        <Stack align="center" justify="center" gap="xs" style={{ flex: 1 }}>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {t('common:loading')}
          </Text>
        </Stack>
      );
    }

    if (error || !nodeData) {
      return (
        <Stack
          align="center"
          justify="center"
          style={{ flex: 1, padding: 'var(--mantine-spacing-md)' }}
        >
          <Text size="sm" c="red" ta="center">
            {error || t('common:error')}
          </Text>
        </Stack>
      );
    }

    return (
      <Accordion
        multiple
        defaultValue={['info', 'properties']}
        style={{ overflow: 'auto' }}
        classNames={{ content: 'p-0' }}
      >
        <Accordion.Item value="info">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="blue" size="sm">
                <IconInfoCircle size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:info')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeInfo nodeData={nodeData} serverId={serverId} />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="properties">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="teal" size="sm">
                <IconListDetails size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:properties')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeProperties
              properties={nodeData.properties}
              serverId={serverId}
              nodeId={nodeId}
              nodeName={nodeName}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="aspects">
          <Accordion.Control
            icon={
              <ThemeIcon variant="light" color="violet" size="sm">
                <IconTags size={14} />
              </ThemeIcon>
            }
          >
            {t('nodeBrowser:aspects')}
          </Accordion.Control>
          <Accordion.Panel>
            <NodeAspects aspects={nodeData.aspects} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  };

  return (
    <Paper
      withBorder
      radius="md"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        gap="xs"
        p="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed">
            {t('fileFolderBrowser:metadata')}
          </Text>
          <Text size="sm" fw={600} truncate title={nodeName}>
            {nodeName}
          </Text>
        </div>
        <ActionIcon
          variant="subtle"
          onClick={onClose}
          aria-label={t('fileFolderBrowser:closeMetadata')}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      {renderBody()}
    </Paper>
  );
}
