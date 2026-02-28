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

import { getAiSettings, listAiModels, listAiProviders } from '@/core/ipc/aiSettings';
import {
  backendRpc,
  type AgentMentionSuggestion,
  type AgentMessage,
  type AgentRunEvent,
  type AgentRunSummary,
} from '@/core/ipc/backend';
import { useAgentStore } from '@/core/store/agent';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import { CodeHighlight } from '@mantine/code-highlight';
import '@mantine/code-highlight/styles.css';
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconPlayerStop,
} from '@tabler/icons-react';
import { marked } from 'marked';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);

const renderMarkdown = (md: string): string => {
  try {
    return marked.parse(md, { async: false, breaks: true }) as string;
  } catch {
    return md;
  }
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

    window.localStorage.setItem(AGENT_MODEL_SELECTION_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // ignore storage failures
  }
};

const RunTimer = ({ createdAt }: { createdAt: string | Date }) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const update = () => setDuration(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return <>{duration}s</>;
};

const StepDetailAccordion = ({
  label,
  color,
  detail,
}: {
  label: string;
  color?: string;
  detail: string;
}) => (
  <Accordion
    variant="default"
    chevronPosition="right"
    chevronSize={14}
    styles={{
      root: { border: 'none', width: 'fit-content' },
      item: { border: 'none' },
      control: {
        padding: '2px 0',
        minHeight: 'unset',
        width: 'fit-content',
      },
      label: { padding: 0 },
      chevron: { marginLeft: 6, margin: 0 },
      panel: { padding: '4px 0', width: '100%' },
      content: { padding: 0 },
    }}
  >
    <Accordion.Item value="detail">
      <Accordion.Control>
        <Text size="sm" c={color}>
          {label}
        </Text>
      </Accordion.Control>
      <Accordion.Panel>
        <CodeHighlight
          code={detail}
          language="json"
          withCopyButton={false}
          style={{
            margin: 0,
            padding: 0,
            fontSize: 11,
            lineHeight: 1.4,
            borderRadius: 'var(--mantine-radius-xs)',
            maxHeight: 300,
            overflow: 'auto',
            width: 'calc(100vw - 80px)',
            maxWidth: 800,
          }}
        />
      </Accordion.Panel>
    </Accordion.Item>
  </Accordion>
);

interface RunActivityItem {
  kind: 'note' | 'execution';
  label: string;
  detail: string | null;
  level: 'info' | 'warn' | 'error';
}

const EXECUTION_EVENT_KEYS: Record<string, string> = {
  'step.completed': 'stepCompleted',
  'step.failed': 'stepFailed',
  'step.waiting_confirmation': 'stepAwaitingConfirmation',
  'step.confirmed': 'stepConfirmed',
  'step.rejected': 'stepRejected',
};

