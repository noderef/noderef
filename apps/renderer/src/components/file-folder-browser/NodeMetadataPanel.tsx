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
import { backendRpc, type AlfrescoNodeDetails } from '@/core/ipc/backend';
import { formatBytes } from '@/utils/formatBytes';
import {
  Accordion,
  ActionIcon,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFile, IconFolder, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NodeMetadataPanelProps {
  serverId: number;
  nodeId: string;
  nodeName: string;
  isFolder: boolean;
  onClose: () => void;
}

type PropertyEntry = AlfrescoNodeDetails['properties'][number];

const findProperty = (
  properties: PropertyEntry[],
  prefixedName: string
): PropertyEntry | undefined =>
  properties.find(property => property.name.prefixedName === prefixedName);

const readSingleValue = (property: PropertyEntry | undefined): string | null => {
  const value = property?.values?.[0]?.value;
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

/** cm:content values look like contentUrl=store://…|mimetype=…|size=1234|… */
const readContentFacet = (properties: PropertyEntry[], facet: string): string | null => {
  const raw = readSingleValue(findProperty(properties, 'cm:content'));
  if (!raw) {
    return null;
  }
  const match = raw.match(new RegExp(facet + '=([^|]+)'));
  return match ? match[1] : null;
};

const formatPropertyValue = (property: PropertyEntry): string => {
  if (property.values.length === 0) {
    return '-';
  }
  return property.values
    .map(entry => {
      const value = entry.value;
      if (value === null || value === undefined) {
        return '-';
      }
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    })
    .join(', ');
};

/** A read-only labelled field, matching the ADF metadata card layout. */
function MetadataField({ label, value }: { label: string; value: string | null }) {
  return <TextInput label={label} value={value ?? '—'} readOnly variant="filled" size="xs" />;
}

export function NodeMetadataPanel({
  serverId,
  nodeId,
  nodeName,
  isFolder,
  onClose,
}: NodeMetadataPanelProps) {
  const { t, i18n } = useTranslation(['common', 'fileFolderBrowser', 'nodeBrowser']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<AlfrescoNodeDetails | null>(null);
  const [filterText, setFilterText] = useState('');

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

  useEffect(() => {
    setFilterText('');
  }, [nodeId]);

  const generalFields = useMemo(() => {
    if (!nodeData) {
      return [];
    }

    const properties = nodeData.properties;
    const size = readContentFacet(properties, 'size');
    const formatDate = (value: string | null): string | null => {
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(i18n.language);
    };

    return [
      {
        label: t('fileFolderBrowser:metaName'),
        value: readSingleValue(findProperty(properties, 'cm:name')),
      },
      {
        label: t('fileFolderBrowser:metaTitle'),
        value: readSingleValue(findProperty(properties, 'cm:title')),
      },
      {
        label: t('fileFolderBrowser:metaDescription'),
        value: readSingleValue(findProperty(properties, 'cm:description')),
      },
      {
        label: t('fileFolderBrowser:metaCreator'),
        value: readSingleValue(findProperty(properties, 'cm:creator')),
      },
      {
        label: t('fileFolderBrowser:metaCreated'),
        value: formatDate(readSingleValue(findProperty(properties, 'cm:created'))),
      },
      {
        label: t('fileFolderBrowser:metaModifier'),
        value: readSingleValue(findProperty(properties, 'cm:modifier')),
      },
      {
        label: t('fileFolderBrowser:metaModified'),
        value: formatDate(readSingleValue(findProperty(properties, 'cm:modified'))),
      },
      { label: t('fileFolderBrowser:metaContentType'), value: nodeData.type.prefixedName },
      {
        label: t('fileFolderBrowser:metaMimeType'),
        value: readContentFacet(properties, 'mimetype'),
      },
      {
        label: t('fileFolderBrowser:metaSize'),
        value: size ? formatBytes(Number(size)) : null,
      },
    ];
  }, [nodeData, t, i18n.language]);

  const filteredProperties = useMemo(() => {
    if (!nodeData) {
      return [];
    }
    const sorted = [...nodeData.properties].sort((a, b) =>
      a.name.prefixedName.localeCompare(b.name.prefixedName)
    );
    const needle = filterText.trim().toLowerCase();
    if (!needle) {
      return sorted;
    }
    return sorted.filter(
      property =>
        property.name.prefixedName.toLowerCase().includes(needle) ||
        formatPropertyValue(property).toLowerCase().includes(needle)
    );
  }, [nodeData, filterText]);

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
        <Stack align="center" justify="center" p="md" style={{ flex: 1 }}>
          <Text size="sm" c="red" ta="center">
            {error || t('common:error')}
          </Text>
        </Stack>
      );
    }

    return (
      <Tabs
        defaultValue="properties"
        keepMounted={false}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <Tabs.List grow>
          <Tabs.Tab value="properties">{t('nodeBrowser:properties')}</Tabs.Tab>
          <Tabs.Tab value="aspects">{t('nodeBrowser:aspects')}</Tabs.Tab>
          <Tabs.Tab value="comments" disabled>
            {t('fileFolderBrowser:metaComments')}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="properties" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea style={{ height: '100%' }}>
            <Accordion multiple defaultValue={['general']} variant="contained" p="xs">
              <Accordion.Item value="general">
                <Accordion.Control>{t('fileFolderBrowser:metaGeneral')}</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {generalFields.map(field => (
                      <MetadataField key={field.label} label={field.label} value={field.value} />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="all">
                <Accordion.Control>
                  {t('fileFolderBrowser:metaAllProperties')} ({nodeData.properties.length})
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <TextInput
                      size="xs"
                      placeholder={t('nodeBrowser:filterProperties')}
                      leftSection={<IconSearch size={14} />}
                      value={filterText}
                      onChange={event => setFilterText(event.currentTarget.value)}
                    />
                    {filteredProperties.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        {t('nodeBrowser:noMatchingProperties')}
                      </Text>
                    ) : (
                      filteredProperties.map(property => (
                        <div key={property.name.prefixedName}>
                          <Text size="xs" c="dimmed">
                            {property.name.prefixedName}
                          </Text>
                          <Text size="sm" style={{ wordBreak: 'break-word' }}>
                            {formatPropertyValue(property)}
                          </Text>
                        </div>
                      ))
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="aspects" style={{ flex: 1, minHeight: 0 }}>
          <ScrollArea style={{ height: '100%' }}>
            <NodeAspects aspects={nodeData.aspects} />
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="comments">
          <Text size="sm" c="dimmed" p="md">
            {t('fileFolderBrowser:metaCommentsSoon')}
          </Text>
        </Tabs.Panel>
      </Tabs>
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
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          {isFolder ? (
            <IconFolder size={18} color="var(--mantine-color-yellow-6)" />
          ) : (
            <IconFile size={18} color="var(--mantine-color-gray-6)" />
          )}
          <Text size="sm" fw={600} truncate title={nodeName}>
            {nodeName}
          </Text>
        </Group>
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
