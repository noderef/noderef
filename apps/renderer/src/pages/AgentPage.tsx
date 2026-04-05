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
  type AgentMention,
  type AgentMentionSuggestion,
  type AgentMessage,
  type AgentRunSummary,
} from '@/core/ipc/backend';
import { useAgentStore } from '@/core/store/agent';
import { MODAL_KEYS } from '@/core/store/keys';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { useUIStore } from '@/core/store/ui';
import { writeClipboardText } from '@/core/utils/clipboard';
import { useModal } from '@/hooks/useModal';
import { useNavigation } from '@/hooks/useNavigation';
import { parseColonQuery, useQNameSuggestions } from '@/hooks/useQNameSuggestions';
import { useSearchDictionary } from '@/hooks/useSearchDictionary';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowUp,
  IconChevronDown,
  IconCpu,
  IconPlayerStop,
  IconServer2,
  IconShield,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentChatInput, AgentChatInputRef } from '../components/agent/AgentChatInput';
import { AgentEmptyState } from '../components/agent/AgentEmptyState';
import { AgentMessageBubble, parseNodeBrowserLink } from '../components/agent/AgentMessageBubble';
import { AgentRunTimelineItem } from '../components/agent/AgentRunTimeline';
import {
  buildContextWindowSnapshot,
  resolveContextWindowFromModel,
  type ContextWindowDisplayState,
  type ContextWindowSnapshot,
} from '../components/agent/agentRunActivity';
import { useAgentModelSelection, writeStoredModelSelection } from '../hooks/useAgentModelSelection';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);
const THREAD_AUTO_CONFIRM_ACCEPT_PATTERN = /^\s*(i accept|ik accepteer)\s*[.!]*\s*$/i;

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

