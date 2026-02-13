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
 * Integration Tests: backend.nodeHistory.*
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.nodeHistory', () => {
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

  describe('backend.nodeHistory.activity', () => {
    it('returns empty timeline when no history', async () => {
      const res = await request(app).post('/rpc').send(rpc('backend.nodeHistory.activity', {}));

      expect(res.status).toBe(200);
      expect(res.body.timeline).toEqual([]);
      expect(res.body.heatmap).toBeDefined();
    });

    it('returns activity timeline', async () => {
      await prisma.nodeHistory.createMany({
        data: [
          { userId, serverId, nodeRef: 'workspace://node1', name: 'Document 1' },
          { userId, serverId, nodeRef: 'workspace://node2', name: 'Document 2' },
        ],
      });

      const res = await request(app).post('/rpc').send(rpc('backend.nodeHistory.activity', {}));

      expect(res.status).toBe(200);
      expect(res.body.timeline).toHaveLength(2);
      const names = res.body.timeline.map((t: any) => t.name).sort();
      expect(names).toEqual(['Document 1', 'Document 2']);
    });

    it('filters by serverId', async () => {
      const server2 = await prisma.server.create({
        data: { userId, name: 'Other Server', baseUrl: 'http://other:8080' },
      });

      await prisma.nodeHistory.createMany({
        data: [
          { userId, serverId, nodeRef: 'workspace://node1', name: 'Doc on Server 1' },
          { userId, serverId: server2.id, nodeRef: 'workspace://node2', name: 'Doc on Server 2' },
        ],
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.nodeHistory.activity', { serverId }));

      expect(res.status).toBe(200);
      expect(res.body.timeline).toHaveLength(1);
      expect(res.body.timeline[0].name).toBe('Doc on Server 1');
    });

    it('returns heatmap data', async () => {
      await prisma.nodeHistory.create({
        data: { userId, serverId, nodeRef: 'workspace://node1', name: 'Doc' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.nodeHistory.activity', { days: 7 }));

      expect(res.status).toBe(200);
      expect(res.body.heatmap).toHaveLength(7);
      const today = res.body.heatmap[res.body.heatmap.length - 1];
      expect(today.count).toBe(1);
    });
  });
});
