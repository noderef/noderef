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

import {
  ActionIcon,
  Anchor,
  Box,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InspectorResizeHandle } from './InspectorResizeHandle';
import type { ModelAssociation, ModelProperty, SchemaRecord } from './types';

const INSPECTOR_MIN_WIDTH = 280;
const INSPECTOR_MAX_WIDTH = 560;

const SECTION_LABEL_MB = 4;
const LINK_LIST_GAP = 4;

/** Mantine Anchor as button stretches full width by default; keep links left-aligned. */
const inspectorLinkStyle = {
  display: 'inline-block',
  textAlign: 'left' as const,
  padding: 0,
  height: 'auto',
  lineHeight: 1.45,
  maxWidth: '100%',
};

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Text size="sm" fw={500} mb={SECTION_LABEL_MB}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function InspectorLinkList({
  items,
  onNavigateToId,
}: {
  items: Array<{ id: string; label: string }>;
  onNavigateToId: (id: string) => void;
}) {
  return (
    <Stack gap={LINK_LIST_GAP} align="flex-start">
      {items.map(item => (
        <Anchor
          key={item.id}
          size="sm"
          component="button"
          type="button"
          onClick={() => onNavigateToId(item.id)}
          style={inspectorLinkStyle}
        >
          {item.label}
        </Anchor>
      ))}
    </Stack>
  );
}

function InspectorAssociationList({
  associations,
  onNavigateToId,
}: {
  associations: ModelAssociation[];
  onNavigateToId: (id: string) => void;
}) {
  return (
    <Stack gap={LINK_LIST_GAP} align="flex-start">
      {associations.map(assoc => {
        const key = `${assoc.name}-${assoc.targetClass ?? ''}`;
        if (assoc.targetClass) {
          return (
            <Anchor
              key={key}
              size="sm"
              component="button"
              type="button"
              onClick={() => onNavigateToId(assoc.targetClass!)}
              style={inspectorLinkStyle}
            >
              {assoc.name}
            </Anchor>
          );
        }
        return (
          <Text key={key} size="sm" c="dimmed">
            {assoc.name}
          </Text>
        );
      })}
    </Stack>
  );
}

interface SchemaInspectorProps {
  record: SchemaRecord | null;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onNavigateToId: (id: string) => void;
}

function formatIndexingFlags(prop: ModelProperty, t: (key: string) => string): string {
  const parts: string[] = [];
  if (prop.indexed) {
    parts.push(t('modelExplorerIndexed'));
  }
  if (prop.tokenised) {
    parts.push(t('modelExplorerTokenised'));
  }
  if (prop.facetable) {
    parts.push(t('modelExplorerFacetable'));
  }
  return parts.join(', ');
}

export function SchemaInspector({
  record,
  width,
  onWidthChange,
  onClose,
  onNavigateToId,
}: SchemaInspectorProps) {
  const { t } = useTranslation('submenu');
  const noneLabel = t('modelExplorerNone');

  return (
    <Box
      w={width}
      style={{
        borderLeft: '1px solid var(--mantine-color-default-border)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'row',
        minHeight: 0,
      }}
    >
      <InspectorResizeHandle
        width={width}
        minWidth={INSPECTOR_MIN_WIDTH}
        maxWidth={INSPECTOR_MAX_WIDTH}
        onResize={onWidthChange}
      />
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Group justify="space-between" px="md" py="sm" wrap="nowrap">
          <Title order={5}>{t('modelExplorerInspectorTitle')}</Title>
          <ActionIcon variant="subtle" onClick={onClose} aria-label={t('modelExplorerClose')}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
        <Divider />
        <ScrollArea flex={1} px="md" py="sm" type="auto">
          {!record ? (
            <Text size="sm" c="dimmed">
              {t('modelExplorerNoSelection')}
            </Text>
          ) : (
            <Stack gap="md">
              <div>
                <Text fw={600}>{record.label}</Text>
                <Text size="xs" c="dimmed">
                  {record.id}
                </Text>
                {record.description && (
                  <Text size="sm" mt={4}>
                    {record.description}
                  </Text>
                )}
              </div>

              {record.parent && (
                <InspectorSection title={t('modelExplorerParentType')}>
                  <InspectorLinkList
                    items={[{ id: record.parent, label: record.parent }]}
                    onNavigateToId={onNavigateToId}
                  />
                </InspectorSection>
              )}

              {record.mandatoryAspects.length > 0 && (
                <InspectorSection title={t('modelExplorerMandatoryAspects')}>
                  <InspectorLinkList
                    items={record.mandatoryAspects.map(aspectId => ({
                      id: aspectId,
                      label: aspectId,
                    }))}
                    onNavigateToId={onNavigateToId}
                  />
                </InspectorSection>
              )}

              {record.properties.length > 0 && (
                <InspectorSection title={t('modelExplorerProperties')}>
                  <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                    <Table
                      striped
                      highlightOnHover
                      horizontalSpacing="sm"
                      verticalSpacing="xs"
                      layout="fixed"
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t('modelExplorerProperty')}</Table.Th>
                          <Table.Th>{t('modelExplorerConstraints')}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {record.properties.map(prop => {
                          const indexing = formatIndexingFlags(prop, t);
                          return (
                            <Table.Tr key={prop.name}>
                              <Table.Td>
                                <Text size="sm" fw={500}>
                                  {prop.mandatory ? '* ' : ''}
                                  {prop.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {prop.dataType || noneLabel}
                                  {prop.multiValued ? ` · ${t('modelExplorerMultiValued')}` : ''}
                                </Text>
                                {indexing.length > 0 && (
                                  <Text size="xs" c="dimmed" mt={2}>
                                    {t('modelExplorerIndexing')}: {indexing}
                                  </Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">
                                  {prop.constraints?.length
                                    ? prop.constraints.join(', ')
                                    : noneLabel}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Paper>
                </InspectorSection>
              )}

              {record.associations.length > 0 && (
                <InspectorSection title={t('modelExplorerAssociations')}>
                  <InspectorAssociationList
                    associations={record.associations}
                    onNavigateToId={onNavigateToId}
                  />
                </InspectorSection>
              )}
            </Stack>
          )}
        </ScrollArea>
      </Box>
    </Box>
  );
}
