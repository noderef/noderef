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

import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useServersStore } from '@/core/store/servers';
import { formatRelativeTime } from '@/utils/formatTime';
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Code,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { clipboard } from '@neutralinojs/lib';
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconCode,
  IconCopy,
  IconLoader,
  IconRobot,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function ConsoleOutput({ isNodeRefSpace }: { isNodeRefSpace: boolean }) {
  const { t } = useTranslation('jsConsole');
  const outputs = useJsConsoleStore(state => state.outputs);
  const history = useJsConsoleStore(state => state.history);
  const activeTab = useJsConsoleStore(state => state.activeTab);
  const setActiveTab = useJsConsoleStore(state => state.setActiveTab);
  const loadHistoryItem = useJsConsoleStore(state => state.loadHistoryItem);
  const isExecuting = useJsConsoleStore(state => state.isExecuting);
  const historyHasMore = useJsConsoleStore(state => state.historyHasMore);
  const historyLoading = useJsConsoleStore(state => state.historyLoading);
  const selectedServerIds = useJsConsoleStore(state => state.selectedServerIds);
  const activeOutputServerId = useJsConsoleStore(state => state.activeOutputServerId);
  const setActiveOutputServerId = useJsConsoleStore(state => state.setActiveOutputServerId);
  const servers = useServersStore(state => state.servers);
  const primaryServerId = isNodeRefSpace ? null : (selectedServerIds[0] ?? null);
  const outputServerIds = useMemo(
    () => Array.from(new Set(selectedServerIds)),
    [selectedServerIds]
  );
  const selectedServers = useMemo(
    () => servers.filter(server => selectedServerIds.includes(server.id)),
    [servers, selectedServerIds]
  );
  const historyServerId = useMemo(
    () => (selectedServers.length === 1 ? selectedServers[0].id : undefined),
    [selectedServers]
  );
  const availableOutputTabs: Array<number | 'general'> = useMemo(() => {
    if (!isNodeRefSpace) {
      if (primaryServerId !== null) {
        return [primaryServerId];
      }
      return ['general'];
    }
    const ids: Array<number | 'general'> = [...outputServerIds];
    const hasGeneralOutput = outputs.some(o => !o.serverId);
    if (hasGeneralOutput) {
      ids.unshift('general');
    }
    return ids;
  }, [isNodeRefSpace, outputs, outputServerIds, primaryServerId]);
  const activeOutputs = useMemo(() => {
    if (!isNodeRefSpace) {
      if (primaryServerId === null) {
        return outputs.filter(o => !o.serverId);
      }
      return outputs.filter(o => o.serverId === primaryServerId || o.serverId === undefined);
    }
    if (activeOutputServerId === 'general') {
      return outputs.filter(o => !o.serverId);
    }
    if (activeOutputServerId === null) {
      return [];
    }
    return outputs.filter(o => o.serverId === activeOutputServerId);
  }, [outputs, activeOutputServerId, isNodeRefSpace, primaryServerId]);

  useEffect(() => {
    if (!availableOutputTabs.length) {
      setActiveOutputServerId(null);
      return;
    }
    if (!isNodeRefSpace) {
      setActiveOutputServerId(availableOutputTabs[0]);
      return;
    }
    if (activeOutputServerId === null || !availableOutputTabs.includes(activeOutputServerId)) {
      setActiveOutputServerId(availableOutputTabs[0]);
    }
  }, [availableOutputTabs, activeOutputServerId, isNodeRefSpace, setActiveOutputServerId]);

  const [viewResultModal, setViewResultModal] = useState<{
    output?: string | null;
    error?: string | null;
  } | null>(null);
  const [openedAccordion, setOpenedAccordion] = useState<string | null>(history[0]?.id || null);
  const consoleContainerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // Track the first history item ID to detect new executions
  const firstHistoryIdRef = useRef<string | null>(null);

  // Update opened accordion only when a NEW execution happens (first item changes)
  useEffect(() => {
    const currentFirstId = history[0]?.id || null;

    // Only update if the first item actually changed (new execution)
    if (currentFirstId && currentFirstId !== firstHistoryIdRef.current) {
      firstHistoryIdRef.current = currentFirstId;
      setOpenedAccordion(currentFirstId);
    }

    // Initialize ref on first load
    if (!firstHistoryIdRef.current && currentFirstId) {
      firstHistoryIdRef.current = currentFirstId;
    }
  }, [history]);

  // Load more history items
  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreRef.current || !historyHasMore || historyLoading) {
      return;
    }

    loadingMoreRef.current = true;
    try {
      const { rpc } = await import('@/core/ipc/rpc');
      const historyNextCursor = useJsConsoleStore.getState().historyNextCursor;
      const appendHistory = useJsConsoleStore.getState().appendHistory;
      const setHistoryLoading = useJsConsoleStore.getState().setHistoryLoading;

      setHistoryLoading(true);
      const response = await rpc<{ items: any[]; hasMore: boolean; nextCursor: number | null }>(
        'backend.jsconsole.getHistory',
        {
          serverId: historyServerId,
          limit: 25,
          cursor: historyNextCursor ?? undefined,
        }
      );

      const historyItems = response.items.map((item: any) => ({
        id: String(item.id),
        timestamp: new Date(item.executedAt),
        code: item.script,
        serverId: item.serverId,
        output: item.output,
        error: item.error,
      }));

      appendHistory(historyItems, response.hasMore, response.nextCursor);
    } catch (error) {
      console.error('Failed to load more history:', error);
    } finally {
      loadingMoreRef.current = false;
      useJsConsoleStore.getState().setHistoryLoading(false);
    }
  }, [historyHasMore, historyLoading, historyServerId]);

  // Handle scroll for infinite loading
  useEffect(() => {
    if (activeTab !== 'history') {
      return;
    }

    const setupScrollListener = () => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return null;
      }

      if (!historyHasMore) {
        return null;
      }

      const handleScroll = () => {
        const currentViewport = viewportRef.current;
        if (!currentViewport || !historyHasMore || historyLoading || loadingMoreRef.current) {
          return;
        }

        const { scrollTop, scrollHeight, clientHeight } = currentViewport;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Load more when user scrolls within 100px of the bottom
        if (distanceFromBottom < 100) {
          void loadMoreHistory();
        }
      };

      viewport.addEventListener('scroll', handleScroll);

      return () => {
        viewport.removeEventListener('scroll', handleScroll);
      };
    };

    // Try to set up listener with retries
    let cleanup = setupScrollListener();

    // If viewport not found, try again with increasing delays
    if (!cleanup) {
      const timeouts: ReturnType<typeof setTimeout>[] = [];

      // Try multiple times with delays: 50ms, 150ms, 300ms, 500ms
      [50, 150, 300, 500].forEach(delay => {
        const timeoutId = setTimeout(() => {
          if (!cleanup) {
            cleanup = setupScrollListener();
          }
        }, delay);
        timeouts.push(timeoutId);
      });

      return () => {
        timeouts.forEach(clearTimeout);
        if (cleanup) cleanup();
      };
    }

    return cleanup;
  }, [activeTab, historyHasMore, historyLoading, loadMoreHistory]);

  useEffect(() => {
    const container = consoleContainerRef.current;
    if (!container) return;

    const isNodeWithinContainer = (node: Node | null | undefined): boolean => {
      if (!node || !container) return false;
      const resolvedNode =
        node.nodeType === Node.TEXT_NODE ? (node.parentElement ?? node.parentNode) : node;
      if (!resolvedNode) return false;
      return resolvedNode === container || container.contains(resolvedNode);
    };

    const getSelectedText = (): string => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return '';
      }
      const anchorInside = isNodeWithinContainer(selection.anchorNode ?? undefined);
      const focusInside = isNodeWithinContainer(selection.focusNode ?? undefined);
      if (!anchorInside && !focusInside) {
        return '';
      }
      return selection.toString();
    };

    const writeClipboardText = async (text: string, event?: ClipboardEvent): Promise<boolean> => {
      if (!text) return false;

      const stopEvent = () => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      if (event?.clipboardData) {
        event.clipboardData.setData('text/plain', text);
        stopEvent();
        return true;
      }

      if (isNeutralinoMode()) {
        try {
          await ensureNeutralinoReady();
          await clipboard.writeText(text);
          stopEvent();
          return true;
        } catch (error) {
          console.error('Neutralino clipboard write failed:', error);
        }
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          stopEvent();
          return true;
        } catch {
          // Ignore
        }
      }

      return false;
    };

    const handleCopy = async (event: ClipboardEvent) => {
      const text = getSelectedText();
      if (!text) return;
      const success = await writeClipboardText(text, event);
      if (success) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'c') return;

      const text = getSelectedText();
      if (!text) return;

      const success = await writeClipboardText(text);
      if (success) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const getOutputColor = (type: 'result' | 'error' | 'log') => {
    switch (type) {
      case 'error':
        return 'red';
      case 'log':
        return 'blue';
      case 'result':
        return 'green';
      default:
        return 'gray';
    }
  };

  const tabValueRaw =
    activeTab === 'history'
      ? 'history'
      : isNodeRefSpace
        ? activeOutputServerId === null
          ? 'none'
          : String(activeOutputServerId)
        : 'output';
  const tabValue =
    isNodeRefSpace && availableOutputTabs.length === 0 && tabValueRaw !== 'history'
      ? 'history'
      : tabValueRaw;

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    if (value === 'history') {
      setActiveTab('history');
      return;
    }
    setActiveTab('output');
    if (value === 'general') {
      setActiveOutputServerId('general');
      return;
    }
    if (value === 'output') {
      setActiveOutputServerId(primaryServerId);
      return;
    }
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      setActiveOutputServerId(parsed);
    }
  };

  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = colorScheme === 'dark';
  const outputPaperBackground = isDark
    ? 'var(--mantine-color-dark-6)'
    : 'var(--mantine-color-gray-0)';
  const outputPaperBorder = isDark
    ? '1px solid var(--mantine-color-dark-4)'
    : '1px solid var(--mantine-color-gray-3)';
  const codeBackground = isDark ? 'var(--mantine-color-dark-7)' : undefined;

  return (
    <Box
      ref={consoleContainerRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <Box p={0} style={{ backgroundColor: 'var(--mantine-color-body)' }}>
          <Tabs.List>
            {isNodeRefSpace ? (
              availableOutputTabs.map(tabId => {
                const label =
                  tabId === 'general'
                    ? t('generalTab')
                    : (servers.find(s => s.id === tabId)?.name ??
                      t('serverFallback', { id: tabId }));
                return (
                  <Tabs.Tab
                    key={tabId}
                    value={String(tabId)}
                    leftSection={<IconCode size={18} />}
                    px="lg"
                  >
                    {label}
                  </Tabs.Tab>
                );
              })
            ) : (
              <Tabs.Tab value="output" leftSection={<IconCode size={18} />} px="lg">
                {t('outputTab')}
              </Tabs.Tab>
            )}
            <Tabs.Tab value="history" leftSection={<IconClock size={18} />} px="lg">
              {t('historyTab')}
            </Tabs.Tab>
          </Tabs.List>
        </Box>

        <Tabs.Panel
          value={tabValue === 'history' ? 'history' : tabValue}
          style={{ flex: 1, overflow: 'hidden' }}
        >
          {tabValue === 'history' ? (
            <ScrollArea h="100%" p="md" viewportRef={viewportRef}>
              {history.length === 0 && !historyLoading ? (
                <Text c="dimmed" size="sm" ta="center" mt="xl">
                  {t('historyEmpty')}
                </Text>
              ) : (
                <>
                  <Accordion
                    value={openedAccordion}
                    onChange={setOpenedAccordion}
                    variant="separated"
                  >
                    {history.map(item => (
                      <Accordion.Item key={item.id} value={item.id}>
                        <Box pos="relative">
                          <Accordion.Control>
                            <Box>
                              <Text size="xs" c="dimmed" mb={openedAccordion === item.id ? 0 : 4}>
                                {formatRelativeTime(item.timestamp)}
                              </Text>
                              {openedAccordion !== item.id && (
                                <Text
                                  size="sm"
                                  c="dimmed"
                                  style={{
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: 'calc(100% - 100px)', // Leave space for action buttons
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {item.code.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()}
                                </Text>
                              )}
                            </Box>
                          </Accordion.Control>
                          <Group
                            gap="xs"
                            pos="absolute"
                            top="50%"
                            right="40px"
                            style={{
                              transform: 'translateY(-50%)',
                              zIndex: 1,
                              pointerEvents: 'all',
                            }}
                          >
                            <Tooltip label={t('historyCopyToEditor')} position="left" withArrow>
                              <ActionIcon
                                variant="light"
                                color="blue"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  loadHistoryItem(item.id);
                                }}
                              >
                                <IconCopy size={16} />
                              </ActionIcon>
                            </Tooltip>
                            {(item.output || item.error) && (
                              <Tooltip label={t('historyViewResult')} position="left" withArrow>
                                <ActionIcon
                                  variant="light"
                                  color={item.error ? 'red' : 'green'}
                                  size="sm"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setViewResultModal({
                                      output: item.output,
                                      error: item.error,
                                    });
                                  }}
                                >
                                  {item.error ? (
                                    <IconAlertCircle size={16} />
                                  ) : (
                                    <IconCheck size={16} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Box>
                        <Accordion.Panel>
                          <Code
                            block
                            style={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: '300px',
                              overflow: 'auto',
                              border: 'none',
                            }}
                          >
                            {item.code}
                          </Code>
                        </Accordion.Panel>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                  {historyLoading && history.length > 0 && (
                    <Box ta="center" py="md">
                      <Loader size="sm" />
                    </Box>
                  )}
                </>
              )}
            </ScrollArea>
          ) : (
            <ScrollArea h="100%" p="md">
              {isExecuting && (
                <Paper p="md" mb="sm" withBorder>
                  <Group gap="sm">
                    <IconLoader size={20} className="rotating" />
                    <Text size="sm" c="dimmed">
                      Executing...
                    </Text>
                  </Group>
                </Paper>
              )}

              {activeOutputs.length === 0 && !isExecuting ? (
                <Text c="dimmed" size="sm" ta="center" mt="xl">
                  No output yet. Execute some code to see results here.
                </Text>
              ) : (
                <Stack gap="sm">
                  {[...activeOutputs].reverse().map(output => {
                    const isAiMessage =
                      output.type === 'log' &&
                      (output.content.includes('AI is generating') ||
                        output.content.includes('AI inserted') ||
                        output.content.includes('AI request failed'));

                    return (
                      <Paper
                        key={output.id}
                        p="md"
                        mb="sm"
                        style={{
                          backgroundColor: outputPaperBackground,
                          border: outputPaperBorder,
                        }}
                      >
                        <Group justify="space-between" mb="xs">
                          {isAiMessage ? (
                            <Group gap="xs">
                              <IconRobot size={18} color="var(--mantine-color-blue-6)" />
                              <Text size="sm" fw={500} c="blue">
                                AI
                              </Text>
                            </Group>
                          ) : (
                            <Badge color={getOutputColor(output.type)} variant="light" size="sm">
                              {output.type}
                            </Badge>
                          )}
                          <Text size="xs" c="dimmed">
                            {formatRelativeTime(output.timestamp)}
                          </Text>
                        </Group>
                        <Code
                          block
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            border: 'none',
                            backgroundColor: codeBackground,
                          }}
                        >
                          {output.content}
                        </Code>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </ScrollArea>
          )}
        </Tabs.Panel>

        <Modal
          opened={viewResultModal !== null}
          onClose={() => setViewResultModal(null)}
          title={viewResultModal?.error ? 'Execution Error' : 'Execution Result'}
          size="xl"
        >
          {viewResultModal?.error ? (
            <Box>
              <Badge color="red" variant="light" mb="sm">
                Error
              </Badge>
              <Code
                block
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  backgroundColor: 'var(--mantine-color-red-0)',
                }}
              >
                {viewResultModal.error}
              </Code>
            </Box>
          ) : viewResultModal?.output ? (
            <Box>
              <Badge color="green" variant="light" mb="sm">
                Output
              </Badge>
              <Code
                block
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {viewResultModal.output}
              </Code>
            </Box>
          ) : (
            <Text c="dimmed" size="sm">
              No output from this execution.
            </Text>
          )}
        </Modal>

        <style>
          {`
          @keyframes rotate {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          .rotating {
            animation: rotate 1s linear infinite;
          }
        `}
        </style>
      </Tabs>
    </Box>
  );
}
