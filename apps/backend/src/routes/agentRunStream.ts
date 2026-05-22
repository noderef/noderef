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

import type { AgentRunSummary, AgentStreamEvent } from '@app/contracts';
import type { RequestHandler } from 'express';
import { sendAppError } from '../lib/errorHandler.js';
import { AgentRepository } from '../repositories/agentRepository.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getCurrentUserId } from '../services/userBootstrap.js';
import { agentRunStreamBroker } from '../services/agent/AgentRunStreamBroker.js';

export interface AgentRunStreamOptions {
  getRunSummary: (userId: number, runId: number) => Promise<AgentRunSummary | null>;
}

function parseAfterId(req: {
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}): number | undefined {
  const queryAfter = req.query.afterId;
  if (typeof queryAfter === 'string' && /^\d+$/.test(queryAfter)) {
    return Number(queryAfter);
  }

  const lastEventId = req.headers['last-event-id'];
  const raw = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    return Number(raw);
  }

  return undefined;
}

export function agentRunStreamHandler(options: AgentRunStreamOptions): RequestHandler {
  return async (req, res) => {
    const runId = Number(req.params.runId);
    if (!Number.isFinite(runId) || runId <= 0) {
      return res.status(400).json({ message: 'Invalid run id' });
    }

    let userId: number;
    try {
      userId = await getCurrentUserId();
    } catch (error) {
      return sendAppError(res, error);
    }

    const run = await options.getRunSummary(userId, runId);
    if (!run) {
      return res.status(404).json({ message: 'Run not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: AgentStreamEvent, eventId?: number | string) => {
      if (res.writableEnded) {
        return;
      }
      if (eventId !== undefined) {
        res.write(`id: ${eventId}\n`);
      }
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    agentRunStreamBroker.beginReplay(runId);
    const unsubscribe = agentRunStreamBroker.subscribe(runId, res);

    send({ type: 'run.status', run });

    const prisma = await getPrismaClient();
    const repository = new AgentRepository(prisma);
    const afterId = parseAfterId(req);
    const replayEvents = await repository.listRunEvents(userId, runId, {
      afterId,
      maxItems: 500,
    });

    for (const event of replayEvents) {
      send({ type: 'run.event', event }, event.id);
    }

    const assistantBuffer = agentRunStreamBroker.getAssistantBuffer(runId);
    if (assistantBuffer && assistantBuffer.text) {
      send({
        type: 'assistant.delta',
        delta: {
          runId,
          sequence: assistantBuffer.sequence,
          delta: '',
          text: assistantBuffer.text,
        },
      });
    }

    agentRunStreamBroker.endReplay(runId);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    });
  };
}
