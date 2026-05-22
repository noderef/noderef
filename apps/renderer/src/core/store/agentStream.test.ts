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

import { describe, expect, it, beforeEach } from 'vitest';
import { useAgentStore } from './agent';

describe('agent store streaming', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it('dedupes appended run events by id', () => {
    const runId = 10;
    const event = {
      id: 1,
      runId,
      stepId: null,
      type: 'run.note',
      level: 'info' as const,
      payload: { text: 'Queued' },
      createdAt: new Date(),
    };

    useAgentStore.getState().appendRunEvents(runId, [event]);
    useAgentStore.getState().appendRunEvents(runId, [event]);

    expect(useAgentStore.getState().eventsByRun[runId]).toHaveLength(1);
  });

  it('clears streaming assistant text on assistant.clear', () => {
    useAgentStore.getState().setStreamingAssistant(6, 'Partial');
    useAgentStore.getState().clearStreamingAssistant(6);
    expect(useAgentStore.getState().streamingAssistantByRun[6]).toBeUndefined();
  });

  it('tracks streaming assistant text and clears on done', () => {
    useAgentStore.getState().setStreamingAssistant(5, 'Hello');
    expect(useAgentStore.getState().streamingAssistantByRun[5]).toBe('Hello');

    useAgentStore.getState().clearStreamingAssistant(5);
    expect(useAgentStore.getState().streamingAssistantByRun[5]).toBeUndefined();
  });
});
