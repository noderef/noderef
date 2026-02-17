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
  backendRpc,
  type AgentMentionSuggestion,
  type AgentMessage,
  type AgentRunEvent,
  type AgentRunSummary,
} from '@/core/ipc/backend';
import {
  getAiSettings,
  listAiModels,
  listAiProviders,
} from '@/core/ipc/aiSettings';
import { useAgentStore } from '@/core/store/agent';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import {
  Accordion,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconPlayerStop, IconSend } from '@tabler/icons-react';
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
      kind: 'run';
      id: number;
      createdAt: string | Date;
      run: AgentRunSummary;
    };

interface AiProviderOption {
  value: string;
  label: string;
  defaultModel: string;
}

interface AiModelChoice {
  value: string;
  label: string;
  provider: string;
  model: string;
}

const AGENT_MODEL_SELECTION_STORAGE_KEY = 'agent.selected.model.v1';

const MODEL_SELECTION_GLOBAL_SCOPE = 'global';

const readModelSelectionStore = (): Record<string, { provider: string; model: string }> => {
  try {
    const raw = window.localStorage.getItem(AGENT_MODEL_SELECTION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const legacyProvider = (parsed as { provider?: unknown }).provider;
    const legacyModel = (parsed as { model?: unknown }).model;
    if (typeof legacyProvider === 'string' && typeof legacyModel === 'string') {
      return {
        [MODEL_SELECTION_GLOBAL_SCOPE]: {
          provider: legacyProvider,
          model: legacyModel,
        },
      };
    }

    const result: Record<string, { provider: string; model: string }> = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const provider = (value as { provider?: unknown }).provider;
      const model = (value as { model?: unknown }).model;
      if (typeof provider === 'string' && typeof model === 'string') {
        result[scope] = { provider, model };
      }
    }

    return result;
  } catch {
    return {};
  }
};

const buildModelSelectionScopes = (serverId: number | null, chatId: number | null): string[] => {
  const scopes: string[] = [];
  if (serverId !== null && chatId !== null) {
    scopes.push(`server:${serverId}:chat:${chatId}`);
  }
  if (serverId !== null) {
    scopes.push(`server:${serverId}`);
  }
  scopes.push(MODEL_SELECTION_GLOBAL_SCOPE);
  return scopes;
};

const readStoredModelSelection = (
  serverId: number | null,
  chatId: number | null
): { provider: string; model: string } | null => {
  const store = readModelSelectionStore();
  for (const scope of buildModelSelectionScopes(serverId, chatId)) {
    const match = store[scope];
    if (match) {
      return match;
    }
  }
  return null;
};

const writeStoredModelSelection = (
  serverId: number | null,
  chatId: number | null,
  provider: string,
  model: string
) => {
  try {
    const nextStore = readModelSelectionStore();

    if (serverId !== null && chatId !== null) {
      nextStore[`server:${serverId}:chat:${chatId}`] = { provider, model };
    }
    if (serverId !== null) {
      nextStore[`server:${serverId}`] = { provider, model };
    }
    if (serverId === null && chatId === null) {
      nextStore[MODEL_SELECTION_GLOBAL_SCOPE] = { provider, model };
    }

    window.localStorage.setItem(
      AGENT_MODEL_SELECTION_STORAGE_KEY,
      JSON.stringify(nextStore)
    );
  } catch {
    // ignore storage failures
  }
};

const toPayloadSnippet = (value: Record<string, unknown> | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    const raw = JSON.stringify(value, null, 2);
    if (raw.length <= 1400) {
      return raw;
    }
    return `${raw.slice(0, 1400)}\n...`;
  } catch {
    return null;
  }
};

const eventProgressText = (event: AgentRunEvent): string =>
  (event.payload?.progressMessage as string | undefined) || formatActivityType(event.type);

