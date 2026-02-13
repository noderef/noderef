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
 * Integration Tests: backend.user.*
 *
 * Tests user profile operations.
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.user', () => {
  let app: Express;
  let userId: number;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    resetTestUserId(); // Reset cached user ID
    await cleanupTables();
    const user = await ensureTestUser();
    userId = user.id;
  });

  describe('backend.user.get', () => {
    it('retrieves current user profile', async () => {
      const res = await request(app).post('/rpc').send(rpc('backend.user.get', {}));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userId);
      expect(res.body.username).toBe('testuser');
      expect(res.body.email).toBe('test@example.com');
    });

    it('returns user with fullName when set', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { fullName: 'Test User' },
      });

      const res = await request(app).post('/rpc').send(rpc('backend.user.get', {}));

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe('Test User');
    });
  });

  describe('backend.user.update', () => {
    it('updates fullName', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.user.update', {
            fullName: 'John Doe',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify update
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.fullName).toBe('John Doe');
    });

    it('clears fullName when set to null', async () => {
      // Set initial value
      await prisma.user.update({
        where: { id: userId },
        data: { fullName: 'Initial Name' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.user.update', {
            fullName: null,
          })
        );

      expect(res.status).toBe(200);

      // Verify cleared
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.fullName).toBeNull();
    });
  });
});
