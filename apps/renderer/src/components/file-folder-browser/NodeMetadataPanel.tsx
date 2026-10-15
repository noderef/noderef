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
import { NodeComments } from './NodeComments';
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
import { IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface NodeMetadataPanelProps {
  serverId: number;
  nodeId: string;
  nodeName: string;
  nodeIcon: ReactNode;
  isFile: boolean;
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

/** Keep read-only values at the same size as the repository list. */
interface MetadataFieldProps {
  label: string;
  value: string | null;
  truncate?: boolean;
}

function MetadataField({ label, value, truncate = false }: MetadataFieldProps) {
  return (
    <Stack gap={4} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text
        size="sm"
        truncate={truncate}
        title={truncate ? (value ?? undefined) : undefined}
        style={truncate ? undefined : { whiteSpace: 'pre-wrap' }}
      >
        {value ?? '—'}
      </Text>
    </Stack>
  );
}

export function NodeMetadataPanel({
  serverId,
  nodeId,
  nodeName,
  nodeIcon,
  isFile,
  onClose,
}: NodeMetadataPanelProps) {
  const { t, i18n } = useTranslation(['common', 'fileFolderBrowser', 'nodeBrowser']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<AlfrescoNodeDetails | null>(null);
  const [filterText, setFilterText] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['general']);
  const [activeTab, setActiveTab] = useState<string | null>('properties');
  const propertiesViewportRef = useRef<HTMLDivElement>(null);

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
    setExpandedSections(['general']);
  }, [serverId, nodeId]);

  const generalFields = useMemo(() => {
    if (!nodeData) {
      return [];
    }

    const properties = nodeData.properties;
    const formatDate = (value: string | null): string | null => {
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(i18n.language);
    };

    const fields: MetadataFieldProps[] = [
      {
        label: t('fileFolderBrowser:metaName'),
        value: readSingleValue(findProperty(properties, 'cm:name')),
        truncate: true,
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
    ];

    if (isFile) {
      const size = readContentFacet(properties, 'size');
      fields.push(
        {
          label: t('fileFolderBrowser:metaMimeType'),
          value: readContentFacet(properties, 'mimetype'),
        },
        {
          label: t('fileFolderBrowser:metaSize'),
          value: size ? formatBytes(Number(size)) : null,
        }
      );
    }

    return fields;
  }, [nodeData, isFile, t, i18n.language]);

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
        <Stack align="center" justify="center" gap="xs" p="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {t('common:loading')}
          </Text>
        </Stack>
      );
    }

    if (error || !nodeData) {
      return (
        <Stack align="center" justify="center" p="md">
          <Text size="sm" c="red" ta="center">
            {error || t('common:error')}
          </Text>
        </Stack>
      );
    }

    return (
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        keepMounted={false}
        style={{
          flex: '0 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Tabs.List grow style={{ flexWrap: 'nowrap', flexShrink: 0, overflowX: 'auto' }}>
          <Tabs.Tab value="properties" px="xs">
            {t('nodeBrowser:properties')}
          </Tabs.Tab>
          <Tabs.Tab value="aspects" px="xs">
            {t('nodeBrowser:aspects')}
          </Tabs.Tab>
          <Tabs.Tab value="comments" px="xs">
            {t('fileFolderBrowser:metaComments')}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel
          value="properties"
          style={{
            flex: '0 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            display: activeTab === 'properties' ? 'flex' : undefined,
            flexDirection: 'column',
          }}
        >
          <Group
            p="sm"
            style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <TextInput
              size="sm"
              placeholder={t('nodeBrowser:filterProperties')}
              aria-label={t('nodeBrowser:filterProperties')}
              leftSection={<IconSearch size={14} />}
              value={filterText}
              onChange={event => {
                const value = event.currentTarget.value;
                setFilterText(value);
                propertiesViewportRef.current?.scrollTo({ top: 0 });
                if (value.trim()) {
                  setExpandedSections(['all']);
                }
              }}
              style={{ flex: 1 }}
            />
          </Group>
          <ScrollArea.Autosize
            viewportRef={propertiesViewportRef}
            scrollbars="y"
            style={{ minHeight: 0 }}
            styles={{ content: { minWidth: 0 } }}
          >
            <Accordion
              multiple
              value={expandedSections}
              onChange={setExpandedSections}
              styles={{
                control: {
                  fontSize: 'var(--mantine-font-size-sm)',
                  paddingInline: 'var(--mantine-spacing-sm)',
                },
                label: { fontWeight: 500 },
                content: {
                  padding: '0 var(--mantine-spacing-sm) var(--mantine-spacing-sm)',
                },
              }}
            >
              <Accordion.Item value="general">
                <Accordion.Control>{t('fileFolderBrowser:metaGeneral')}</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    {generalFields.map(field => (
                      <MetadataField key={field.label} {...field} />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="all">
                <Accordion.Control>
                  {t('fileFolderBrowser:metaAllProperties')} ({nodeData.properties.length})
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    {filteredProperties.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        {t('nodeBrowser:noMatchingProperties')}
                      </Text>
                    ) : (
                      filteredProperties.map(property => (
                        <MetadataField
                          key={property.name.prefixedName}
                          label={property.name.prefixedName}
                          value={formatPropertyValue(property)}
                          truncate={property.name.prefixedName === 'cm:name'}
                        />
                      ))
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </ScrollArea.Autosize>
        </Tabs.Panel>

        <Tabs.Panel
          value="aspects"
          style={{
            flex: '0 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            display: activeTab === 'aspects' ? 'flex' : undefined,
            flexDirection: 'column',
          }}
        >
          <ScrollArea.Autosize style={{ minHeight: 0 }}>
            <NodeAspects aspects={nodeData.aspects} compact />
          </ScrollArea.Autosize>
        </Tabs.Panel>

        <Tabs.Panel
          value="comments"
          style={{
            flex: '0 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            display: activeTab === 'comments' ? 'flex' : undefined,
            flexDirection: 'column',
          }}
        >
          <ScrollArea.Autosize style={{ minHeight: 0 }}>
            <NodeComments serverId={serverId} nodeId={nodeId} />
          </ScrollArea.Autosize>
        </Tabs.Panel>
      </Tabs>
    );
  };

  return (
    <Paper
      withBorder
      radius="md"
      style={{
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        userSelect: 'text',
      }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        gap="xs"
        p="sm"
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {nodeIcon}
          <Text size="sm" fw={600} truncate title={nodeName} style={{ flex: 1, minWidth: 0 }}>
            {nodeName}
          </Text>
        </Group>
        <ActionIcon
          variant="subtle"
          onClick={onClose}
          aria-label={t('fileFolderBrowser:closeMetadata')}
          style={{ flexShrink: 0 }}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      {renderBody()}
    </Paper>
  );
}