const deriveStepStatus = (eventType: string): string => {
  if (eventType.startsWith('step.')) {
    return formatActivityType(eventType.replace(/^step\./, ''));
  }
  return formatActivityType(eventType);
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
  const [aiModelOptions, setAiModelOptions] = useState<AiModelChoice[]>([]);
  const [selectedAiModelOption, setSelectedAiModelOption] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [defaultAiSelection, setDefaultAiSelection] = useState<{
    provider: string | null;
    model: string | null;
  }>({
    provider: null,
    model: null,
  });
  const [aiModelsLoading, setAiModelsLoading] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<number>(0);
  const conversationViewportRef = useRef<HTMLDivElement | null>(null);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) || null,
    [chats, activeChatId]
  );
  const modelSelectionServerId = activeChat?.serverId || activeServerId || null;

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
    const sortedMessages = activeMessages
      .map(message => ({
        kind: 'message' as const,
        id: message.id,
        createdAt: message.createdAt,
        message,
      }))
      .sort((left, right) => {
        const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return left.id - right.id;
      });

    const messageIds = new Set(sortedMessages.map(item => item.message.id));
    const runsByTriggerMessage = new Map<number, AgentRunSummary[]>();
    const orphanRuns: AgentRunSummary[] = [];

    for (const run of activeRuns) {
      if (run.triggerMessageId && messageIds.has(run.triggerMessageId)) {
        const current = runsByTriggerMessage.get(run.triggerMessageId) || [];
        current.push(run);
        runsByTriggerMessage.set(run.triggerMessageId, current);
      } else {
        orphanRuns.push(run);
      }
    }

    for (const [triggerMessageId, runs] of runsByTriggerMessage) {
      runsByTriggerMessage.set(
        triggerMessageId,
        [...runs].sort((left, right) => {
          const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
          if (timeDiff !== 0) {
            return timeDiff;
          }
          return left.id - right.id;
        })
      );
    }

    const timeline: ConversationTimelineItem[] = [];
    for (const messageItem of sortedMessages) {
      timeline.push(messageItem);
      const runsForMessage = runsByTriggerMessage.get(messageItem.message.id) || [];
      for (const run of runsForMessage) {
        timeline.push({
          kind: 'run',
          id: run.id,
          createdAt: run.createdAt,
          run,
        });
      }
    }

    const sortedOrphans = [...orphanRuns].sort((left, right) => {
      const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return left.id - right.id;
    });

    for (const run of sortedOrphans) {
      timeline.push({
        kind: 'run',
        id: run.id,
        createdAt: run.createdAt,
        run,
      });
    }

    return timeline.slice(-500);
  }, [activeMessages, activeRuns]);

  const totalRunEventCount = useMemo(
    () => activeRuns.reduce((sum, run) => sum + (eventsByRun[run.id]?.length || 0), 0),
    [activeRuns, eventsByRun]
  );

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
    let cancelled = false;

    const loadAiOptions = async () => {
      setAiModelsLoading(true);
      try {
        const [providerCatalog, currentSettings] = await Promise.all([
          listAiProviders(),
          getAiSettings(),
        ]);

        if (cancelled) {
          return;
        }

        const configuredProviders: AiProviderOption[] = (providerCatalog.providers || [])
          .filter(provider => provider.hasToken)
          .map(provider => ({
            value: provider.id,
            label: provider.label,
            defaultModel: provider.defaultModel,
          }));

        if (!configuredProviders.length) {
          setAiModelOptions([]);
          setSelectedAiModelOption(null);
          setAiProvider(null);
          setAiModel(null);
          return;
        }

        const optionGroups = await Promise.all(
          configuredProviders.map(async provider => {
            const remote = await listAiModels({ provider: provider.value }).catch(() => null);
            const models =
              remote?.models?.length
                ? remote.models
                : [{ id: provider.defaultModel, displayName: provider.defaultModel }];
            return models.map(model => ({
              value: `${provider.value}::${model.id}`,
              label: `${provider.label} · ${model.displayName || model.id}`,
              provider: provider.value,
              model: model.id,
            }));
          })
        );

        if (cancelled) {
          return;
        }

        const options = optionGroups.flat();
        setAiModelOptions(options);
        setDefaultAiSelection({
          provider: currentSettings.provider ?? null,
          model: currentSettings.model ?? null,
        });

        if (!options.length) {
          setSelectedAiModelOption(null);
          setAiProvider(null);
          setAiModel(null);
          return;
        }

      } catch {
        // keep composer functional without model selector data
      } finally {
        if (!cancelled) {
          setAiModelsLoading(false);
        }
      }
    };

    void loadAiOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aiModelOptions.length) {
      return;
    }

    const stored = readStoredModelSelection(modelSelectionServerId, activeChatId);
    const storedValue = stored ? `${stored.provider}::${stored.model}` : null;
    const configuredValue =
      defaultAiSelection.provider && defaultAiSelection.model
        ? `${defaultAiSelection.provider}::${defaultAiSelection.model}`
        : null;

    const selectedValue =
      [storedValue, configuredValue, aiModelOptions[0].value].find(value =>
        Boolean(value && aiModelOptions.some(option => option.value === value))
      ) || aiModelOptions[0].value;
    const selected = aiModelOptions.find(option => option.value === selectedValue) || aiModelOptions[0];

    setSelectedAiModelOption(selected.value);
    setAiProvider(selected.provider);
    setAiModel(selected.model);
  }, [
    aiModelOptions,
    activeChatId,
    modelSelectionServerId,
    defaultAiSelection.provider,
    defaultAiSelection.model,
  ]);

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
  }, [activeChatId, conversationTimeline.length, totalRunEventCount, thinkingRunIds.length]);

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
        aiProvider: aiProvider || undefined,
        aiModel: aiModel || undefined,
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
                    if (item.kind === 'run') {
                      const run = item.run;
                      const runEvents = (eventsByRun[run.id] || []).slice().sort((left, right) => left.id - right.id);

                      const stepEventsMap = new Map<number, AgentRunEvent[]>();
                      for (const event of runEvents) {
                        if (!event.stepId) {
                          continue;
                        }
                        const current = stepEventsMap.get(event.stepId) || [];
                        current.push(event);
                        stepEventsMap.set(event.stepId, current);
                      }

                      const stepGroups = Array.from(stepEventsMap.entries())
                        .map(([stepId, events]) => {
                          const firstEvent = events[0];
                          const lastStepEvent = events[events.length - 1];
                          const firstWithOrdinal = events.find(candidate =>
                            Number.isFinite(candidate.payload?.ordinal)
                          );
                          const firstWithOperation = events.find(
                            candidate =>
                              typeof candidate.payload?.operation === 'string' &&
                              String(candidate.payload.operation).trim().length > 0
                          );

                          const ordinal = Number(firstWithOrdinal?.payload?.ordinal);
                          const operation =
                            typeof firstWithOperation?.payload?.operation === 'string'
                              ? String(firstWithOperation.payload.operation)
                              : null;

                          return {
                            stepId,
                            events,
                            firstEventId: firstEvent?.id || Number.MAX_SAFE_INTEGER,
                            ordinal: Number.isFinite(ordinal) ? ordinal : Number.MAX_SAFE_INTEGER,
                            operation,
                            status: deriveStepStatus(lastStepEvent?.type || 'step.pending'),
                            statusLevel: lastStepEvent?.level || 'info',
                            latestProgress: lastStepEvent ? eventProgressText(lastStepEvent) : t('noActivity'),
                          };
                        })
                        .sort((left, right) => {
                          if (left.firstEventId !== right.firstEventId) {
                            return left.firstEventId - right.firstEventId;
                          }
                          return left.ordinal - right.ordinal;
                        });

                      const stepGroupById = new Map(stepGroups.map(step => [step.stepId, step]));
                      const renderedSteps = new Set<number>();
                      const runStreamItems: Array<
                        | { kind: 'run_event'; event: AgentRunEvent }
                        | { kind: 'step'; step: (typeof stepGroups)[number] }
                      > = [];

                      for (const event of runEvents) {
                        if (!event.stepId) {
                          runStreamItems.push({
                            kind: 'run_event',
                            event,
                          });
                          continue;
                        }

                        if (renderedSteps.has(event.stepId)) {
                          continue;
                        }

                        const step = stepGroupById.get(event.stepId);
                        if (!step) {
                          continue;
                        }

                        renderedSteps.add(event.stepId);
                        runStreamItems.push({
                          kind: 'step',
                          step,
                        });
                      }

                      return (
                        <Box key={`timeline-run-${run.id}`} py={2}>
                          <Stack gap={4}>
                            {runStreamItems.map(streamItem => {
                              if (streamItem.kind === 'run_event') {
                                const event = streamItem.event;
                                const payloadSnippet = toPayloadSnippet(event.payload);
                                const shouldRenderPayloadSnippet =
                                  Boolean(payloadSnippet) &&
                                  (event.level === 'warn' ||
                                    event.level === 'error' ||
                                    event.type.includes('error') ||
                                    event.type.includes('failed'));

                                return (
                                  <Box key={`run-${run.id}-event-inline-${event.id}`} pl="xs">
                                    <Stack gap={2}>
                                      <Text size="sm">{eventProgressText(event)}</Text>
                                      {shouldRenderPayloadSnippet && (
                                        <Box
                                          component="pre"
                                          style={{
                                            margin: 0,
                                            fontSize: 11,
                                            whiteSpace: 'pre-wrap',
                                            overflowX: 'auto',
                                            color: 'var(--mantine-color-dimmed)',
                                          }}
                                        >
                                          {payloadSnippet}
                                        </Box>
                                      )}
                                    </Stack>
                                  </Box>
                                );
                              }

                              const step = streamItem.step;
                              const stepOrdinalLabel =
                                Number.isFinite(step.ordinal) && step.ordinal !== Number.MAX_SAFE_INTEGER
                                  ? `#${step.ordinal}`
                                  : `#${step.stepId}`;
                              const stepOperationLabel = step.operation ? `${step.operation}` : 'operation';

                              return (
                                <Accordion
                                  key={`run-${run.id}-step-inline-${step.stepId}`}
                                  multiple={false}
                                  variant="default"
                                  radius={0}
                                  chevronPosition="right"
                                  styles={{
                                    root: { border: 'none' },
                                    item: { border: 'none' },
                                    control: { padding: '2px 4px' },
                                    label: { padding: 0 },
                                    panel: { padding: '4px 4px 8px 4px' },
                                  }}
                                >
                                  <Accordion.Item value={`step-${step.stepId}`}>
                                    <Accordion.Control>
                                      <Group justify="space-between" wrap="nowrap">
                                        <Group gap={8} wrap="nowrap">
                                          <Badge size="xs" variant="dot" color={getActivityLevelColor(step.statusLevel)}>
                                            {stepOrdinalLabel}
                                          </Badge>
                                          <Text size="sm">{step.latestProgress}</Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                          {stepOperationLabel}
                                        </Text>
                                      </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                      <Stack gap={6} pl="xs">
                                        {step.events.map(event => {
                                          const payloadSnippet = toPayloadSnippet(event.payload);
                                          const scriptPreview =
                                            (event.payload?.output as Record<string, unknown> | undefined)
                                              ?.scriptPreview;
                                          return (
                                            <Stack key={`run-${run.id}-step-${step.stepId}-event-${event.id}`} gap={4}>
                                              <Group gap={8} wrap="nowrap">
                                                <Badge
                                                  size="xs"
                                                  variant="dot"
                                                  color={getActivityLevelColor(event.level)}
                                                  style={{ textTransform: 'none' }}
                                                >
                                                  {formatActivityType(event.type)}
                                                </Badge>
                                                <Text size="xs">{eventProgressText(event)}</Text>
                                              </Group>
                                              {typeof scriptPreview === 'string' && scriptPreview.trim().length > 0 && (
                                                <Box
                                                  component="pre"
                                                  style={{
                                                    margin: 0,
                                                    fontSize: 11,
                                                    whiteSpace: 'pre-wrap',
                                                    overflowX: 'auto',
                                                  }}
                                                >
                                                  {scriptPreview}
                                                </Box>
                                              )}
                                              {payloadSnippet && (
                                                <Box
                                                  component="pre"
                                                  style={{
                                                    margin: 0,
                                                    fontSize: 11,
                                                    whiteSpace: 'pre-wrap',
                                                    overflowX: 'auto',
                                                    color: 'var(--mantine-color-dimmed)',
                                                  }}
                                                >
                                                  {payloadSnippet}
                                                </Box>
                                              )}
                                            </Stack>
                                          );
                                        })}
                                      </Stack>
                                    </Accordion.Panel>
                                  </Accordion.Item>
                                </Accordion>
                              );
                            })}
                          </Stack>
                        </Box>
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
              <Paper withBorder p="sm" radius="md">
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
                  variant="unstyled"
                  styles={{
                    input: {
                      padding: 0,
                    },
                  }}
                />

                <Group justify="space-between" align="center" mt="xs" wrap="nowrap">
                  <Select
                    size="xs"
                    placeholder={t('modelPlaceholder')}
                    data={aiModelOptions}
                    value={selectedAiModelOption}
                    disabled={aiModelOptions.length === 0 || aiModelsLoading}
                    variant="unstyled"
                    onChange={value => {
                      if (!value) {
                        setSelectedAiModelOption(null);
                        setAiProvider(null);
                        setAiModel(null);
                        return;
                      }

                      const selected = aiModelOptions.find(option => option.value === value);
                      if (!selected) {
                        return;
                      }

                      setSelectedAiModelOption(selected.value);
                      setAiProvider(selected.provider);
                      setAiModel(selected.model);
                      writeStoredModelSelection(
                        modelSelectionServerId,
                        activeChatId,
                        selected.provider,
                        selected.model
                      );
                    }}
                    rightSection={aiModelsLoading ? <Loader size={12} /> : <IconChevronDown size={14} />}
                    rightSectionWidth={18}
                    styles={{
                      input: {
                        border: 'none',
                        background: 'transparent',
                        paddingLeft: 0,
                        paddingRight: 18,
                        color: 'var(--mantine-color-dimmed)',
                        fontSize: 13,
                        fontWeight: 500,
                        minHeight: 24,
                        height: 24,
                      },
                      section: {
                        pointerEvents: 'none',
                      },
                    }}
                    w={220}
                  />

                  <Button
                    size="xs"
                    rightSection={<IconSend size={14} />}
                    onClick={() => void handleSend()}
                    loading={sending}
                    disabled={!draft.trim()}
                  >
                    {t('send')}
                  </Button>
                </Group>
              </Paper>

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