const SKIP_EVENT_TYPES = new Set([
  'run.queued',
  'run.executing',
  'run.summarizing',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

const formatEventDetail = (event: AgentRunEvent): string | null => {
  const payload = event.payload;
  if (!payload) return null;

  if (event.type === 'step.completed' || event.type === 'step.failed') {
    const output = payload.output as Record<string, unknown> | undefined;
    if (!output) return null;
    try {
      return JSON.stringify(output, null, 2).slice(0, 1500);
    } catch {
      return null;
    }
  }

  if (event.type === 'step.waiting_confirmation') {
    const parts: string[] = [];
    if (payload.operation) parts.push(`Operation: ${payload.operation}`);
    if (payload.summary) parts.push(`${payload.summary}`);
    const args = (payload.output as Record<string, unknown> | undefined)?.args;
    if (args) {
      try {
        parts.push(`Args: ${JSON.stringify(args, null, 2)}`);
      } catch {
        /* skip */
      }
    }
    return parts.join('\n') || null;
  }

  if (payload.error) {
    return String(payload.error);
  }

  return null;
};

const buildRunActivity = (events: AgentRunEvent[]): RunActivityItem[] => {
  const items: RunActivityItem[] = [];

  for (const event of events) {
    if (SKIP_EVENT_TYPES.has(event.type)) continue;

    if (event.type === 'run.note') {
      const text = (event.payload?.text as string) || '';
      if (text) {
        items.push({ kind: 'note', label: text, detail: null, level: 'info' });
      }
      continue;
    }

    const key = EXECUTION_EVENT_KEYS[event.type];
    const label = key ? `__i18n:${key}` : event.type;
    const detail = formatEventDetail(event);
    const level = event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'info';
    items.push({ kind: 'execution', label, detail, level });
  }

  return items;
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
  const upsertChat = useAgentStore(state => state.upsertChat);
  const setActiveChatId = useAgentStore(state => state.setActiveChatId);

  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<
    Array<{
      id: string;
      type: 'node' | 'person' | 'group' | 'server';
      label: string;
      path?: string | null;
    }>
  >([]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [debouncedMentionQuery] = useDebouncedValue(mentionQuery, 250);
  const [mentionItems, setMentionItems] = useState<AgentMentionSuggestion[]>([]);
  const [mentionSkipCount, setMentionSkipCount] = useState(0);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);

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
      const existingMessages = useAgentStore.getState().messagesByChat[chatId] || [];
      const lastMessageId = existingMessages.length
        ? existingMessages[existingMessages.length - 1].id
        : undefined;

      const [messages, runsPage] = await Promise.all([
        backendRpc.agent.listMessages({ chatId, maxItems: 200 }),
        backendRpc.agent.listRuns({ chatId, maxItems: 100, skipCount: 0 }),
      ]);

      useAgentStore.getState().setMessages(chatId, messages);
      useAgentStore.getState().setRuns(chatId, runsPage.items);

      const activeRuns = runsPage.items.filter(run => ACTIVE_RUN_STATUSES.has(run.status));
      for (const run of activeRuns) {
        const existingEvents = useAgentStore.getState().eventsByRun[run.id] || [];
        const afterId = existingEvents.length
          ? existingEvents[existingEvents.length - 1].id
          : undefined;
        const events = await backendRpc.agent.listRunEvents({
          runId: run.id,
          afterId,
          maxItems: 200,
        });
        useAgentStore.getState().appendRunEvents(run.id, events);
      }

      const newMessages = messages.filter(m => lastMessageId && m.id > lastMessageId);
      const hasNewAssistantMessage = newMessages.some(m => m.role === 'assistant');
      const stillHasActiveRuns = activeRuns.length > 0;

      if (hasNewAssistantMessage && !stillHasActiveRuns) {
        for (const run of runsPage.items) {
          const existingEvents = useAgentStore.getState().eventsByRun[run.id] || [];
          const afterId = existingEvents.length
            ? existingEvents[existingEvents.length - 1].id
            : undefined;
          const events = await backendRpc.agent.listRunEvents({
            runId: run.id,
            afterId,
            maxItems: 200,
          });
          useAgentStore.getState().appendRunEvents(run.id, events);
        }
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
            const models = remote?.models?.length
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
    const selected =
      aiModelOptions.find(option => option.value === selectedValue) || aiModelOptions[0];

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
    setDraft('');
    setMentionQuery(null);
    setMentionItems([]);
    setMentionSkipCount(0);
    setMentionHasMore(false);
    setSelectedMentions([]);
    caretRef.current = 0;
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    void loadConversation(activeChatId);
  }, [activeChatId, loadConversation]);

  const hasActiveRuns = activeRuns.some(run => ACTIVE_RUN_STATUSES.has(run.status));
  const [recentlySentMessage, setRecentlySentMessage] = useState(false);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    const shouldPoll = hasActiveRuns || recentlySentMessage;
    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      void pollActiveChat();
    }, 1500);

    return () => clearInterval(interval);
  }, [activeChatId, hasActiveRuns, recentlySentMessage, pollActiveChat]);

  useEffect(() => {
    if (!recentlySentMessage) {
      return;
    }

    if (hasActiveRuns) {
      setRecentlySentMessage(false);
      return;
    }

    const timeout = setTimeout(() => setRecentlySentMessage(false), 10000);
    return () => clearTimeout(timeout);
  }, [recentlySentMessage, hasActiveRuns]);

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
    if (!draft.trim()) {
      return;
    }

    setSending(true);
    try {
      let chatId = activeChatId;

      // Create chat on first message if no chat exists yet
      if (!chatId) {
        const serverId = activeServerId || servers[0]?.id;
        if (!serverId) {
          notifications.show({
            title: t('errors.sendMessageTitle'),
            message: t('errors.serverRequiredMessage'),
            color: 'red',
          });
          return;
        }

        // Use first 80 chars of user message as initial title
        const title = draft.trim().substring(0, 80);
        const chat = await backendRpc.agent.createChat({ serverId, title });
        upsertChat(chat);
        setActiveChatId(chat.id);
        chatId = chat.id;
      }

      const response = await backendRpc.agent.sendMessage({
        chatId,
        content: draft.trim(),
        mentions: selectedMentions,
        aiProvider: aiProvider || undefined,
        aiModel: aiModel || undefined,
      });

      addMessage(chatId, response.message);
      upsertRun(chatId, response.run);

      setDraft('');
      setSelectedMentions([]);
      setMentionQuery(null);
      setMentionItems([]);
      setMentionSkipCount(0);
      setMentionHasMore(false);
      setRecentlySentMessage(true);

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
                    const runEvents = (eventsByRun[run.id] || [])
                      .slice()
                      .sort((a, b) => a.id - b.id);
                    const isActive = ACTIVE_RUN_STATUSES.has(run.status);
                    const activity = buildRunActivity(runEvents);

                    return (
                      <Box key={`timeline-run-${run.id}`} py={2}>
                        <Stack gap="xs">
                          {activity.map((step, idx) => {
                            if (step.kind === 'note') {
                              return (
                                <Box
                                  key={idx}
                                  className="agent-markdown"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(step.label) }}
                                  style={{ fontSize: 14, lineHeight: 1.6 }}
                                />
                              );
                            }

                            if (step.kind === 'execution' && step.detail) {
                              const translatedLabel = step.label.startsWith('__i18n:')
                                ? t(step.label.replace('__i18n:', ''))
                                : step.label;

                              return (
                                <StepDetailAccordion
                                  key={idx}
                                  label={translatedLabel}
                                  color={
                                    step.level === 'error'
                                      ? 'red'
                                      : step.level === 'warn'
                                        ? 'orange'
                                        : 'var(--mantine-color-text)'
                                  }
                                  detail={step.detail}
                                />
                              );
                            }

                            if (step.level === 'error') {
                              const translatedLabel = step.label.startsWith('__i18n:')
                                ? t(step.label.replace('__i18n:', ''))
                                : step.label;

                              if (step.detail) {
                                return (
                                  <StepDetailAccordion
                                    key={idx}
                                    label={translatedLabel}
                                    color="red"
                                    detail={step.detail}
                                  />
                                );
                              }

                              return (
                                <Text key={idx} size="sm" c="red">
                                  {translatedLabel}
                                </Text>
                              );
                            }

                            return (
                              <Text key={idx} size="xs" c="dimmed">
                                {step.label.startsWith('__i18n:')
                                  ? t(step.label.replace('__i18n:', ''))
                                  : step.label}
                              </Text>
                            );
                          })}

                          {isActive && (
                            <Group gap="xs" py={2}>
                              <Loader size={14} />
                              <Text size="xs" c="dimmed">
                                {t('thinking')} (
                                <RunTimer createdAt={run.createdAt} />)
                              </Text>
                            </Group>
                          )}
                        </Stack>
                      </Box>
                    );
                  }

                  const { message } = item;

                  if (message.role === 'assistant') {
                    return (
                      <Box
                        key={`message-${message.id}`}
                        className="agent-message-group"
                        style={{ position: 'relative' }}
                        mb={32}
                      >
                        <Box
                          py={2}
                          className="agent-markdown"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                          style={{ fontSize: 14, lineHeight: 1.6 }}
                        />
                        <Box
                          className="agent-message-copy-btn"
                          style={{
                            position: 'absolute',
                            bottom: -24,
                            right: 0,
                            opacity: 0,
                            transition: 'opacity 0.2s',
                          }}
                        >
                          <CopyButton value={message.content} timeout={2000}>
                            {({ copied, copy }) => (
                              <Tooltip
                                label={copied ? t('copied') : t('copy')}
                                withArrow
                                position="top"
                              >
                                <ActionIcon
                                  color={copied ? 'teal' : 'gray'}
                                  variant="subtle"
                                  onClick={copy}
                                  size="sm"
                                >
                                  {copied ? (
                                    <IconCheck style={{ width: 14 }} />
                                  ) : (
                                    <IconCopy style={{ width: 14 }} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </Box>
                      </Box>
                    );
                  }

                  return (
                    <Group
                      key={`message-${message.id}`}
                      justify="flex-end"
                      className="agent-message-group"
                      style={{ position: 'relative' }}
                      mb={32}
                    >
                      <Paper
                        p="sm"
                        withBorder={false}
                        shadow="none"
                        style={{
                          maxWidth: '72%',
                          width: 'fit-content',
                          backgroundColor: 'var(--mantine-color-gray-light)',
                        }}
                      >
                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                          {message.content}
                        </Text>
                      </Paper>

                      <Box
                        className="agent-message-copy-btn"
                        style={{
                          position: 'absolute',
                          bottom: -28,
                          right: 0,
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          zIndex: 10,
                        }}
                      >
                        <CopyButton value={message.content} timeout={2000}>
                          {({ copied, copy }) => (
                            <Tooltip
                              label={copied ? t('copied') : t('copy')}
                              withArrow
                              position="top"
                            >
                              <ActionIcon
                                color={copied ? 'teal' : 'gray'}
                                variant="subtle"
                                onClick={copy}
                                size="sm"
                              >
                                {copied ? (
                                  <IconCheck style={{ width: 14 }} />
                                ) : (
                                  <IconCopy style={{ width: 14 }} />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </CopyButton>
                      </Box>
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
          {pendingConfirmation?.pendingStep ? (
            <Paper withBorder p="md" radius="md">
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  {t('confirmationRequired')}
                </Text>
                <Text size="sm" c="dimmed">
                  {pendingConfirmation.pendingStep.summary || t('confirmationDescription')}
                </Text>
                <Group gap="xs" justify="flex-end">
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => void handleConfirmPendingStep(false)}
                  >
                    {t('reject')}
                  </Button>
                  <Button
                    size="xs"
                    color="green"
                    onClick={() => void handleConfirmPendingStep(true)}
                  >
                    {t('confirm')}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ) : (
            <>
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
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (draft.trim()) {
                          void handleSend();
                        }
                      }
                    }}
                    placeholder={t('composerPlaceholder')}
                    autosize
                    variant="unstyled"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
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
                      rightSection={
                        aiModelsLoading ? <Loader size={12} /> : <IconChevronDown size={14} />
                      }
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

                    {hasActiveRuns ? (
                      <ActionIcon
                        size={32}
                        radius="xl"
                        variant="filled"
                        color="red"
                        onClick={() => {
                          const runToCancel = activeRuns.find(r =>
                            ACTIVE_RUN_STATUSES.has(r.status)
                          );
                          if (runToCancel) void handleCancelRun(runToCancel.id);
                        }}
                      >
                        <IconPlayerStop size={16} />
                      </ActionIcon>
                    ) : (
                      <ActionIcon
                        size={32}
                        radius="xl"
                        variant="filled"
                        color="dark"
                        onClick={() => void handleSend()}
                        loading={sending}
                        disabled={!draft.trim()}
                      >
                        <IconArrowUp size={18} />
                      </ActionIcon>
                    )}
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
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => void loadMentions(mentionQuery, false)}
                        >
                          {t('loadMoreMentions')}
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                )}
              </Box>
            </>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

export default AgentPage;
