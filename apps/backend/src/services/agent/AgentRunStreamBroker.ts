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

import type { AgentStreamEvent } from '@app/contracts';
import type { Response } from 'express';

type Subscriber = {
  res: Response;
  runId: number;
};

type AssistantBuffer = {
  text: string;
  sequence: number;
};

type QueuedPublish = {
  event: AgentStreamEvent;
  eventId?: number | string;
};

type RunStreamState = {
  subscribers: Set<Subscriber>;
  replaying: boolean;
  replayQueue: QueuedPublish[];
};

const streamStateByRun = new Map<number, RunStreamState>();
const assistantBuffersByRun = new Map<number, AssistantBuffer>();

function getOrCreateRunState(runId: number): RunStreamState {
  let state = streamStateByRun.get(runId);
  if (!state) {
    state = { subscribers: new Set(), replaying: false, replayQueue: [] };
    streamStateByRun.set(runId, state);
  }
  return state;
}

function formatSseEvent(event: AgentStreamEvent, eventId?: number | string): string {
  const lines: string[] = [];
  if (eventId !== undefined) {
    lines.push(`id: ${eventId}`);
  }
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify(event)}`);
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

function writeSse(res: Response, event: AgentStreamEvent, eventId?: number | string): void {
  res.write(formatSseEvent(event, eventId));
}

function removeSubscriber(runId: number, subscriber: Subscriber): void {
  const state = streamStateByRun.get(runId);
  if (!state) {
    return;
  }
  state.subscribers.delete(subscriber);
  if (state.subscribers.size === 0 && !state.replaying) {
    streamStateByRun.delete(runId);
  }
}

function deliverToSubscribers(runId: number, event: AgentStreamEvent, eventId?: number | string): void {
  const state = streamStateByRun.get(runId);
  if (!state?.subscribers.size) {
    return;
  }

  for (const subscriber of [...state.subscribers]) {
    if (subscriber.res.writableEnded || subscriber.res.destroyed) {
      removeSubscriber(runId, subscriber);
      continue;
    }
    try {
      writeSse(subscriber.res, event, eventId);
    } catch {
      removeSubscriber(runId, subscriber);
    }
  }
}

export const agentRunStreamBroker = {
  beginReplay(runId: number): void {
    const state = getOrCreateRunState(runId);
    state.replaying = true;
    state.replayQueue = [];
  },

  endReplay(runId: number): void {
    const state = streamStateByRun.get(runId);
    if (!state) {
      return;
    }
    state.replaying = false;
    const queued = state.replayQueue;
    state.replayQueue = [];
    for (const item of queued) {
      deliverToSubscribers(runId, item.event, item.eventId);
    }
    if (state.subscribers.size === 0) {
      streamStateByRun.delete(runId);
    }
  },

  subscribe(runId: number, res: Response): () => void {
    const state = getOrCreateRunState(runId);
    const subscriber: Subscriber = { res, runId };
    state.subscribers.add(subscriber);

    return () => {
      removeSubscriber(runId, subscriber);
    };
  },

  publish(runId: number, event: AgentStreamEvent, eventId?: number | string): void {
    const state = streamStateByRun.get(runId);
    if (!state?.subscribers.size) {
      return;
    }

    if (state.replaying) {
      state.replayQueue.push({ event, eventId });
      return;
    }

    deliverToSubscribers(runId, event, eventId);
  },

  appendAssistantDelta(runId: number, delta: string): AgentStreamEvent {
    const current = assistantBuffersByRun.get(runId) ?? { text: '', sequence: 0 };
    current.sequence += 1;
    current.text += delta;
    assistantBuffersByRun.set(runId, current);

    const streamEvent: AgentStreamEvent = {
      type: 'assistant.delta',
      delta: {
        runId,
        sequence: current.sequence,
        delta,
        text: current.text,
      },
    };
    this.publish(runId, streamEvent);
    return streamEvent;
  },

  getAssistantBuffer(runId: number): AssistantBuffer | null {
    return assistantBuffersByRun.get(runId) ?? null;
  },

  clearAssistantBuffer(runId: number): void {
    assistantBuffersByRun.delete(runId);
  },

  getSubscriberCount(runId: number): number {
    return streamStateByRun.get(runId)?.subscribers.size ?? 0;
  },
};
