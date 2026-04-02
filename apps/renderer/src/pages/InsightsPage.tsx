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

/**
 * Insights Page
 * Server-specific time-series insight graphs using Alfresco count queries.
 * Lazy-loaded via navigation config.
 */

import { BrandLogo } from '@/components/BrandLogo';
import { backendRpc } from '@/core/ipc/backend';
import type { InsightGraph } from '@/core/ipc/backend';
import { useServersStore } from '@/core/store/servers';
import { useActiveServerId } from '@/hooks/useNavigation';
import { InsightGraphCard } from '@/components/insights/InsightGraphCard';
import { InsightGraphSettingsModal } from '@/components/insights/InsightGraphSettingsModal';
import {
  INSIGHT_RANGE_DAYS as RANGE_OPTIONS,
  isInsightRangeDays,
  normalizeInsightRangeDays,
  type InsightRangeDays,
} from '@/utils/insightsRange';
import {
  ActionIcon,
  Alert,
  Center,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggleInsightPin } from '@/hooks/useToggleInsightPin';
import { useInsightsDashboard } from '@/hooks/useInsightsDashboard';

function InsightsPage() {
  const { t } = useTranslation(['insights', 'common']);
  const activeServerId = useActiveServerId();
  const activeServer = useServersStore(state =>
    activeServerId ? (state.servers.find(server => server.id === activeServerId) ?? null) : null
  );
  const updateServer = useServersStore(state => state.updateServer);
  const selectedRange = normalizeInsightRangeDays(activeServer?.insightRangeDays);
  const latestRangeSaveIdRef = useRef(0);

  const { dashboard, graphs, loading, error, loadDashboard, setGraphs } = useInsightsDashboard(
    activeServerId,
    selectedRange
  );

  // Modal state
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingGraph, setEditingGraph] = useState<InsightGraph | null>(null);
  const pinnedByGraphId = useMemo(
    () => new Map(graphs.map(graph => [graph.id, graph.isPinned])),
    [graphs]
  );

  const handleEditGraph = useCallback(
    (graphId: number) => {
      const graph = graphs.find(g => g.id === graphId) ?? null;
      setEditingGraph(graph);
      openModal();
    },
    [graphs, openModal]
  );

  const handleAddGraph = useCallback(() => {
    setEditingGraph(null);
    openModal();
  }, [openModal]);

  const handleSaved = useCallback(() => {
    loadDashboard();
  }, [loadDashboard]);

  const updateGraphPinState = useCallback(
    (graphId: number, isPinned: boolean) => {
      setGraphs(prev => prev.map(g => (g.id === graphId ? { ...g, isPinned } : g)));
    },
    [setGraphs]
  );

  const handleTogglePin = useToggleInsightPin(updateGraphPinState, updateGraphPinState);

  if (!activeServerId) {
    return (
      <Center h="100%">
        <Text c="dimmed">{t('common:noServerSelected')}</Text>
      </Center>
    );
  }

  return (
    <Stack h="100%" p="lg" gap="md" style={{ overflow: 'auto' }}>
      {/* Header with range selector and add button */}
      <Group justify="space-between" align="center">
        <SegmentedControl
          value={String(selectedRange)}
          onChange={async value => {
            if (!activeServerId) {
              return;
            }

            const parsedRange = parseInt(value, 10);
            if (!isInsightRangeDays(parsedRange)) {
              return;
            }
            const nextRange: InsightRangeDays = parsedRange;

            const serverId = activeServerId;
            const saveId = ++latestRangeSaveIdRef.current;
            updateServer(serverId, { insightRangeDays: nextRange });
            try {
              const updatedServer = await backendRpc.servers.update(serverId, {
                insightRangeDays: nextRange,
              });

              // Ignore out-of-order responses from older requests.
              if (saveId !== latestRangeSaveIdRef.current) {
                return;
              }
              updateServer(serverId, {
                insightRangeDays: normalizeInsightRangeDays(updatedServer.insightRangeDays),
              });
            } catch (error) {
              if (saveId !== latestRangeSaveIdRef.current) {
                return;
              }
              console.error('Failed to persist insight range preference:', error);

              // Re-sync from backend instead of reverting to a potentially stale local value.
              try {
                const refreshedServer = await backendRpc.servers.get(serverId);
                if (saveId !== latestRangeSaveIdRef.current) {
                  return;
                }
                updateServer(serverId, {
                  insightRangeDays: normalizeInsightRangeDays(refreshedServer.insightRangeDays),
                });
              } catch (refreshError) {
                console.error(
                  'Failed to refresh persisted insight range preference:',
                  refreshError
                );
              }
            }
          }}
          data={RANGE_OPTIONS.map(days => ({
            label: t(`insights:range${days}`),
            value: String(days),
          }))}
          size="xs"
        />
        <Tooltip label={t('insights:addGraph')} withArrow>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={handleAddGraph}
            aria-label={t('insights:addGraph')}
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Error state */}
      {error && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertCircle size={18} />}
          title={t('common:error')}
        >
          {error}
        </Alert>
      )}

      {/* Loading state */}
      {loading && (
        <Center style={{ flex: 1 }}>
          <Loader />
        </Center>
      )}

      {/* Empty state */}
      {!loading && !error && (!dashboard || dashboard.graphs.length === 0) && (
        <Stack
          align="center"
          style={{
            flex: 1,
            width: '100%',
            minHeight: 'calc(100vh - 240px)',
            textAlign: 'center',
          }}
        >
          <Stack align="center" gap="xs" pt="xl">
            <Text fw={500}>{t('insights:noGraphs')}</Text>
            <Text size="sm" c="dimmed" ta="center" maw={360}>
              {t('insights:noGraphsDescription')}
            </Text>
          </Stack>
          <Center style={{ flex: 1, width: '100%' }}>
            <div style={{ opacity: 0.08 }}>
              <BrandLogo size={240} color="var(--mantine-color-gray-6)" />
            </div>
          </Center>
        </Stack>
      )}

      {/* Graph cards grid */}
      {!loading && dashboard && dashboard.graphs.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {dashboard.graphs.map(item => (
            <div
              key={item.graphId}
              style={item.columnSpan === 2 ? { gridColumn: '1 / -1' } : undefined}
            >
              <InsightGraphCard
                item={item}
                isPinned={pinnedByGraphId.get(item.graphId) ?? false}
                onEdit={handleEditGraph}
                onTogglePin={handleTogglePin}
              />
            </div>
          ))}
        </SimpleGrid>
      )}

      {/* Settings modal */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingGraph ? t('insights:editGraph') : t('insights:addGraph')}
        size="md"
      >
        <InsightGraphSettingsModal
          graph={editingGraph}
          serverId={activeServerId}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      </Modal>
    </Stack>
  );
}

export default InsightsPage;
