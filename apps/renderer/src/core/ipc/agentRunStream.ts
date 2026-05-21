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
import { getRpcBaseUrl, waitForBackend } from './rpc.js';

export async function buildAgentRunStreamUrl(runId: number, afterId?: number): Promise<string> {
  await waitForBackend();
  const baseUrl = getRpcBaseUrl();
  const params = new URLSearchParams();
  if (afterId !== undefined && afterId > 0) {
    params.set('afterId', String(afterId));
  }
  const query = params.toString();
  return `${baseUrl}/rpc/agent/runs/${runId}/stream${query ? `?${query}` : ''}`;
}

export function parseAgentStreamPayload(raw: string): AgentStreamEvent | null {
  try {
    const parsed = JSON.parse(raw) as AgentStreamEvent;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const AGENT_STREAM_EVENT_TYPES: AgentStreamEvent['type'][] = [
  'run.status',
  'run.event',
  'step.started',
  'step.completed',
  'assistant.delta',
  'assistant.clear',
  'assistant.done',
  'error',
];
