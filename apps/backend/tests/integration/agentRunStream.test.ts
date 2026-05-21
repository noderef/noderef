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

import type { Express } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { agentRunStreamHandler } from '../../src/routes/agentRunStream.js';
import { AgentRepository } from '../../src/repositories/agentRepository.js';
import { AgentService } from '../../src/services/agent/AgentService.js';
import { ServerService } from '../../src/services/serverService.js';
import { resetTestUserId } from '../setup/app.js';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database.js';

let testUserId: number;

async function createTestApp(): Promise<Express> {
  const app = express();
  const serverService = new ServerService(prisma);
  const agentService = new AgentService(prisma, serverService);
  app.get(
    '/rpc/agent/runs/:runId/stream',
    agentRunStreamHandler({
      getRunSummary: (userId, runId) => agentService.getRunSummary(userId, runId),
    })
  );
  return app;
}

describe('agent run SSE stream', () => {
  beforeEach(async () => {
    resetTestUserId();
    await cleanupTables();
    testUserId = (await ensureTestUser()).id;
  });

  it('replays persisted events after afterId and rejects foreign runs', async () => {
    const serverService = new ServerService(prisma);
    const repository = new AgentRepository(prisma);
    const server = await serverService.create(testUserId, {
      name: 'Stream Server',
      baseUrl: 'http://alfresco.example.test',
    });
    const chat = await repository.createChat(testUserId, server.id, 'Stream chat');
    const run = await repository.createRun({
      chatId: chat.id,
      userId: testUserId,
      serverId: server.id,
      triggerMessageId: null,
      manifestVersion: 'test',
    });

    const first = await repository.createRunEvent({
      runId: run.id,
      type: 'run.note',
      level: 'info',
      payload: { text: 'Queued' },
    });
    await repository.createRunEvent({
      runId: run.id,
      type: 'run.note',
      level: 'info',
      payload: { text: 'Analyzing request' },
    });

    const app = await createTestApp();
    const response = await supertest(app)
      .get(`/rpc/agent/runs/${run.id}/stream`)
      .query({ afterId: first.id })
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('utf8');
        let body = '';
        res.on('data', chunk => {
          body += chunk;
          if (body.includes('Analyzing request')) {
            res.destroy();
            callback(null, body);
          }
        });
        res.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'ECONNRESET' && body.length > 0) {
            callback(null, body);
            return;
          }
          callback(error, body);
        });
      })
      .expect(200);

    expect(String(response.body)).toContain('Analyzing request');
    expect(String(response.body)).not.toContain('"text":"Queued"');

    await supertest(app).get('/rpc/agent/runs/999999/stream').expect(404);
  });
});
