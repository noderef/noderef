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

import { backendRpc, type AgentMentionSuggestion, type AgentMessage } from '@/core/ipc/backend';
import { useAgentStore } from '@/core/store/agent';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlayerStop, IconSend } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);

const formatActivityType = (value: string): string =>
  value
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .trim();

const getActivityLevelColor = (level: 'debug' | 'info' | 'warn' | 'error'): string => {
  if (level === 'error') return 'red';
  if (level === 'warn') return 'orange';
  if (level === 'debug') return 'gray';
  return 'blue';
};

const extractMentionQuery = (value: string, caret: number): string | null => {
  const left = value.slice(0, caret);
  const match = left.match(/(?:^|\s)@([a-zA-Z0-9._-]{1,64})$/);
  return match?.[1] || null;
};

type ConversationTimelineItem =
  | {
      kind: 'message';
      id: number;
      createdAt: string | Date;
      message: AgentMessage;
    }
  | {
      kind: 'activity';
      id: number;
      createdAt: string | Date;
      runId: number;
      type: string;
      level: 'debug' | 'info' | 'warn' | 'error';
    };

export function AgentPage() {
  const { t } = useTranslation('agent');
  const { activeServerId } = useNavigation();
  const servers = useServersStore(state => state.servers);

  const chats = useAgentStore(state => state.chats);
  const activeChatId = useAgentStore(state => state.activeChatId);
  const messagesByChat = useAgentStore(state => state.messagesByChat);
  const runsByChat = useAgentStore(state => state.runsByChat);
  const eventsByRun = useAgentStore(state => state.eventsByRun);
  const setChats = useAgentStore(state => state.setChats);
  const setMessages = useAgentStore(state => state.setMessages);
  const addMessage = useAgentStore(state => state.addMessage);
  const setRuns = useAgentStore(state => state.setRuns);
  const upsertRun = useAgentStore(state => state.upsertRun);
  const appendRunEvents = useAgentStore(state => state.appendRunEvents);

  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<
    Array<{ id: string; type: 'node' | 'person' | 'group' | 'server'; label: string; path?: string | null }>
  >([]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [debouncedMentionQuery] = useDebouncedValue(mentionQuery, 250);
  const [mentionItems, setMentionItems] = useState<AgentMentionSuggestion[]>([]);
  const [mentionSkipCount, setMentionSkipCount] = useState(0);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<number>(0);
  const conversationViewportRef = useRef<HTMLDivElement | null>(null);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const activeMessages = useMemo(
    () => (activeChatId ? messagesByChat[activeChatId] || [] : []),
    [messagesByChat, activeChatId]
  );

  const activeRuns = useMemo(
    () => (activeChatId ? runsByChat[activeChatId] || [] : []),
    [runsByChat, activeChatId]
  );

  const pendingConfirmation = useMemo(
    () => activeRuns.find(run => run.status === 'waiting_confirmation' && run.pendingStep),
    [activeRuns]
  );

  const thinkingRunIds = useMemo(
    () =>
      activeRuns
        .filter(run => run.status === 'queued' || run.status === 'running')
        .map(run => run.id),
    [activeRuns]
  );

  const conversationTimeline = useMemo<ConversationTimelineItem[]>(() => {
    const messageItems: ConversationTimelineItem[] = activeMessages.map(message => ({
      kind: 'message',
      id: message.id,
      createdAt: message.createdAt,
      message,
    }));

    const activityItems: ConversationTimelineItem[] = activeRuns.flatMap(run =>
      (eventsByRun[run.id] || []).map(event => ({
        kind: 'activity',
        id: event.id,
        createdAt: event.createdAt,
        runId: run.id,
        type: event.type,
        level: event.level,
      }))
    );

    return [...messageItems, ...activityItems]
      .sort((left, right) => {
        const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }
        if (left.kind !== right.kind) {
          return left.kind === 'activity' ? -1 : 1;
        }
        return left.id - right.id;
      })
      .slice(-400);
  }, [activeMessages, activeRuns, eventsByRun]);

  const loadChats = useCallback(async () => {
    try {
      const result = await backendRpc.agent.listChats({
        serverId: activeServerId || undefined,
        skipCount: 0,
        maxItems: 100,
      });
      setChats(result.items);
    } catch (error) {
      notifications.show({
        title: t('errors.loadChatsTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  }, [activeServerId, setChats, t]);

  const loadConversation = useCallback(
    async (chatId: number) => {
      setLoadingConversation(true);
      try {
        const [messages, runsPage] = await Promise.all([
          backendRpc.agent.listMessages({ chatId, maxItems: 200 }),
          backendRpc.agent.listRuns({ chatId, maxItems: 100, skipCount: 0 }),
        ]);

        setMessages(chatId, messages);
        setRuns(chatId, runsPage.items);

        await Promise.all(
          runsPage.items.map(async run => {
            const events = await backendRpc.agent.listRunEvents({ runId: run.id, maxItems: 200 });
            appendRunEvents(run.id, events);
          })
        );
      } catch (error) {
        notifications.show({
          title: t('errors.loadConversationTitle'),
          message: error instanceof Error ? error.message : t('errors.generic'),
          color: 'red',
        });
      } finally {
        setLoadingConversation(false);
      }
    },
    [appendRunEvents, setMessages, setRuns, t]
  );

  const pollActiveChat = useCallback(async () => {
    const chatId = useAgentStore.getState().activeChatId;
    if (!chatId) {
      return;
    }

    try {
      const [messages, runsPage] = await Promise.all([
        backendRpc.agent.listMessages({ chatId, maxItems: 200 }),
        backendRpc.agent.listRuns({ chatId, maxItems: 100, skipCount: 0 }),
      ]);

      useAgentStore.getState().setMessages(chatId, messages);
      useAgentStore.getState().setRuns(chatId, runsPage.items);

      for (const run of runsPage.items) {
        const existingEvents = useAgentStore.getState().eventsByRun[run.id] || [];
        const afterId = existingEvents.length ? existingEvents[existingEvents.length - 1].id : undefined;
        const events = await backendRpc.agent.listRunEvents({ runId: run.id, afterId, maxItems: 200 });
        useAgentStore.getState().appendRunEvents(run.id, events);
      }
    } catch {
      // polling should not spam notifications
    }
  }, []);

  const loadMentions = useCallback(
    async (query: string, reset: boolean) => {
      const serverId = activeChat?.serverId || activeServerId || servers[0]?.id;
      if (!serverId) {
        setMentionItems([]);
        setMentionHasMore(false);
        return;
      }

      const skipCount = reset ? 0 : mentionSkipCount;
      setMentionLoading(true);

      try {
        const result = await backendRpc.agent.searchMentions({
          serverId,
          query,
          skipCount,
          maxItems: 10,
        });

        setMentionItems(prev => (reset ? result.items : [...prev, ...result.items]));
        setMentionSkipCount(skipCount + result.items.length);
        setMentionHasMore(result.pagination.hasMoreItems);
      } finally {
        setMentionLoading(false);
      }
    },
    [activeChat?.serverId, activeServerId, mentionSkipCount, servers]
  );

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    void loadConversation(activeChatId);
  }, [activeChatId, loadConversation]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    const interval = setInterval(() => {
      void pollActiveChat();
    }, 1500);

    return () => clearInterval(interval);
  }, [activeChatId, pollActiveChat]);

  useEffect(() => {
    if (!debouncedMentionQuery) {
      setMentionItems([]);
      setMentionSkipCount(0);
      setMentionHasMore(false);
      return;
    }

    setMentionSkipCount(0);
    void loadMentions(debouncedMentionQuery, true);
  }, [debouncedMentionQuery, loadMentions]);

  useEffect(() => {
    if (!pendingConfirmation) {
      setConfirmationText('');
    }
  }, [pendingConfirmation]);

  useEffect(() => {
    const viewport = conversationViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [activeChatId, conversationTimeline.length]);

  const handleDraftChange = (value: string) => {
    setDraft(value);
    const textarea = textAreaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    caretRef.current = caret;
    const query = extractMentionQuery(value, caret);
    setMentionQuery(query);
  };

  const handleInsertMention = (item: AgentMentionSuggestion) => {
    const caret = caretRef.current;
    const left = draft.slice(0, caret);
    const right = draft.slice(caret);
    const replacedLeft = left.replace(/@([a-zA-Z0-9._-]{1,64})$/, `@${item.label} `);
    const next = `${replacedLeft}${right}`;

    setDraft(next);
    setMentionQuery(null);
    setMentionItems([]);
    setMentionSkipCount(0);
    setMentionHasMore(false);
    setSelectedMentions(prev => {
      const exists = prev.some(mention => mention.id === item.id && mention.type === item.type);
      if (exists) {
        return prev;
      }
      return [
        ...prev,
        {
          id: item.id,
          type: item.type,
          label: item.label,
          path: item.path ?? null,
        },
      ];
    });

    setTimeout(() => {
      const textarea = textAreaRef.current;
      if (!textarea) {
        return;
      }
      const position = replacedLeft.length;
      textarea.focus();
      textarea.setSelectionRange(position, position);
      caretRef.current = position;
    }, 0);
  };

  const handleSend = async () => {
    if (!activeChatId || !draft.trim()) {
      return;
    }

    setSending(true);
    try {
      const response = await backendRpc.agent.sendMessage({
        chatId: activeChatId,
        content: draft.trim(),
        mentions: selectedMentions,
      });

      addMessage(activeChatId, response.message);
      upsertRun(activeChatId, response.run);

      setDraft('');
      setSelectedMentions([]);
      setMentionQuery(null);
      setMentionItems([]);
      setMentionSkipCount(0);
      setMentionHasMore(false);

      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.sendMessageTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    } finally {
      setSending(false);
    }
  };

  const handleCancelRun = async (runId: number) => {
    try {
      await backendRpc.agent.cancelRun(runId);
      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.cancelRunTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  const handleConfirmPendingStep = async (approved: boolean) => {
    if (!pendingConfirmation?.pendingStep) {
      return;
    }

    try {
      await backendRpc.agent.confirmStep({
        runId: pendingConfirmation.id,
        stepId: pendingConfirmation.pendingStep.id,
        confirmationToken: pendingConfirmation.pendingStep.confirmationToken || '',
        approved,
        confirmationText,
      });

      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.confirmationTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  return (
    <Box
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--mantine-spacing-md)',
      }}
    >
      {!activeChatId ? (
        <Paper withBorder p="lg">
          <Text c="dimmed">{t('noChatSelected')}</Text>
        </Paper>
      ) : (
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateRows: 'minmax(0, 1fr) auto',
            rowGap: 'var(--mantine-spacing-sm)',
          }}
        >
          <Box
            ref={conversationViewportRef}
            style={{
              minHeight: 0,
              height: '100%',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Stack gap="xs" pr="sm" style={{ marginTop: 'auto' }}>
              {loadingConversation && (
                <Group justify="center" py={2}>
                  <Loader size="xs" />
                </Group>
              )}

              {conversationTimeline.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noMessages')}
                </Text>
              ) : (
                <>
                  {conversationTimeline.map(item => {
                    if (item.kind === 'activity') {
                      return (
                        <Group key={`activity-${item.id}`} wrap="nowrap" px={4}>
                          <Group gap={6} wrap="nowrap">
                            <Badge
                              size="xs"
                              variant="dot"
                              color={getActivityLevelColor(item.level)}
                              style={{ textTransform: 'none' }}
                            >
                              #{item.runId}
                            </Badge>
                            <Text size="xs" c="dimmed">
                              {formatActivityType(item.type)}
                            </Text>
                          </Group>
                        </Group>
                      );
                    }

                    const { message } = item;
                    const isUserMessage = message.role === 'user';
                    const isSystemMessage = message.role === 'system';

                    if (message.role === 'assistant') {
                      return (
                        <Box key={`message-${message.id}`} py={2}>
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {message.content}
                          </Text>
                        </Box>
                      );
                    }

                    return (
                      <Group key={`message-${message.id}`} justify={isUserMessage ? 'flex-end' : 'flex-start'}>
                        <Paper
                          p="sm"
                          withBorder
                          bg={isUserMessage ? 'blue.0' : isSystemMessage ? 'yellow.0' : undefined}
                          style={{ maxWidth: '72%', width: 'fit-content' }}
                        >
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {message.content}
                          </Text>
                        </Paper>
                      </Group>
                    );
                  })}

                  {(sending || thinkingRunIds.length > 0) && (
                    <Group gap="xs" wrap="nowrap" px={4} py={2}>
                      <Loader size="xs" />
                      <Text size="sm" c="dimmed">
                        {t('thinking')}
                      </Text>
                    </Group>
                  )}
                </>
              )}
            </Stack>
          </Box>

          <Stack
            gap="xs"
            style={{
              position: 'sticky',
              bottom: 0,
              background: 'var(--mantine-color-body)',
              paddingTop: 'var(--mantine-spacing-xs)',
            }}
          >
            {pendingConfirmation?.pendingStep && (
              <Paper withBorder p="sm" bg="orange.0">
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {t('confirmationRequired')}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {pendingConfirmation.pendingStep.summary || t('confirmationDescription')}
                  </Text>
                  {pendingConfirmation.pendingStep.operation === 'delete' && (
                    <TextInput
                      value={confirmationText}
                      onChange={event => setConfirmationText(event.currentTarget.value)}
                      placeholder={t('typeDelete')}
                      size="xs"
                    />
                  )}
                  <Group gap="xs">
                    <Button size="xs" color="red" onClick={() => void handleConfirmPendingStep(true)}>
                      {t('confirm')}
                    </Button>
                    <Button size="xs" variant="default" onClick={() => void handleConfirmPendingStep(false)}>
                      {t('reject')}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}

            {!!selectedMentions.length && (
              <Group gap="xs">
                {selectedMentions.map(item => (
                  <Badge key={`${item.type}-${item.id}`} variant="light">
                    @{item.label}
                  </Badge>
                ))}
              </Group>
            )}

            <Box style={{ position: 'relative' }}>
              <Textarea
                ref={textAreaRef}
                minRows={3}
                maxRows={8}
                value={draft}
                onChange={event => handleDraftChange(event.currentTarget.value)}
                onSelect={event => {
                  caretRef.current = event.currentTarget.selectionStart || 0;
                }}
                placeholder={t('composerPlaceholder')}
                autosize
                styles={{
                  input: {
                    paddingRight: '84px',
                    paddingBottom: '12px',
                  },
                }}
              />

              <Button
                size="xs"
                style={{ position: 'absolute', right: 8, bottom: 8 }}
                rightSection={<IconSend size={14} />}
                onClick={() => void handleSend()}
                loading={sending}
                disabled={!draft.trim()}
              >
                {t('send')}
              </Button>

              {mentionQuery && (mentionItems.length > 0 || mentionLoading) && (
                <Paper
                  withBorder
                  shadow="sm"
                  p="xs"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 'calc(100% + 6px)',
                    zIndex: 20,
                    maxHeight: 220,
                    overflow: 'auto',
                  }}
                >
                  <Stack gap={4}>
                    {mentionItems.map(item => (
                      <Button
                        key={`${item.type}-${item.id}`}
                        variant="subtle"
                        justify="start"
                        size="xs"
                        onClick={() => handleInsertMention(item)}
                      >
                        <Group justify="space-between" style={{ width: '100%' }}>
                          <Text size="sm">@{item.label}</Text>
                          <Text size="xs" c="dimmed">
                            {item.type}
                          </Text>
                        </Group>
                      </Button>
                    ))}

                    {mentionLoading && (
                      <Group justify="center" py={4}>
                        <Loader size="xs" />
                      </Group>
                    )}

                    {mentionHasMore && !mentionLoading && mentionQuery && (
                      <Button size="xs" variant="light" onClick={() => void loadMentions(mentionQuery, false)}>
                        {t('loadMoreMentions')}
                      </Button>
                    )}
                  </Stack>
                </Paper>
              )}
            </Box>

            <Group justify="space-between" align="flex-start">
              <Text size="xs" c="dimmed">
                {t('mentionsHint')}
              </Text>

              <Group gap="xs" justify="flex-end" wrap="wrap">
                {activeRuns
                  .filter(run => ACTIVE_RUN_STATUSES.has(run.status))
                  .map(run => (
                    <Button
                      key={run.id}
                      variant="subtle"
                      color="red"
                      size="xs"
                      leftSection={<IconPlayerStop size={14} />}
                      onClick={() => void handleCancelRun(run.id)}
                    >
                      {t('cancelRun', { id: run.id })}
                    </Button>
                  ))}
              </Group>
            </Group>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default AgentPage;