const MODEL_SELECT_WIDTH = 260;
const MODEL_DROPDOWN_WIDTH = 300;
const SERVER_SELECT_WIDTH = 160;
const SERVER_DROPDOWN_WIDTH = 220;
const COMPOSER_SELECT_STYLES = {
  input: {
    border: 'none',
    background: 'transparent',
    paddingLeft: 20,
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
} as const;

export function AgentPage() {
  const { t } = useTranslation('agent');
  const { activePage, activeServerId, navigate } = useNavigation();
  const { open: openSettings, isOpen: isSettingsOpen } = useModal(MODAL_KEYS.SETTINGS);
  const servers = useServersStore(state => state.servers);
  const appLanguage = useUIStore(state => state.language);
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);

  const chats = useAgentStore(state => state.chats);
  const activeChatId = useAgentStore(state => state.activeChatId);
  const autoConfirmByChat = useAgentStore(state => state.autoConfirmByChat);
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
  const setChatAutoConfirm = useAgentStore(state => state.setChatAutoConfirm);

  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [composerServerId, setComposerServerId] = useState<number | null>(
    () => servers[0]?.id ?? null
  );

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionQuerySession, setMentionQuerySession] = useState(0);
  const mentionDebounceInput = useMemo(
    () => ({ query: mentionQuery, session: mentionQuerySession }),
    [mentionQuery, mentionQuerySession]
  );
  const [debouncedMentionInput] = useDebouncedValue(mentionDebounceInput, 300);
  const [mentionItems, setMentionItems] = useState<AgentMentionSuggestion[]>([]);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);

  const chatInputRef = useRef<AgentChatInputRef>(null);
  const conversationViewportRef = useRef<HTMLDivElement | null>(null);
  const loadChatsRequestIdRef = useRef(0);
  const mentionRequestIdRef = useRef(0);
  const mentionSkipCountRef = useRef(0);
  const mentionActiveQueryRef = useRef('');
  const mentionHasMoreRef = useRef(false);
  const mentionLoadingRef = useRef(false);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) || null,
    [chats, activeChatId]
  );
  const composerServerOptions = useMemo(
    () =>
      servers.map(server => ({
        value: String(server.id),
        label: server.label ? `${server.name} (${server.label})` : server.name,
      })),
    [servers]
  );
  const modelSelectionServerId = activeChat?.serverId || activeServerId || composerServerId || null;
  const {
    aiModelOptions,
    selectedAiModelOption,
    setSelectedAiModelOption,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    canSendMessages,
    showAiUnavailableState,
    aiModelsLoading,
  } = useAgentModelSelection({
    modelSelectionServerId,
    activeChatId,
    isSettingsOpen,
  });

  const [qnameQuery, setQnameQuery] = useState<string | null>(null);
  const [qnamePropertiesByPrefix, setQNamePropertiesByPrefix] = useState<Record<string, string[]>>(
    {}
  );
  const qnamePropertiesInFlightRef = useRef<Set<string>>(new Set());
  const qnamePropertiesFetchedRef = useRef<Set<string>>(new Set());

  // Load the search dictionary for the active server
  const dictionaryServerId = activeChat?.serverId || activeServerId || servers[0]?.id || null;
  const dictionaryServer = useMemo(
    () =>
      dictionaryServerId ? servers.find(server => server.id === dictionaryServerId) || null : null,
    [dictionaryServerId, servers]
  );
  const { dictionary } = useSearchDictionary(dictionaryServerId);
  const qnameSuggestionDictionary = useMemo(() => {
    const mergedProperties = [...dictionary.properties];
    const seen = new Set(dictionary.properties.map(property => property.toLowerCase()));

    for (const values of Object.values(qnamePropertiesByPrefix)) {
      for (const property of values) {
        const key = property.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        mergedProperties.push(property);
      }
    }

    return {
      ...dictionary,
      properties: mergedProperties,
    };
  }, [dictionary, qnamePropertiesByPrefix]);
  const qnameSuggestions = useQNameSuggestions(qnameSuggestionDictionary, qnameQuery);

  useEffect(() => {
    setQNamePropertiesByPrefix({});
    qnamePropertiesInFlightRef.current.clear();
    qnamePropertiesFetchedRef.current.clear();
  }, [dictionaryServerId, dictionaryServer?.baseUrl]);

  useEffect(() => {
    if (!qnameQuery || !dictionaryServerId || !dictionaryServer?.baseUrl) {
      return;
    }

    const parsed = parseColonQuery(qnameQuery);
    if (!parsed) {
      return;
    }

    const prefix = parsed.prefix.toLowerCase();
    const hasDictionaryProperties = dictionary.properties.some(property =>
      property.toLowerCase().startsWith(prefix)
    );
    if (hasDictionaryProperties) {
      return;
    }
    if (
      qnamePropertiesFetchedRef.current.has(prefix) ||
      qnamePropertiesInFlightRef.current.has(prefix)
    ) {
      return;
    }

    let cancelled = false;
    qnamePropertiesInFlightRef.current.add(prefix);

    backendRpc.alfresco.search
      .propertiesByPrefix(dictionaryServerId, dictionaryServer.baseUrl, prefix)
      .then(properties => {
        if (cancelled) {
          return;
        }
        qnamePropertiesFetchedRef.current.add(prefix);
        setQNamePropertiesByPrefix(prev => ({ ...prev, [prefix]: properties }));
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load QName properties', error);
      })
      .finally(() => {
        qnamePropertiesInFlightRef.current.delete(prefix);
      });

    return () => {
      cancelled = true;
    };
  }, [qnameQuery, dictionaryServerId, dictionaryServer?.baseUrl, dictionary.properties]);

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
  const autoConfirmForActiveChat = useMemo(
    () => (activeChatId ? Boolean(autoConfirmByChat[activeChatId]) : false),
    [activeChatId, autoConfirmByChat]
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

  const latestContextWindowSnapshot = useMemo<ContextWindowSnapshot | null>(() => {
    let latest: ContextWindowSnapshot | null = null;

    for (const run of activeRuns) {
      const events = eventsByRun[run.id] || [];
      for (const event of events) {
        const snapshot = buildContextWindowSnapshot(event, run.id);
        if (!snapshot) {
          continue;
        }
        if (!latest || snapshot.eventId > latest.eventId) {
          latest = snapshot;
        }
      }
    }

    return latest;
  }, [activeRuns, eventsByRun]);

  const contextWindowDisplay = useMemo<ContextWindowDisplayState>(() => {
    if (latestContextWindowSnapshot) {
      return {
        provider: latestContextWindowSnapshot.provider,
        model: latestContextWindowSnapshot.model,
        source: latestContextWindowSnapshot.contextWindowSource,
        usedTokens: latestContextWindowSnapshot.totalTokens,
        totalTokens: latestContextWindowSnapshot.contextWindowTokens,
        promptTokens: latestContextWindowSnapshot.promptTokens,
        outputTokens: latestContextWindowSnapshot.outputTokens,
        percentage: latestContextWindowSnapshot.utilizationPctTotal,
        nearLimit: latestContextWindowSnapshot.nearLimit,
        criticalLimit: latestContextWindowSnapshot.criticalLimit,
        removedHistoryMessages: latestContextWindowSnapshot.removedHistoryMessages,
        trimmedToolResultBlocks: latestContextWindowSnapshot.trimmedToolResultBlocks,
      };
    }

    const modelInfo = resolveContextWindowFromModel(aiModel);
    return {
      provider: aiProvider,
      model: aiModel,
      source: modelInfo.source,
      usedTokens: 0,
      totalTokens: modelInfo.tokens,
      promptTokens: 0,
      outputTokens: 0,
      percentage: 0,
      nearLimit: false,
      criticalLimit: false,
      removedHistoryMessages: 0,
      trimmedToolResultBlocks: 0,
    };
  }, [latestContextWindowSnapshot, aiModel, aiProvider]);

  const loadChats = useCallback(async () => {
    const requestId = ++loadChatsRequestIdRef.current;

    try {
      const result = await backendRpc.agent.listChats({
        serverId: activeServerId || undefined,
        skipCount: 0,
        maxItems: 100,
      });

      if (requestId !== loadChatsRequestIdRef.current) {
        return;
      }

      setChats(result.items);
    } catch (error) {
      if (requestId !== loadChatsRequestIdRef.current) {
        return;
      }

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

  const resetMentionSuggestions = useCallback(() => {
    mentionRequestIdRef.current += 1;
    mentionSkipCountRef.current = 0;
    mentionActiveQueryRef.current = '';
    mentionHasMoreRef.current = false;
    mentionLoadingRef.current = false;
    setMentionItems([]);
    setMentionHasMore(false);
    setMentionLoading(false);
  }, []);

  const loadMentions = useCallback(
    async (query: string, reset: boolean) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        resetMentionSuggestions();
        return;
      }

      const serverId = activeChat?.serverId || activeServerId || servers[0]?.id;
      if (!serverId) {
        resetMentionSuggestions();
        return;
      }

      if (reset) {
        mentionActiveQueryRef.current = normalizedQuery;
        mentionSkipCountRef.current = 0;
        mentionHasMoreRef.current = true;
      } else {
        if (normalizedQuery !== mentionActiveQueryRef.current) {
          return;
        }
        if (!mentionHasMoreRef.current || mentionLoadingRef.current) {
          return;
        }
      }

      const skipCount = mentionSkipCountRef.current;
      const requestId = ++mentionRequestIdRef.current;
      mentionLoadingRef.current = true;
      setMentionLoading(true);

      try {
        const result = await backendRpc.agent.searchMentions({
          serverId,
          query: normalizedQuery,
          skipCount,
          maxItems: 10,
        });

        if (requestId !== mentionRequestIdRef.current) {
          return;
        }
        if (normalizedQuery !== mentionActiveQueryRef.current) {
          return;
        }

        setMentionItems(prev => (reset ? result.items : [...prev, ...result.items]));
        mentionSkipCountRef.current = skipCount + result.items.length;
        mentionHasMoreRef.current = result.pagination.hasMoreItems;
        setMentionHasMore(result.pagination.hasMoreItems);
      } finally {
        if (requestId === mentionRequestIdRef.current) {
          mentionLoadingRef.current = false;
          setMentionLoading(false);
        }
      }
    },
    [activeChat?.serverId, activeServerId, resetMentionSuggestions, servers]
  );

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    setDraft('');
    setMentionQuery(null);
    resetMentionSuggestions();
  }, [activeChatId, resetMentionSuggestions]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    void loadConversation(activeChatId);
  }, [activeChatId, loadConversation]);

  useEffect(() => {
    if (
      activePage !== 'agentPage' ||
      pendingConfirmation?.pendingStep ||
      sending ||
      !canSendMessages
    ) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;
    let timeout: number | null = null;

    const tryFocus = () => {
      if (cancelled) {
        return;
      }

      chatInputRef.current?.focus();

      const activeElement = document.activeElement as HTMLElement | null;
      const isFocusedInComposer = Boolean(activeElement?.closest('.agent-chat-input .ProseMirror'));
      if (isFocusedInComposer || attempts >= maxAttempts) {
        return;
      }

      attempts += 1;
      timeout = window.setTimeout(tryFocus, 30);
    };

    timeout = window.setTimeout(tryFocus, 0);

    return () => {
      cancelled = true;
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [activePage, activeChatId, pendingConfirmation?.pendingStep, sending, canSendMessages]);

  const hasActiveRuns = activeRuns.some(run => ACTIVE_RUN_STATUSES.has(run.status));
  const [recentlySentMessage, setRecentlySentMessage] = useState(false);
  const tokenFormatter = useMemo(() => new Intl.NumberFormat(), []);

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
    const normalizedQuery = (mentionQuery || '').trim();
    if (!normalizedQuery) {
      setMentionQuerySession(current => current + 1);
      resetMentionSuggestions();
      return;
    }

    mentionRequestIdRef.current += 1;
    mentionActiveQueryRef.current = normalizedQuery;
    mentionSkipCountRef.current = 0;
    mentionHasMoreRef.current = true;
    mentionLoadingRef.current = true;
    setMentionItems([]);
    setMentionHasMore(false);
    setMentionLoading(true);
  }, [mentionQuery, resetMentionSuggestions]);

  useEffect(() => {
    const normalizedQuery = (debouncedMentionInput.query || '').trim();
    if (!normalizedQuery) {
      return;
    }

    void loadMentions(normalizedQuery, true);
  }, [debouncedMentionInput.query, debouncedMentionInput.session, loadMentions]);

  useEffect(() => {
    const viewport = conversationViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [activeChatId, conversationTimeline.length, totalRunEventCount, thinkingRunIds.length]);

  useEffect(() => {
    if (activeServerId !== null || activeChatId !== null) {
      return;
    }

    if (servers.length === 0) {
      if (composerServerId !== null) {
        setComposerServerId(null);
      }
      return;
    }

    if (composerServerId === null || !servers.some(server => server.id === composerServerId)) {
      setComposerServerId(servers[0].id);
      return;
    }
  }, [activeServerId, activeChatId, composerServerId, servers]);

  const handleSend = async (text: string, mentions: AgentMention[]) => {
    if (!text.trim()) {
      return;
    }
    if (!canSendMessages) {
      notifications.show({
        title: t('errors.sendMessageTitle'),
        message: t('errors.aiNotConfiguredMessage'),
        color: 'red',
      });
      return;
    }

    setSending(true);
    try {
      let chatId = activeChatId ?? useAgentStore.getState().activeChatId;

      // Create chat on first message if no chat exists yet
      if (!chatId) {
        const serverId = activeServerId || composerServerId || servers[0]?.id;
        if (!serverId) {
          notifications.show({
            title: t('errors.sendMessageTitle'),
            message: t('errors.serverRequiredMessage'),
            color: 'red',
          });
          return;
        }

        const chat = await backendRpc.agent.createChat({ serverId });
        upsertChat(chat);
        setActiveChatId(chat.id);
        chatId = chat.id;

        // Preserve the currently selected model as this chat's explicit model.
        if (aiProvider && aiModel) {
          writeStoredModelSelection(serverId, chat.id, aiProvider, aiModel);
        }

        void loadChats();
      }

      const isThreadAutoConfirmCommand = THREAD_AUTO_CONFIRM_ACCEPT_PATTERN.test(text.trim());
      const enableAutoConfirmForThisSend =
        Boolean(autoConfirmByChat[chatId]) || isThreadAutoConfirmCommand;

      if (isThreadAutoConfirmCommand) {
        setChatAutoConfirm(chatId, true);
      }

      const response = await backendRpc.agent.sendMessage({
        chatId,
        content: text.trim(),
        mentions: mentions,
        aiProvider: aiProvider || undefined,
        aiModel: aiModel || undefined,
        appLanguage: appLanguage || undefined,
        autoApproveConfirmations: enableAutoConfirmForThisSend,
      });

      addMessage(chatId, response.message);
      upsertRun(chatId, response.run);

      setDraft('');
      setMentionQuery(null);
      resetMentionSuggestions();
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

  const toggleAutoConfirmForActiveChat = useCallback(() => {
    if (!activeChatId) {
      return;
    }

    const nextEnabled = !autoConfirmForActiveChat;
    setChatAutoConfirm(activeChatId, nextEnabled);

    void backendRpc.agent
      .setChatAutoApproveConfirmations({
        chatId: activeChatId,
        enabled: nextEnabled,
      })
      .catch(error => {
        setChatAutoConfirm(activeChatId, autoConfirmForActiveChat);
        notifications.show({
          title: t('errors.confirmationTitle'),
          message: error instanceof Error ? error.message : t('errors.generic'),
          color: 'red',
        });
      });
  }, [activeChatId, autoConfirmForActiveChat, setChatAutoConfirm, t]);

  const handleConfirmPendingStep = async (
    approved: boolean,
    options?: { enableForChat?: boolean }
  ) => {
    if (!pendingConfirmation?.pendingStep) {
      return;
    }

    try {
      await backendRpc.agent.confirmStep({
        runId: pendingConfirmation.id,
        stepId: pendingConfirmation.pendingStep.id,
        confirmationToken: pendingConfirmation.pendingStep.confirmationToken || '',
        approved,
        enableAutoApproveConfirmations: Boolean(approved && options?.enableForChat),
      });

      if (approved && options?.enableForChat && activeChatId) {
        setChatAutoConfirm(activeChatId, true);
        await backendRpc.agent.setChatAutoApproveConfirmations({
          chatId: activeChatId,
          enabled: true,
        });
      }

      await pollActiveChat();
    } catch (error) {
      notifications.show({
        title: t('errors.confirmationTitle'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  const handleAgentMarkdownClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const copyButton = target.closest('[data-agent-code-copy]');
      if (copyButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();

        const codeElement = copyButton.closest('.agent-code-block')?.querySelector('pre > code');
        const code = codeElement?.textContent ?? '';
        if (!code.trim()) {
          return;
        }

        void (async () => {
          const copied = await writeClipboardText(code);
          if (!copied) {
            notifications.show({
              title: t('errors.generic'),
              message: t('errors.generic'),
              color: 'red',
            });
            return;
          }

          const copyLabel = copyButton.getAttribute('data-copy-label') || 'Copy';
          const copiedLabel = copyButton.getAttribute('data-copied-label') || 'Copied';
          copyButton.dataset.copied = 'true';
          copyButton.setAttribute('aria-label', copiedLabel);
          copyButton.setAttribute('title', copiedLabel);

          window.setTimeout(() => {
            if (!copyButton.isConnected) {
              return;
            }
            copyButton.removeAttribute('data-copied');
            copyButton.setAttribute('aria-label', copyLabel);
            copyButton.setAttribute('title', copyLabel);
          }, 1800);
        })();
        return;
      }

      const anchor = target.closest('a');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const link =
        parseNodeBrowserLink(anchor.getAttribute('href') || '') ||
        parseNodeBrowserLink(anchor.href);
      if (!link) {
        return;
      }

      event.preventDefault();

      const serverId = activeChat?.serverId || activeServerId;
      if (!serverId) {
        notifications.show({
          title: t('errors.generic'),
          message: t('errors.serverRequiredMessage'),
          color: 'red',
        });
        return;
      }

      const fallbackName = anchor.textContent?.trim() || null;
      openNodeTab({
        nodeId: link.nodeId,
        nodeName: link.nodeName || fallbackName || link.nodeId,
        serverId,
      });
      navigate('node-browser');
    },
    [activeChat?.serverId, activeServerId, navigate, openNodeTab, t]
  );

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
          onClick={handleAgentMarkdownClick}
          style={{
            minHeight: 0,
            height: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Stack
            gap="xs"
            pr="sm"
            style={{
              marginTop: conversationTimeline.length === 0 ? 0 : 'auto',
              flex: conversationTimeline.length === 0 ? 1 : undefined,
            }}
          >
            {loadingConversation && (
              <Group justify="center" py={2}>
                <Loader size="xs" />
              </Group>
            )}

            {conversationTimeline.length === 0 ? (
              <AgentEmptyState
                chatId={activeChat?.id}
                aiUnavailable={showAiUnavailableState}
                noServerSelected={
                  activeServerId === null && activeChatId === null && servers.length > 0
                }
                onOpenSettings={openSettings}
              />
            ) : (
              <>
                {conversationTimeline.map(item => {
                  if (item.kind === 'run') {
                    const run = item.run;
                    const runEvents = (eventsByRun[run.id] || [])
                      .slice()
                      .sort((a, b) => a.id - b.id);
                    const isActive = ACTIVE_RUN_STATUSES.has(run.status);
                    return (
                      <AgentRunTimelineItem
                        key={`timeline-run-${run.id}`}
                        run={run}
                        runEvents={runEvents}
                        isActive={isActive}
                        copyLabel={t('copy')}
                        copiedLabel={t('copied')}
                      />
                    );
                  }

                  const { message } = item;
                  return (
                    <AgentMessageBubble
                      key={`message-${message.id}`}
                      message={message}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
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
                  {activeChatId && !autoConfirmForActiveChat ? (
                    <Button
                      size="xs"
                      color="blue"
                      onClick={() => void handleConfirmPendingStep(true, { enableForChat: true })}
                    >
                      {t('confirmForChat')}
                    </Button>
                  ) : null}
                </Group>
                {activeChatId && autoConfirmForActiveChat ? (
                  <Text size="xs" c="dimmed">
                    {t('autoConfirmActive')}
                  </Text>
                ) : null}
              </Stack>
            </Paper>
          ) : (
            <>
              <Box style={{ position: 'relative' }}>
                <Paper withBorder p="sm" radius="md">
                  <AgentChatInput
                    ref={chatInputRef}
                    value={draft}
                    onChange={setDraft}
                    onSend={handleSend}
                    disabled={sending || !canSendMessages}
                    onMentionQueryChange={setMentionQuery}
                    mentionItems={mentionItems}
                    mentionHasMore={mentionHasMore}
                    mentionLoading={mentionLoading}
                    onLoadMoreMentions={() =>
                      void loadMentions(mentionActiveQueryRef.current, false)
                    }
                    qnameSuggestions={qnameSuggestions}
                    onQNameQueryChange={setQnameQuery}
                  />

                  <Group justify="space-between" align="center" mt="xs" wrap="nowrap">
                    <Group gap={4} align="center" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Select
                        size="xs"
                        placeholder={t('modelPlaceholder')}
                        data={aiModelOptions}
                        comboboxProps={{ width: MODEL_DROPDOWN_WIDTH }}
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
                        leftSection={<IconCpu size={14} />}
                        leftSectionWidth={18}
                        rightSectionWidth={18}
                        styles={COMPOSER_SELECT_STYLES}
                        w={MODEL_SELECT_WIDTH}
                      />
                      {activeServerId === null && activeChatId === null ? (
                        <Select
                          size="xs"
                          placeholder={t('serverSelectorPlaceholder')}
                          data={composerServerOptions}
                          comboboxProps={{ width: SERVER_DROPDOWN_WIDTH }}
                          value={composerServerId ? String(composerServerId) : null}
                          variant="unstyled"
                          onChange={value => {
                            if (!value) {
                              setComposerServerId(null);
                              return;
                            }
                            const parsed = Number.parseInt(value, 10);
                            setComposerServerId(Number.isNaN(parsed) ? null : parsed);
                          }}
                          leftSection={<IconServer2 size={14} />}
                          leftSectionWidth={18}
                          rightSection={<IconChevronDown size={14} />}
                          rightSectionWidth={18}
                          styles={COMPOSER_SELECT_STYLES}
                          w={SERVER_SELECT_WIDTH}
                          aria-label={t('selectServer')}
                        />
                      ) : null}
                      {activeChatId ? (
                        <Tooltip
                          withArrow
                          multiline
                          label={
                            autoConfirmForActiveChat
                              ? t('autoConfirmDisableTooltip')
                              : t('autoConfirmEnableTooltip')
                          }
                        >
                          <ActionIcon
                            size={24}
                            radius="xl"
                            variant={autoConfirmForActiveChat ? 'light' : 'subtle'}
                            color={autoConfirmForActiveChat ? 'blue' : 'gray'}
                            onClick={toggleAutoConfirmForActiveChat}
                            aria-label={t('toggleAutoConfirm')}
                          >
                            {autoConfirmForActiveChat ? (
                              <IconShieldCheck size={14} />
                            ) : (
                              <IconShield size={14} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </Group>

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
                        onClick={() => {
                          if (canSendMessages) {
                            chatInputRef.current?.submit();
                          }
                        }}
                        loading={sending}
                        disabled={!draft.trim() || !canSendMessages}
                      >
                        <IconArrowUp size={18} />
                      </ActionIcon>
                    )}
                  </Group>
                </Paper>
              </Box>
            </>
          )}

          <Box px="xs" py={4}>
            <Tooltip
              withArrow
              multiline
              position="top-start"
              label={
                <Stack gap={3}>
                  <Text size="xs">
                    {(contextWindowDisplay.provider || 'unknown') +
                      ' · ' +
                      (contextWindowDisplay.model || 'default')}
                  </Text>
                  <Text size="xs">
                    {t('contextWindowUsage', {
                      used: tokenFormatter.format(contextWindowDisplay.usedTokens),
                      total: tokenFormatter.format(contextWindowDisplay.totalTokens),
                    })}
                  </Text>
                  <Text size="xs">
                    {t('contextWindowPromptOutput', {
                      prompt: tokenFormatter.format(contextWindowDisplay.promptTokens),
                      output: tokenFormatter.format(contextWindowDisplay.outputTokens ?? 0),
                    })}
                  </Text>
                  {contextWindowDisplay.source === 'default' && (
                    <Text size="xs">{t('contextWindowEstimated')}</Text>
                  )}
                  {(contextWindowDisplay.removedHistoryMessages > 0 ||
                    contextWindowDisplay.trimmedToolResultBlocks > 0) && (
                    <Text size="xs">
                      {t('contextWindowCompacted', {
                        messages: contextWindowDisplay.removedHistoryMessages,
                        blocks: contextWindowDisplay.trimmedToolResultBlocks,
                      })}
                    </Text>
                  )}
                  {contextWindowDisplay.criticalLimit ? (
                    <Text size="xs">{t('contextWindowCritical')}</Text>
                  ) : contextWindowDisplay.nearLimit ? (
                    <Text size="xs">{t('contextWindowNearLimit')}</Text>
                  ) : null}
                </Stack>
              }
            >
              <Stack gap={6}>
                <Progress
                  value={Math.max(0, Math.min(100, contextWindowDisplay.percentage))}
                  color={
                    contextWindowDisplay.criticalLimit
                      ? 'red'
                      : contextWindowDisplay.nearLimit
                        ? 'orange'
                        : 'blue'
                  }
                  size="sm"
                  radius="xl"
                  style={{ cursor: 'help' }}
                />

                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="xs" c="dimmed">
                    {t('contextWindowUsage', {
                      used: tokenFormatter.format(contextWindowDisplay.usedTokens),
                      total: tokenFormatter.format(contextWindowDisplay.totalTokens),
                    })}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {contextWindowDisplay.percentage.toFixed(1)}%
                  </Text>
                </Group>
              </Stack>
            </Tooltip>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

// fallow-ignore-next-line unused-export
export default AgentPage;
