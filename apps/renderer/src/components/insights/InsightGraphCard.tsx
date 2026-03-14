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
 * Insight Graph Card
 * Displays a single insight graph with area chart, title, and settings action.
 */

import type {
  InsightGraphDashboardItem,
  PinnedInsightGraphDashboardItem,
} from '@/core/ipc/backend';
import { AreaChart } from '@mantine/charts';
import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconPin, IconPinnedFilled, IconSettings } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** Reset focus outlines inside chart area to avoid visual noise */
const CHART_FOCUS_RESET_CSS =
  '.insight-chart-wrap *:focus, .insight-chart-wrap *:focus-visible { outline: none !important; box-shadow: none !important; }';

interface InsightGraphCardProps {
  item: InsightGraphDashboardItem | PinnedInsightGraphDashboardItem;
  isPinned?: boolean;
  onEdit?: (graphId: number) => void;
  onTogglePin?: (graphId: number, nextPinned: boolean) => void;
}

function formatChartDate(value: string, locale?: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return value;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale ?? undefined, {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

export function InsightGraphCard({
  item,
  isPinned = false,
  onEdit,
  onTogglePin,
}: InsightGraphCardProps) {
  const { t, i18n } = useTranslation('insights');
  const locale = i18n.language ?? undefined;
  const isPinnedDashboardItem = 'serverName' in item;

  const chartData = useMemo(
    () =>
      item.series.map(point => ({
        date: point.date,
        count: point.count,
      })),
    [item.series]
  );

  const formatDate = useMemo(() => (value: string) => formatChartDate(value, locale), [locale]);

  return (
    <Paper withBorder radius="md" p="md" style={{ height: '100%' }}>
      <Stack gap="xs" style={{ height: '100%' }}>
        <Group justify="space-between" align="center">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            {isPinnedDashboardItem ? (
              <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
                <Text
                  fw={600}
                  size="sm"
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.title}
                </Text>
                <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                  {item.serverName}
                </Badge>
                <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
                  {t(`range${item.rangeDays}`)}
                </Badge>
              </Group>
            ) : (
              <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                {item.title}
              </Text>
            )}
          </Stack>
          <Group gap={4} wrap="nowrap">
            {onTogglePin && (
              <Tooltip label={isPinned ? t('unpinGraph') : t('pinGraph')} position="left" withArrow>
                <ActionIcon
                  variant="subtle"
                  color={isPinned ? 'blue' : 'gray'}
                  size="sm"
                  onClick={() => onTogglePin(item.graphId, !isPinned)}
                >
                  {isPinned ? <IconPinnedFilled size={16} /> : <IconPin size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
            {onEdit && (
              <Tooltip label={t('editGraph')} position="left" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => onEdit(item.graphId)}
                >
                  <IconSettings size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>

        <div className="insight-chart-wrap" style={{ flex: 1, minHeight: 160 }}>
          <style>{CHART_FOCUS_RESET_CSS}</style>
          <AreaChart
            h={160}
            data={chartData}
            dataKey="date"
            series={[{ name: 'count', color: item.color }]}
            curveType="monotone"
            fillOpacity={0.3}
            withGradient
            withDots={false}
            withTooltip
            tooltipAnimationDuration={150}
            tooltipProps={{
              content: ({ label, payload }) => {
                if (!payload?.length) return null;
                const value = payload[0]?.value as number;
                return (
                  <Paper px="md" py="xs" withBorder shadow="md" radius="md">
                    <Text size="xs" c="dimmed" mb={4}>
                      {formatDate(String(label))}
                    </Text>
                    <Group gap="xs" mb={4}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: item.color,
                        }}
                      />
                      <Text size="sm" fw={500}>
                        {value?.toLocaleString()}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t('tooltipDateField', { field: item.dateField })}
                    </Text>
                  </Paper>
                );
              },
            }}
            withXAxis
            withYAxis
            gridAxis="none"
            xAxisProps={{ tickFormatter: formatDate }}
          />
        </div>
      </Stack>
    </Paper>
  );
}
