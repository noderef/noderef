/**
 * Copyright 2025 NodeRef
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
 * Integration Tests: backend.jsconsole.* (local-only methods)
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.jsconsole', () => {
  let app: Express;
  let userId: number;
  let serverId: number;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    resetTestUserId();
    await cleanupTables();
    const user = await ensureTestUser();
    userId = user.id;

    const server = await prisma.server.create({
      data: { userId, name: 'Test Server', baseUrl: 'http://localhost:8080' },
    });
    serverId = server.id;
  });

  describe('backend.jsconsole.getHistory', () => {
    it('returns empty list when no history', async () => {
      const res = await request(app).post('/rpc').send(rpc('backend.jsconsole.getHistory', {}));

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.hasMore).toBe(false);
    });

    it('returns script execution history', async () => {
      await prisma.jsConsoleHistory.createMany({
        data: [
          { userId, serverId, script: 'print("one")', output: 'one' },
          { userId, serverId, script: 'print("two")', output: 'two' },
        ],
      });

      const res = await request(app).post('/rpc').send(rpc('backend.jsconsole.getHistory', {}));

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
    });

    it('respects limit and returns pagination info', async () => {
      await prisma.jsConsoleHistory.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          userId,
          serverId,
          script: `script ${i}`,
        })),
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.jsconsole.getHistory', { limit: 3 }));

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeDefined();
    });
  });
});
