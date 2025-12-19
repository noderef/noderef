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

import { backendRpc } from '@/core/ipc/backend';
import type { NodeHistoryActivitySummary, NodeHistoryTimelineItem } from '@app/contracts';
import { Heatmap } from '@mantine/charts';
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Tooltip,
  useComputedColorScheme,
  useMantineTheme,
  rgba,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconClockHour4,
  IconFolder,
  IconServer,
  IconUser,
} from '@tabler/icons-react';
import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useNavigation } from '@/hooks/useNavigation';
import { formatRelativeTime } from '@/utils/formatTime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_ACTIVITY_DAYS = 365;

function formatDateLabel(value: string | Date, locale?: string): string {
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : value.toString();
  }
  return parsed.toLocaleDateString(locale ?? undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getLocalDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseLocalDayKey(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => Number.isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function extractNodeIdFromRef(nodeRef?: string | null): string | null {
  if (!nodeRef) {
    return null;
  }

  const match = nodeRef.match(/SpacesStore\/([^/]+)$/i);
  if (match) {
    return match[1];
  }

  const sanitized = nodeRef.replace(/^workspace:\/\/?/i, '');
  const parts = sanitized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? sanitized;
}

function getFolderNameFromPath(path?: string | null): string | null {
  if (!path) {
    return null;
  }

  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

const TIMELINE_PAGE_SIZE = 20;

export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language ?? undefined;
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const { ref: heatmapRef, width: heatmapWidth } = useElementSize();
  const [heatmapSvgWidth, setHeatmapSvgWidth] = useState<number | null>(null);
  const [activity, setActivity] = useState<NodeHistoryActivitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [timelineStartDay, setTimelineStartDay] = useState<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);
  const { navigate } = useNavigation();

  // Load initial data (heatmap + first page of timeline)
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    backendRpc.nodeHistory
      .activity({ days: DEFAULT_ACTIVITY_DAYS, limit: TIMELINE_PAGE_SIZE })
      .then(data => {
        if (!mounted) {
          return;
        }
        setActivity(data);
        setHasMore(data.timeline.length >= TIMELINE_PAGE_SIZE);
      })
      .catch(err => {
        console.error('Failed to load node activity', err);
        if (mounted) {
          setError(err instanceof Error ? { message: err.message } : {});
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Load more timeline items
  const loadMoreTimeline = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const offset = activity?.timeline.length ?? 0;
      const data = await backendRpc.nodeHistory.activity({
        days: DEFAULT_ACTIVITY_DAYS,
        limit: TIMELINE_PAGE_SIZE,
        offset,
      });
      // Merge new timeline items, avoiding duplicates
      if (data.timeline.length > 0) {
        setActivity(prev => {
          if (!prev) {
            return data;
          }

          const existingIds = new Set(prev.timeline.map(item => item.id));
          const newItems = data.timeline.filter(item => !existingIds.has(item.id));

          return {
            ...prev,
            timeline: [...prev.timeline, ...newItems],
            heatmap: data.heatmap,
          };
        });
      }
      setHasMore(data.timeline.length === TIMELINE_PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more timeline items', err);
    } finally {
      setLoadingMore(false);
    }
  }, [activity, hasMore, loadingMore]);

  const timeline = activity?.timeline ?? [];
  const hasActivity = timeline.length > 0;
  const shouldShowTimelineSection = hasActivity || loading || loadingMore;
  const visibleTimeline = useMemo(() => {
    if (!timelineStartDay) {
      return timeline;
    }
    const parsed = parseLocalDayKey(timelineStartDay);
    if (!parsed) {
      return timeline;
    }
    const cutoff = getEndOfDay(parsed);
    return timeline.filter(item => {
      const accessedAt = new Date(item.accessedAt);
      return accessedAt <= cutoff;
    });
  }, [timeline, timelineStartDay]);
  const hasVisibleTimeline = visibleTimeline.length > 0;
  const timelineGroups = useMemo(() => {
    if (!hasActivity || visibleTimeline.length === 0) {
      return [];
    }

    const groups: Array<{
      key: string;
      label: string;
      date: Date | null;
      items: NodeHistoryTimelineItem[];
    }> = [];
    const indexByKey = new Map<string, number>();

    for (const item of visibleTimeline) {
      const accessedAt = new Date(item.accessedAt);
      const hasValidDate = !Number.isNaN(accessedAt.getTime());
      const groupKey = hasValidDate ? getLocalDayKey(accessedAt) : `invalid-${item.id}`;
      const existingIndex = indexByKey.get(groupKey);

      if (existingIndex !== undefined) {
        groups[existingIndex]?.items.push(item);
        continue;
      }

      indexByKey.set(groupKey, groups.length);
      groups.push({
        key: groupKey,
        label: hasValidDate ? formatDateLabel(accessedAt, locale) : item.accessedAt,
        date: hasValidDate
          ? new Date(accessedAt.getFullYear(), accessedAt.getMonth(), accessedAt.getDate())
          : null,
        items: [item],
      });
    }

    return groups;
  }, [hasActivity, locale, visibleTimeline]);

  // Measure actual heatmap SVG width
  useEffect(() => {
    if (!heatmapRef.current || !hasActivity) {
      return;
    }

    const updateWidth = () => {
      // Find the SVG element inside the heatmap container
      const svgElement = heatmapRef.current?.querySelector('svg');
      if (svgElement) {
        const svgWidth = svgElement.getBoundingClientRect().width;
        if (svgWidth > 0) {
          setHeatmapSvgWidth(svgWidth);
        }
      }
    };

    // Initial measurement with a small delay to ensure SVG is rendered
    const timeoutId = setTimeout(updateWidth, 100);

    // Use ResizeObserver to track changes
    if (heatmapRef.current) {
      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(heatmapRef.current);

      return () => {
        clearTimeout(timeoutId);
        resizeObserver.disconnect();
      };
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activity, heatmapWidth, hasActivity]);

  const palette = theme.colors.blue ?? theme.colors[theme.primaryColor] ?? theme.colors.green;
  const primaryShadeValue = useMemo(() => {
    const shade = theme.primaryShade;
    if (typeof shade === 'number') {
      return shade;
    }
    if (shade && typeof shade === 'object') {
      const mode = colorScheme === 'dark' ? 'dark' : 'light';
      return shade[mode] ?? 6;
    }
    return 6;
  }, [colorScheme, theme.primaryShade]);
  const applyAlpha = (color: string, alpha: number) => {
    return rgba(color, alpha);
  };
  const heatmapColors =
    colorScheme === 'dark'
      ? [
          applyAlpha(palette[4], 0.45),
          applyAlpha(palette[5], 0.65),
          applyAlpha(palette[6], 0.8),
          palette[7],
        ]
      : [palette[1], palette[2], palette[4], palette[6]];
  const zeroColor = colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2];
  const legendColors = [zeroColor, ...heatmapColors];
  const heatmapLabelColor = colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.dark[6];
  const heatmapStyles = useMemo(
    () => ({
      monthLabel: {
        fill: heatmapLabelColor,
      },
      weekdayLabel: {
        fill: heatmapLabelColor,
      },
    }),
    [heatmapLabelColor]
  );

  // Define custom thresholds for color mapping
  // Values: [0, threshold1, threshold2, threshold3, ...]
  // Colors are assigned: 0 = gray, 1-2 = color1, 3-5 = color2, 6-10 = color3, 11+ = color4
  const colorThresholds = [0, 26, 51, 100, 150]; // Adjust these values to change when colors change

  // Function to get color based on node count
  const getColorForValue = (value: number | null | undefined): string => {
    if (!value || value === 0) {
      return zeroColor;
    }
    for (let i = colorThresholds.length - 1; i > 0; i--) {
      if (value >= colorThresholds[i]) {
        return heatmapColors[Math.min(i - 1, heatmapColors.length - 1)];
      }
    }
    return heatmapColors[0] ?? zeroColor;
  };

  // Function to get legend label for each color
  const getLegendLabel = (index: number): string => {
    if (index === 0) {
      return t('heatmap.noActivityLegend');
    }
    const thresholdIndex = index - 1;
    const min = colorThresholds[thresholdIndex];
    const max = colorThresholds[thresholdIndex + 1] - 1;
    if (thresholdIndex === colorThresholds.length - 2) {
      return t('heatmap.legendRangePlus', {
        min,
      });
    }
    return t('heatmap.legendRange', {
      min,
      max,
    });
  };

  const heatmapData = useMemo(() => {
    if (!activity) {
      return {};
    }
    return activity.heatmap.reduce<Record<string, number>>((acc, point) => {
      acc[point.date] = point.count;
      return acc;
    }, {});
  }, [activity]);

  const heatmapMonthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    return Array.from({ length: 12 }, (_, index) =>
      formatter.format(new Date(Date.UTC(2021, index, 1)))
    );
  }, [locale]);

  const heatmapWeekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const sunday = new Date(Date.UTC(2021, 0, 3)); // Sunday reference
    const names = Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(sunday.getTime() + index * 24 * 60 * 60 * 1000))
    );
    return [names[0] ?? '', names[1] ?? '', '', names[3] ?? '', '', names[5] ?? '', ''];
  }, [locale]);

  useEffect(() => {
    if (!hasActivity) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadMoreTimeline();
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasActivity, loadMoreTimeline]);

  useEffect(() => {
    if (!timelineStartDay || !hasMore || loadingMore) {
      return;
    }
    const selectedDate = parseLocalDayKey(timelineStartDay);
    if (!selectedDate) {
      return;
    }
    const oldestItem = timeline[timeline.length - 1];
    if (!oldestItem) {
      return;
    }
    const oldestDate = new Date(oldestItem.accessedAt);
    oldestDate.setHours(0, 0, 0, 0);
    if (selectedDate < oldestDate) {
      loadMoreTimeline();
    }
  }, [hasMore, loadMoreTimeline, loadingMore, timeline, timelineStartDay]);

  const handleHeatmapDayClick = useCallback(
    (day: string) => {
      setTimelineStartDay(prev => (prev === day ? null : day));
      if (timelineContainerRef.current) {
        timelineContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [timelineContainerRef]
  );

  const clearTimelineStart = useCallback(() => setTimelineStartDay(null), []);
  const selectedTimelineLabel = useMemo(
    () => (timelineStartDay ? formatDateLabel(timelineStartDay, locale) : null),
    [locale, timelineStartDay]
  );
  const timelineActiveIndex = timelineGroups.findIndex(g => g.key === getLocalDayKey(new Date()));
  const timelineActive =
    timelineActiveIndex === -1 ? timelineGroups.length : timelineActiveIndex + 1;

  const heatmapRange = useMemo(() => {
    if (!activity || activity.heatmap.length === 0) {
      return { start: undefined, end: undefined };
    }

    const lastDate = activity.heatmap[activity.heatmap.length - 1]?.date;

    // Calculate how many weeks fit in the available width
    // rectSize(18) + gap(3) = 21px per week
    // ~30-50px for labels
    const weekWidth = 21;
    const labelOffset = 50;

    const availableWeeks = Math.max(0, (heatmapWidth - labelOffset) / weekWidth);

    // Clamp between ~2 months (9 weeks) and ~12 months (52 weeks)
    const weeksToShow = Math.max(9, Math.min(52, Math.floor(availableWeeks)));

    if (!lastDate) {
      return { start: undefined, end: undefined };
    }

    const end = new Date(lastDate);
    // Add one day to end date to ensure the last day is fully included
    end.setDate(end.getDate() + 1);

    const start = new Date(end);
    start.setDate(end.getDate() - weeksToShow * 7);

    return {
      start: start.toISOString().slice(0, 10), // Format as YYYY-MM-DD
      end: end.toISOString().slice(0, 10), // Format as YYYY-MM-DD
    };
  }, [activity, heatmapWidth]);

  const handleNodeNavigate = useCallback(
    (item: NodeHistoryTimelineItem) => {
      const nodeId = extractNodeIdFromRef(item.nodeRef);
      if (!nodeId) {
        return;
      }

      openNodeTab({
        nodeId,
        nodeName: item.name ?? nodeId,
        serverId: item.serverId,
      });
      navigate('node-browser');
    },
    [navigate, openNodeTab]
  );

  const handlePathNavigate = useCallback(
    (item: NodeHistoryTimelineItem) => {
      if (!item.parentRef) {
        return;
      }
      const parentId = extractNodeIdFromRef(item.parentRef);
      if (!parentId) {
        return;
      }
      const folderName = getFolderNameFromPath(item.path) ?? item.path ?? parentId;
      openFolderTab({
        nodeId: parentId,
        nodeName: folderName,
        serverId: item.serverId,
      });
      navigate('file-folder-browser');
    },
    [navigate, openFolderTab]
  );

  return (
    <Stack h="100%" p="lg" gap="xs" style={{ overflow: 'auto' }}>
      {error && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertCircle size={18} />}
          title={t('common:error')}
        >
          {error.message ?? t('errors.activityLoadFailed')}
        </Alert>
      )}

      <Box
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Box
          style={{
            width: heatmapSvgWidth ? `${heatmapSvgWidth}px` : '100%',
            maxWidth: '100%',
            marginBottom: 'var(--mantine-spacing-lg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--mantine-spacing-md)',
          }}
        >
          <Stack gap={2} style={{ flex: 1 }}>
            <Text fw={600} size="lg">
              {t('activity')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('activityDescription')}
            </Text>
          </Stack>
          {hasActivity && (
            <Group gap={2} style={{ flexShrink: 0 }}>
              {legendColors.map((color, idx) => (
                <Tooltip key={`${color}-${idx}`} label={getLegendLabel(idx)} withArrow withinPortal>
                  <Box
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 2,
                      backgroundColor: color,
                      border: `1px solid ${
                        colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[3]
                      }`,
                      cursor: 'help',
                    }}
                  />
                </Tooltip>
              ))}
            </Group>
          )}
        </Box>
        <Box
          ref={heatmapRef}
          style={{
            width: '100%',
            maxWidth: '100%',
            minHeight: 200,
            paddingBottom: 'var(--mantine-spacing-sm)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {hasActivity ? (
            <Box
              style={{
                width: heatmapSvgWidth ? `${heatmapSvgWidth}px` : 'auto',
                maxWidth: '100%',
              }}
            >
              <Heatmap
                data={heatmapData}
                startDate={heatmapRange.start}
                endDate={heatmapRange.end}
                firstDayOfWeek={1}
                monthLabels={heatmapMonthLabels}
                weekdayLabels={heatmapWeekdayLabels}
                withTooltip
                withWeekdayLabels
                withMonthLabels
                colors={heatmapColors}
                rectSize={18}
                gap={3}
                style={{ display: 'block' }}
                styles={heatmapStyles}
                tooltipProps={{
                  withinPortal: true,
                  style: {
                    textAlign: 'center',
                    backgroundColor: colorScheme === 'dark' ? theme.colors.dark[6] : undefined,
                    color: colorScheme === 'dark' ? theme.white : undefined,
                    border:
                      colorScheme === 'dark' ? `1px solid ${theme.colors.dark[4]}` : undefined,
                    boxShadow:
                      colorScheme === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.45)' : undefined,
                  },
                }}
                getTooltipLabel={({ date, value }) => {
                  const formattedDate = formatDateLabel(date, locale);
                  return (
                    <Stack gap={2} style={{ minWidth: 140 }} align="center">
                      <Text fw={600} size="sm">
                        {t('heatmap.tooltipCount', {
                          count: value ?? 0,
                        })}
                      </Text>
                      <Text size="xs" c={colorScheme === 'dark' ? theme.colors.gray[3] : 'dimmed'}>
                        {t('heatmap.tooltipDate', {
                          date: formattedDate,
                        })}
                      </Text>
                    </Stack>
                  );
                }}
                getRectProps={({ value, date }) => {
                  const fillColor = getColorForValue(value);
                  const isSelected = timelineStartDay === date;
                  const baseProps =
                    value && value > 0
                      ? { fill: fillColor }
                      : {
                          fill: zeroColor,
                          stroke:
                            colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[3],
                          opacity: 1,
                        };

                  return {
                    ...baseProps,
                    style: { cursor: 'pointer', outline: 'none' },
                    onMouseDown: event => event.preventDefault(),
                    onClick: () => handleHeatmapDayClick(date),
                    onKeyDown: event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleHeatmapDayClick(date);
                      }
                    },
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': t('heatmap.jumpToDate', {
                      date: formatDateLabel(date, locale),
                    }),
                    'aria-pressed': isSelected,
                  };
                }}
              />
            </Box>
          ) : (
            <Center style={{ flex: 1 }}>
              {loading ? (
                <Loader />
              ) : (
                <Stack gap="xs" align="center">
                  <Text fw={500}>{t('noActivity')}</Text>
                  <Text size="sm" c="dimmed" ta="center">
                    {t('noActivityDescription')}
                  </Text>
                </Stack>
              )}
            </Center>
          )}
        </Box>
      </Box>

      {shouldShowTimelineSection && (
        <Paper
          withBorder={false}
          radius="md"
          p="lg"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {hasActivity ? (
            <Box style={{ flex: 1, overflowY: 'auto' }} ref={timelineContainerRef}>
              <Box
                style={{
                  width: heatmapSvgWidth ? `${heatmapSvgWidth}px` : '100%',
                  maxWidth: '100%',
                  margin: '0 auto',
                  overflow: 'hidden',
                }}
              >
                {timelineStartDay && (
                  <Group justify="space-between" align="center" mb="sm">
                    <Text size="sm" c="dimmed">
                      {t('timeline.filteredFrom', {
                        date: selectedTimelineLabel ?? timelineStartDay ?? '',
                      })}
                    </Text>
                    <Button variant="subtle" size="xs" onClick={clearTimelineStart}>
                      {t('timeline.clearFilter')}
                    </Button>
                  </Group>
                )}
                {hasVisibleTimeline ? (
                  <>
                    <Timeline
                      active={timelineActive}
                      bulletSize={28}
                      lineWidth={2}
                      style={{ width: '100%', maxWidth: '100%' }}
                    >
                      {timelineGroups.map(group => {
                        const isToday = group.key === getLocalDayKey(new Date());
                        const inactiveLineColor =
                          colorScheme === 'dark' ? theme.colors.gray[6] : theme.colors.gray[4];
                        const primaryColorScale =
                          theme.colors[theme.primaryColor] ?? theme.colors.blue ?? [];
                        const activeLineColor =
                          primaryColorScale?.[primaryShadeValue] ??
                          primaryColorScale?.[6] ??
                          inactiveLineColor;
                        const lineColor = isToday ? activeLineColor : inactiveLineColor;

                        return (
                          <Timeline.Item
                            key={group.key}
                            color={isToday ? 'blue' : 'gray'}
                            lineVariant="solid"
                            style={{ '--tl-color': lineColor } as CSSProperties}
                            bullet={
                              <ThemeIcon
                                color={isToday ? 'blue' : 'gray'}
                                variant={isToday ? 'filled' : 'default'}
                                radius="xl"
                                size={28}
                              >
                                <IconClockHour4 size={16} />
                              </ThemeIcon>
                            }
                            title={
                              <Box style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                                <Text
                                  fw={600}
                                  size="sm"
                                  style={{ width: '100%', maxWidth: '100%' }}
                                >
                                  {group.label}
                                </Text>
                              </Box>
                            }
                          >
                            <Stack gap="md" mt="sm">
                              {group.items.map(item => {
                                const accessedAt = new Date(item.accessedAt);
                                const MimeTypeIcon = getFileIconByMimeType(
                                  item.mimetype || undefined
                                );
                                const isFolder = item.type === 'cm:folder';
                                const isPerson = item.type === 'cm:person';
                                const NameIcon = isPerson
                                  ? IconUser
                                  : isFolder
                                    ? IconFolder
                                    : MimeTypeIcon;
                                const pathText = item.path ?? t('timeline.unknownLocation');
                                const pathClickable = Boolean(item.parentRef);
                                return (
                                  <Box key={item.id} style={{ width: '100%' }}>
                                    <Group
                                      justify="space-between"
                                      align="flex-start"
                                      wrap="nowrap"
                                      gap="md"
                                      style={{ width: '100%' }}
                                    >
                                      <Stack
                                        gap={2}
                                        style={{
                                          flex: 1,
                                          minWidth: 0,
                                          maxWidth: '100%',
                                          overflow: 'hidden',
                                        }}
                                      >
                                        <Group gap="xs" wrap="nowrap" style={{ width: '100%' }}>
                                          <Anchor
                                            component="button"
                                            type="button"
                                            onClick={() => handleNodeNavigate(item)}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                              padding: 0,
                                              margin: 0,
                                              background: 'none',
                                              border: 'none',
                                              flex: 1,
                                              minWidth: 0,
                                              cursor: 'pointer',
                                            }}
                                            c="inherit"
                                            fw={400}
                                            underline="hover"
                                          >
                                            <NameIcon size={16} color={theme.colors.gray[6]} />
                                            <Text
                                              component="span"
                                              fw={600}
                                              size="sm"
                                              style={{
                                                wordBreak: 'break-word',
                                                overflowWrap: 'break-word',
                                                maxWidth: '100%',
                                                overflow: 'hidden',
                                              }}
                                            >
                                              {item.name ?? item.nodeRef}
                                            </Text>
                                          </Anchor>
                                          {item.serverLabel && (
                                            <Badge
                                              size="xs"
                                              variant="light"
                                              color="gray"
                                              style={{ flexShrink: 0 }}
                                            >
                                              {item.serverLabel}
                                            </Badge>
                                          )}
                                        </Group>
                                        {pathClickable ? (
                                          <Anchor
                                            component="button"
                                            type="button"
                                            onClick={() => handlePathNavigate(item)}
                                            style={{
                                              padding: 0,
                                              margin: 0,
                                              background: 'none',
                                              border: 'none',
                                              textAlign: 'left',
                                              width: '100%',
                                              cursor: 'pointer',
                                            }}
                                            c="dimmed"
                                            fw={400}
                                            underline="hover"
                                          >
                                            <Text
                                              component="span"
                                              size="xs"
                                              c="dimmed"
                                              title={pathText}
                                              lineClamp={1}
                                              style={{
                                                wordBreak: 'break-word',
                                                overflowWrap: 'break-word',
                                                maxWidth: '100%',
                                                overflow: 'hidden',
                                              }}
                                            >
                                              {pathText}
                                            </Text>
                                          </Anchor>
                                        ) : (
                                          <Text
                                            component="span"
                                            size="xs"
                                            c="dimmed"
                                            title={pathText}
                                            lineClamp={1}
                                            style={{
                                              wordBreak: 'break-word',
                                              overflowWrap: 'break-word',
                                              maxWidth: '100%',
                                              overflow: 'hidden',
                                            }}
                                          >
                                            {pathText}
                                          </Text>
                                        )}
                                      </Stack>
                                      <Stack gap={0} align="flex-end" style={{ flexShrink: 0 }}>
                                        <Text size="xs" c="dimmed">
                                          {formatRelativeTime(accessedAt, locale)}
                                        </Text>
                                      </Stack>
                                    </Group>
                                    <Group gap="xs" mt="xs">
                                      {item.serverName && (
                                        <Badge
                                          color="blue"
                                          leftSection={<IconServer size={14} />}
                                          radius="sm"
                                          variant="light"
                                        >
                                          {item.serverName}
                                        </Badge>
                                      )}
                                    </Group>
                                  </Box>
                                );
                              })}
                            </Stack>
                          </Timeline.Item>
                        );
                      })}
                    </Timeline>
                    {loadingMore && (
                      <Center py="md">
                        <Loader size="sm" />
                      </Center>
                    )}
                    <Box ref={loadMoreSentinelRef} style={{ height: 1 }} />
                  </>
                ) : (
                  <Center py="md">
                    <Stack gap={4} align="center">
                      <Text fw={500}>
                        {t('timeline.noEntriesForSelection', {
                          date: selectedTimelineLabel ?? timelineStartDay ?? '',
                        })}
                      </Text>
                      <Text size="sm" c="dimmed" ta="center">
                        {t('timeline.tryLoadingMore')}
                      </Text>
                      <Button variant="light" size="xs" onClick={clearTimelineStart}>
                        {t('timeline.clearFilter')}
                      </Button>
                    </Stack>
                  </Center>
                )}
              </Box>
            </Box>
          ) : (
            <Center style={{ flex: 1 }}>
              {loading ? (
                <Loader />
              ) : (
                <Stack gap="xs" align="center">
                  <Text fw={500}>{t('noActivity')}</Text>
                  <Text size="sm" c="dimmed" ta="center">
                    {t('noActivityDescription')}
                  </Text>
                </Stack>
              )}
            </Center>
          )}
        </Paper>
      )}
    </Stack>
  );
}
