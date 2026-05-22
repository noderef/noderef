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
 * Copyright 2025-2026 NodeRef
 */

import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { agentRunStreamBroker } from '../../src/services/agent/AgentRunStreamBroker.js';

function createMockResponse() {
  const chunks: string[] = [];
  const res = {
    writableEnded: false,
    destroyed: false,
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
  } as unknown as Response;
  return { res, chunks };
}

describe('agentRunStreamBroker', () => {
  it('publishes run.event payloads to subscribers', () => {
    const { res, chunks } = createMockResponse();
    const unsubscribe = agentRunStreamBroker.subscribe(42, res);

    agentRunStreamBroker.publish(
      42,
      {
        type: 'run.event',
        event: {
          id: 7,
          runId: 42,
          stepId: null,
          type: 'run.note',
          level: 'info',
          payload: { text: 'Analyzing request' },
          createdAt: new Date('2026-05-21T12:00:00.000Z'),
        },
      },
      7
    );

    expect(chunks.join('')).toContain('event: run.event');
    expect(chunks.join('')).toContain('"Analyzing request"');
    unsubscribe();
    expect(agentRunStreamBroker.getSubscriberCount(42)).toBe(0);
  });

  it('queues live publishes during replay and flushes after endReplay', () => {
    const { res, chunks } = createMockResponse();
    agentRunStreamBroker.beginReplay(55);
    const unsubscribe = agentRunStreamBroker.subscribe(55, res);

    agentRunStreamBroker.publish(
      55,
      {
        type: 'run.event',
        event: {
          id: 2,
          runId: 55,
          stepId: null,
          type: 'run.note',
          level: 'info',
          payload: { text: 'During replay' },
          createdAt: new Date('2026-05-21T12:00:00.000Z'),
        },
      },
      2
    );

    expect(chunks).toHaveLength(0);

    agentRunStreamBroker.endReplay(55);

    expect(chunks.join('')).toContain('During replay');
    unsubscribe();
  });

  it('buffers assistant deltas for reconnect', () => {
    agentRunStreamBroker.appendAssistantDelta(99, 'Hello');
    agentRunStreamBroker.appendAssistantDelta(99, ' world');

    const buffer = agentRunStreamBroker.getAssistantBuffer(99);
    expect(buffer?.text).toBe('Hello world');
    expect(buffer?.sequence).toBe(2);

    agentRunStreamBroker.clearAssistantBuffer(99);
    expect(agentRunStreamBroker.getAssistantBuffer(99)).toBeNull();
  });
});
