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
  AGENT_STREAM_EVENT_TYPES,
  buildAgentRunStreamUrl,
  parseAgentStreamPayload,
} from '@/core/ipc/agentRunStream';
import { useAgentStore } from '@/core/store/agent';
import { useEffect, useRef } from 'react';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_confirmation']);
const STREAM_RECONNECT_MS = 5000;
const FALLBACK_POLL_DEBOUNCE_MS = 8000;

export function useAgentRunStreams(
  activeChatId: number | null,
  options?: { onStreamError?: () => void }
): void {
  const sourcesRef = useRef<Map<number, EventSource>>(new Map());
  const onStreamErrorRef = useRef(options?.onStreamError);
  const lastFallbackPollAtRef = useRef(0);

  onStreamErrorRef.current = options?.onStreamError;

  useEffect(() => {
    if (!activeChatId) {
      for (const source of sourcesRef.current.values()) {
        source.close();
      }
      sourcesRef.current.clear();
      return;
    }

    let cancelled = false;
    const sources = sourcesRef.current;

    const scheduleFallbackPoll = () => {
      const now = Date.now();
      if (now - lastFallbackPollAtRef.current < FALLBACK_POLL_DEBOUNCE_MS) {
        return;
      }
      lastFallbackPollAtRef.current = now;
      onStreamErrorRef.current?.();
    };

    const connectRun = async (runId: number) => {
      if (cancelled || sourcesRef.current.has(runId)) {
        return;
      }

      const state = useAgentStore.getState();
      const existingEvents = state.eventsByRun[runId] || [];
      const afterId = existingEvents.length
        ? existingEvents[existingEvents.length - 1].id
        : undefined;

      try {
        const url = await buildAgentRunStreamUrl(runId, afterId);
        if (cancelled || sourcesRef.current.has(runId)) {
          return;
        }

        const source = new EventSource(url, { withCredentials: true });
        sourcesRef.current.set(runId, source);

        const handlePayload = (raw: string) => {
          const event = parseAgentStreamPayload(raw);
          if (!event) {
            return;
          }

          const store = useAgentStore.getState();

          switch (event.type) {
            case 'run.status':
              if (activeChatId) {
                store.upsertRun(activeChatId, event.run);
              }
              store.setStreamHealthy(runId, true);
              break;
            case 'run.event':
              store.appendRunEvents(runId, [event.event]);
              store.setStreamHealthy(runId, true);
              break;
            case 'assistant.delta':
              store.setStreamingAssistant(runId, event.delta.text);
              break;
            case 'assistant.clear':
              store.clearStreamingAssistant(runId);
              break;
            case 'assistant.done': {
              store.clearStreamingAssistant(runId);
              if (activeChatId) {
                const runSummary = store.runsByChat[activeChatId]?.find(item => item.id === runId);
                const chat = store.chats.find(item => item.id === activeChatId);
                store.upsertMessage(activeChatId, {
                  id: event.done.messageId,
                  chatId: activeChatId,
                  userId: runSummary?.userId ?? chat?.userId ?? 0,
                  role: 'assistant',
                  content: event.done.content,
                  mentions: [],
                  createdAt: new Date(),
                });
              }
              break;
            }
            case 'error':
              store.setStreamHealthy(runId, false);
              scheduleFallbackPoll();
              break;
            default:
              break;
          }
        };

        for (const type of AGENT_STREAM_EVENT_TYPES) {
          source.addEventListener(type, evt => {
            const message = evt as MessageEvent<string>;
            if (typeof message.data === 'string') {
              handlePayload(message.data);
            }
          });
        }

        source.onopen = () => {
          useAgentStore.getState().setStreamHealthy(runId, true);
        };

        source.onerror = () => {
          useAgentStore.getState().setStreamHealthy(runId, false);
          source.close();
          sourcesRef.current.delete(runId);
          scheduleFallbackPoll();

          if (!cancelled) {
            window.setTimeout(() => {
              void connectRun(runId);
            }, STREAM_RECONNECT_MS);
          }
        };
      } catch {
        useAgentStore.getState().setStreamHealthy(runId, false);
        scheduleFallbackPoll();
      }
    };

    const syncActiveRuns = () => {
      const runs = (useAgentStore.getState().runsByChat[activeChatId] || []).filter(run =>
        ACTIVE_RUN_STATUSES.has(run.status)
      );
      const activeRunIds = new Set(runs.map(run => run.id));

      for (const [runId, source] of sourcesRef.current.entries()) {
        if (!activeRunIds.has(runId)) {
          source.close();
          sourcesRef.current.delete(runId);
        }
      }

      for (const run of runs) {
        if (!sourcesRef.current.has(run.id)) {
          void connectRun(run.id);
        }
      }
    };

    syncActiveRuns();

    const unsubscribe = useAgentStore.subscribe((state, prevState) => {
      if (state.runsByChat[activeChatId] === prevState.runsByChat[activeChatId]) {
        return;
      }
      syncActiveRuns();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      for (const source of sources.values()) {
        source.close();
      }
      sources.clear();
    };
  }, [activeChatId]);
}
