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

import { AspectNode, TypeNode } from '@/components/model-explorer/SchemaNode';
import { SchemaInspector } from '@/components/model-explorer/SchemaInspector';
import type { SchemaNodeData } from '@/components/model-explorer/types';
import { useClassPropertyDetails } from '@/core/hooks/useClassPropertyDetails';
import { useModelData, type KindFilter } from '@/core/hooks/useModelData';
import { useServersStore } from '@/core/store/servers';
import { useActiveServerId } from '@/hooks/useNavigation';
import {
  ActionIcon,
  Alert,
  Box,
  Center,
  Flex,
  Group,
  Loader,
  MultiSelect,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconFocusCentered,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const nodeTypes = {
  typeNode: TypeNode,
  aspectNode: AspectNode,
};

function ModelExplorerCanvas() {
  const { t } = useTranslation('submenu');
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const inputBackground =
    colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-0)';
  const activeServerId = useActiveServerId();
  const activeServer = useServersStore(state =>
    activeServerId ? (state.servers.find(s => s.id === activeServerId) ?? null) : null
  );

  const [showSystem, setShowSystem] = useState(false);
  const [namespaceFilter, setNamespaceFilter] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(350);

  const { nodes, edges, schemaMap, loading, error, availableNamespaces } = useModelData({
    serverId: activeServerId,
    baseUrl: activeServer?.baseUrl,
    showSystem,
    namespaceFilter,
    kindFilter,
  });

  const { fitView, zoomIn, zoomOut, setCenter, getNode } = useReactFlow();
  const didInitialFitView = useRef(false);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) {
      return null;
    }

    const fromMap = schemaMap[selectedRecordId];
    if (fromMap) {
      return fromMap;
    }

    const node = nodes.find(n => n.id === selectedRecordId);
    const record = (node?.data as SchemaNodeData | undefined)?.record;
    return record ?? null;
  }, [selectedRecordId, schemaMap, nodes]);

  const inspectorRecord = useClassPropertyDetails(
    activeServerId,
    activeServer?.baseUrl,
    selectedRecord
  );

  const namespaceOptions = useMemo(
    () => availableNamespaces.map(ns => ({ value: ns, label: `${ns}:` })),
    [availableNamespaces]
  );

  useEffect(() => {
    if (nodes.length === 0) {
      didInitialFitView.current = false;
      return;
    }

    if (!didInitialFitView.current) {
      didInitialFitView.current = true;
      void fitView({ padding: 0.2, duration: 0 });
    }
  }, [nodes.length, fitView]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedRecordId(node.id);
    setInspectorOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedRecordId(null);
  }, []);

  const handleNavigateToId = useCallback(
    (id: string) => {
      const node = getNode(id);
      if (!node) return;
      setSelectedRecordId(id);
      setCenter(
        node.position.x + 125,
        node.position.y + 70,
        { zoom: 1.2, duration: 400 }
      );
      setInspectorOpen(true);
    },
    [getNode, setCenter]
  );

  const kindSegment = (
    <SegmentedControl
      size="sm"
      value={kindFilter}
      onChange={value => setKindFilter(value as KindFilter)}
      data={[
        { label: t('modelExplorerAllKinds'), value: 'all' },
        { label: t('modelExplorerTypesOnly'), value: 'type' },
        { label: t('modelExplorerAspectsOnly'), value: 'aspect' },
      ]}
    />
  );

  if (!activeServerId || !activeServer) {
    return (
      <Center h="100%">
        <Text c="dimmed">{t('noServerSelected')}</Text>
      </Center>
    );
  }

  return (
    <Flex direction="column" h="100%" style={{ minHeight: 0 }}>
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ flex: '1 1 auto', minWidth: 0 }}>
            <MultiSelect
              placeholder={t('modelExplorerNamespaceFilter')}
              data={namespaceOptions}
              value={namespaceFilter}
              onChange={setNamespaceFilter}
              clearable
              searchable
              size="sm"
              style={{ width: '100%', minWidth: 200, maxWidth: 400 }}
              maxDropdownHeight={280}
              comboboxProps={{ withinPortal: true }}
              styles={{
                input: {
                  backgroundColor: inputBackground,
                  color: 'var(--mantine-color-text)',
                },
                pillsList: {
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  scrollbarWidth: 'thin',
                },
              }}
            />
            {kindSegment}
            <Switch
              size="sm"
              label={t('modelExplorerShowSystem')}
              checked={showSystem}
              onChange={event => setShowSystem(event.currentTarget.checked)}
            />
          </Group>
          <Group gap={4}>
            <Tooltip label={t('modelExplorerFitView')}>
              <ActionIcon variant="default" onClick={() => fitView({ padding: 0.2, duration: 300 })}>
                <IconFocusCentered size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('modelExplorerZoomIn')}>
              <ActionIcon variant="default" onClick={() => zoomIn({ duration: 200 })}>
                <IconZoomIn size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('modelExplorerZoomOut')}>
              <ActionIcon variant="default" onClick={() => zoomOut({ duration: 200 })}>
                <IconZoomOut size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>

      <Flex flex={1} style={{ minHeight: 0 }}>
        <Box flex={1} pos="relative" style={{ minWidth: 0 }}>
          {loading && (
            <Center
              pos="absolute"
              inset={0}
              style={{ zIndex: 10, background: 'rgba(0,0,0,0.04)' }}
            >
              <Stack align="center" gap="xs">
                <Loader size="sm" />
                <Text size="sm">{t('modelExplorerLoading')}</Text>
              </Stack>
            </Center>
          )}

          {error && (
            <Box p="md">
              <Alert icon={<IconAlertCircle size={16} />} color="red" title={t('modelExplorerError')}>
                {error}
              </Alert>
            </Box>
          )}

          {!loading && !error && nodes.length === 0 && (
            <Center h="100%">
              <Text c="dimmed" size="sm">
                {t('modelExplorerNoModels')}
              </Text>
            </Center>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges as Edge[]}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={false}
            panOnDrag
            selectionOnDrag={false}
            style={{ background: 'var(--mantine-color-body)' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <MiniMap zoomable pannable nodeStrokeWidth={2} />
          </ReactFlow>
        </Box>

        {inspectorOpen && (
          <SchemaInspector
            record={inspectorRecord}
            width={inspectorWidth}
            onWidthChange={setInspectorWidth}
            onClose={() => {
              setInspectorOpen(false);
              setSelectedRecordId(null);
            }}
            onNavigateToId={handleNavigateToId}
          />
        )}
      </Flex>
    </Flex>
  );
}

function ModelExplorerPage() {
  return (
    <ReactFlowProvider>
      <ModelExplorerCanvas />
    </ReactFlowProvider>
  );
}

export default ModelExplorerPage;
