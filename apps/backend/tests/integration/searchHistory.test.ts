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
 * Integration Tests: backend.searchHistory.*
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.searchHistory', () => {
  let app: Express;
  let userId: number;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    resetTestUserId();
    await cleanupTables();
    const user = await ensureTestUser();
    userId = user.id;
  });

  describe('backend.searchHistory.create', () => {
    it('creates a new search history entry', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.searchHistory.create', { query: 'TYPE:"cm:content"' }));

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.query).toBe('TYPE:"cm:content"');
      expect(res.body.userId).toBe(userId);
    });

    it('creates entry with resultsCount', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.searchHistory.create', { query: 'my search', resultsCount: 42 }));

      expect(res.status).toBe(200);
      expect(res.body.resultsCount).toBe(42);
    });
  });

  describe('backend.searchHistory.list', () => {
    it('returns empty array when no history', async () => {
      const res = await request(app).post('/rpc').send(rpc('backend.searchHistory.list', {}));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns history in desc order by executedAt', async () => {
      await prisma.searchHistory.createMany({
        data: [
          { userId, query: 'first', executedAt: new Date('2024-01-01') },
          { userId, query: 'second', executedAt: new Date('2024-01-02') },
          { userId, query: 'third', executedAt: new Date('2024-01-03') },
        ],
      });

      const res = await request(app).post('/rpc').send(rpc('backend.searchHistory.list', {}));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].query).toBe('third');
      expect(res.body[2].query).toBe('first');
    });

    it('respects limit parameter', async () => {
      await prisma.searchHistory.createMany({
        data: Array.from({ length: 15 }, (_, i) => ({ userId, query: `query ${i}` })),
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.searchHistory.list', { limit: 5 }));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(5);
    });
  });
});
