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

import type { AgentChatSummary, AgentMessage, AgentRunEvent } from '@/core/ipc/backend';
import type { AgentRunSummary } from '@app/contracts';
import { create } from 'zustand';

interface AgentState {
  chats: AgentChatSummary[];
  activeChatId: number | null;
  autoConfirmByChat: Record<number, boolean>;
  messagesByChat: Record<number, AgentMessage[]>;
  runsByChat: Record<number, AgentRunSummary[]>;
  eventsByRun: Record<number, AgentRunEvent[]>;
  streamingAssistantByRun: Record<number, string>;
  streamHealthyByRun: Record<number, boolean>;
  setChats: (items: AgentChatSummary[]) => void;
  upsertChat: (chat: AgentChatSummary) => void;
  removeChat: (chatId: number) => void;
  setActiveChatId: (chatId: number | null) => void;
  setChatAutoConfirm: (chatId: number, enabled: boolean) => void;
  setMessages: (chatId: number, messages: AgentMessage[]) => void;
  addMessage: (chatId: number, message: AgentMessage) => void;
  upsertMessage: (chatId: number, message: AgentMessage) => void;
  setRuns: (chatId: number, runs: AgentRunSummary[]) => void;
  upsertRun: (chatId: number, run: AgentRunSummary) => void;
  setStreamingAssistant: (runId: number, text: string) => void;
  clearStreamingAssistant: (runId: number) => void;
  setStreamHealthy: (runId: number, healthy: boolean) => void;
  setRunEvents: (runId: number, events: AgentRunEvent[]) => void;
  appendRunEvents: (runId: number, events: AgentRunEvent[]) => void;
  reset: () => void;
}

const sortChats = (items: AgentChatSummary[]): AgentChatSummary[] =>
  [...items].sort((a, b) => {
    const aTime = a.lastMessageAt
      ? new Date(a.lastMessageAt).getTime()
      : new Date(a.updatedAt).getTime();
    const bTime = b.lastMessageAt
      ? new Date(b.lastMessageAt).getTime()
      : new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

export const useAgentStore = create<AgentState>(set => ({
  chats: [],
  activeChatId: null,
  autoConfirmByChat: {},
  messagesByChat: {},
  runsByChat: {},
  eventsByRun: {},
  streamingAssistantByRun: {},
  streamHealthyByRun: {},

  setChats: items => {
    set(state => {
      const sorted = sortChats(items);
      let newActiveChatId = state.activeChatId;

      // If we currently have an active chat ID but it's missing from the new list, gracefully fall back
      if (state.activeChatId !== null && !sorted.some(chat => chat.id === state.activeChatId)) {
        newActiveChatId = sorted[0]?.id ?? null;
      }

      return {
        chats: sorted,
        activeChatId: newActiveChatId,
      };
    });
  },

  upsertChat: chat => {
    set(state => {
      const existingIndex = state.chats.findIndex(item => item.id === chat.id);
      if (existingIndex >= 0) {
        const next = [...state.chats];
        next[existingIndex] = chat;
        return { chats: sortChats(next) };
      }
      return { chats: sortChats([...state.chats, chat]) };
    });
  },

  removeChat: chatId => {
    set(state => {
      const chats = state.chats.filter(chat => chat.id !== chatId);
      const { [chatId]: _messagesToRemove, ...messagesByChat } = state.messagesByChat;
      const { [chatId]: _runsToRemove, ...runsByChat } = state.runsByChat;
      const { [chatId]: _autoConfirmToRemove, ...autoConfirmByChat } = state.autoConfirmByChat;

      const runIdsToRemove = new Set((state.runsByChat[chatId] || []).map(run => run.id));
      const eventsByRun = Object.fromEntries(
        Object.entries(state.eventsByRun).filter(([runId]) => !runIdsToRemove.has(Number(runId)))
      ) as Record<number, AgentRunEvent[]>;
      const streamingAssistantByRun = Object.fromEntries(
        Object.entries(state.streamingAssistantByRun).filter(
          ([runId]) => !runIdsToRemove.has(Number(runId))
        )
      ) as Record<number, string>;
      const streamHealthyByRun = Object.fromEntries(
        Object.entries(state.streamHealthyByRun).filter(
          ([runId]) => !runIdsToRemove.has(Number(runId))
        )
      ) as Record<number, boolean>;

      return {
        chats,
        activeChatId: state.activeChatId === chatId ? (chats[0]?.id ?? null) : state.activeChatId,
        autoConfirmByChat,
        messagesByChat,
        runsByChat,
        eventsByRun,
        streamingAssistantByRun,
        streamHealthyByRun,
      };
    });
  },

  setActiveChatId: chatId => set({ activeChatId: chatId }),

  setChatAutoConfirm: (chatId, enabled) => {
    set(state => ({
      autoConfirmByChat: {
        ...state.autoConfirmByChat,
        [chatId]: enabled,
      },
    }));
  },

  setMessages: (chatId, messages) => {
    set(state => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: messages,
      },
    }));
  },

  addMessage: (chatId, message) => {
    set(state => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] || []), message],
      },
    }));
  },

  upsertMessage: (chatId, message) => {
    set(state => {
      const current = state.messagesByChat[chatId] || [];
      const index = current.findIndex(item => item.id === message.id);
      const next =
        index >= 0
          ? current.map((item, idx) => (idx === index ? message : item))
          : [...current, message].sort((a, b) => a.id - b.id);
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: next,
        },
      };
    });
  },

  setRuns: (chatId, runs) => {
    set(state => ({
      runsByChat: {
        ...state.runsByChat,
        [chatId]: [...runs].sort((a, b) => b.id - a.id),
      },
    }));
  },

  upsertRun: (chatId, run) => {
    set(state => {
      const current = state.runsByChat[chatId] || [];
      const index = current.findIndex(item => item.id === run.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = run;
        return {
          runsByChat: {
            ...state.runsByChat,
            [chatId]: next.sort((a, b) => b.id - a.id),
          },
        };
      }

      return {
        runsByChat: {
          ...state.runsByChat,
          [chatId]: [...current, run].sort((a, b) => b.id - a.id),
        },
      };
    });
  },

  setRunEvents: (runId, events) => {
    set(state => ({
      eventsByRun: {
        ...state.eventsByRun,
        [runId]: events,
      },
    }));
  },

  appendRunEvents: (runId, events) => {
    set(state => {
      if (!events.length) {
        return state;
      }

      const existing = state.eventsByRun[runId] || [];
      const existingIds = new Set(existing.map(item => item.id));
      const merged = [...existing, ...events.filter(item => !existingIds.has(item.id))].sort(
        (a, b) => a.id - b.id
      );

      return {
        eventsByRun: {
          ...state.eventsByRun,
          [runId]: merged,
        },
      };
    });
  },

  setStreamingAssistant: (runId, text) => {
    set(state => ({
      streamingAssistantByRun: {
        ...state.streamingAssistantByRun,
        [runId]: text,
      },
    }));
  },

  clearStreamingAssistant: runId => {
    set(state => {
      const { [runId]: _removed, ...streamingAssistantByRun } = state.streamingAssistantByRun;
      return { streamingAssistantByRun };
    });
  },

  setStreamHealthy: (runId, healthy) => {
    set(state => ({
      streamHealthyByRun: {
        ...state.streamHealthyByRun,
        [runId]: healthy,
      },
    }));
  },

  reset: () =>
    set({
      chats: [],
      activeChatId: null,
      autoConfirmByChat: {},
      messagesByChat: {},
      runsByChat: {},
      eventsByRun: {},
      streamingAssistantByRun: {},
      streamHealthyByRun: {},
    }),
}));
