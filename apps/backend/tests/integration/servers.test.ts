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
 * Integration Tests: backend.servers.*
 *
 * Tests CRUD operations for server management.
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.servers', () => {
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

  describe('backend.servers.create', () => {
    it('creates a new server', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.servers.create', {
            name: 'Production Server',
            baseUrl: 'http://alfresco.example.com',
            authType: 'basic',
            username: 'admin',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Production Server');
      expect(res.body.baseUrl).toBe('http://alfresco.example.com');
      // Password/token should NOT be returned (security)
      expect(res.body.token).toBeUndefined();
    });

    it('creates server with default serverType', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.servers.create', {
            name: 'Test Server',
            baseUrl: 'http://localhost:8080',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.serverType).toBe('alfresco');
    });
  });

  describe('backend.servers.list', () => {
    it('lists all servers for current user', async () => {
      // Create two servers
      await prisma.server.createMany({
        data: [
          { userId, name: 'Server A', baseUrl: 'http://a.example.com', displayOrder: 0 },
          { userId, name: 'Server B', baseUrl: 'http://b.example.com', displayOrder: 1 },
        ],
      });

      const res = await request(app).post('/rpc').send(rpc('backend.servers.list', {}));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Server A');
      expect(res.body[1].name).toBe('Server B');
    });

    it('returns empty array when no servers exist', async () => {
      const res = await request(app).post('/rpc').send(rpc('backend.servers.list', {}));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('backend.servers.get', () => {
    it('retrieves a server by ID', async () => {
      const server = await prisma.server.create({
        data: { userId, name: 'My Server', baseUrl: 'http://my.server.com' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.servers.get', { id: server.id }));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(server.id);
      expect(res.body.name).toBe('My Server');
    });

    it('returns null for non-existent server', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.servers.get', { id: 99999 }));

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('backend.servers.update', () => {
    it('updates server name', async () => {
      const server = await prisma.server.create({
        data: { userId, name: 'Old Name', baseUrl: 'http://old.url.com' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.servers.update', {
            id: server.id,
            name: 'New Name',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
      expect(res.body.baseUrl).toBe('http://old.url.com'); // Unchanged
    });

    it('updates multiple fields at once', async () => {
      const server = await prisma.server.create({
        data: { userId, name: 'Server', baseUrl: 'http://old.com' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.servers.update', {
            id: server.id,
            name: 'Updated Server',
            baseUrl: 'http://new.com',
            label: 'PROD',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Server');
      expect(res.body.baseUrl).toBe('http://new.com');
      expect(res.body.label).toBe('PROD');
    });

    it('persists insight range preference', async () => {
      const server = await prisma.server.create({
        data: { userId, name: 'Insights Server', baseUrl: 'http://insights.example.com' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.servers.update', {
            id: server.id,
            insightRangeDays: 30,
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.insightRangeDays).toBe(30);

      const updated = await prisma.server.findUnique({ where: { id: server.id } });
      expect(updated?.insightRangeDays).toBe(30);
    });
  });

  describe('backend.servers.delete', () => {
    it('deletes an existing server', async () => {
      const server = await prisma.server.create({
        data: { userId, name: 'To Delete', baseUrl: 'http://delete.me' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.servers.delete', { id: server.id }));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const deleted = await prisma.server.findUnique({ where: { id: server.id } });
      expect(deleted).toBeNull();
    });
  });

  describe('backend.servers.reorder', () => {
    it('reorders servers by displayOrder', async () => {
      const [a, b, c] = await Promise.all([
        prisma.server.create({ data: { userId, name: 'A', baseUrl: 'http://a', displayOrder: 0 } }),
        prisma.server.create({ data: { userId, name: 'B', baseUrl: 'http://b', displayOrder: 1 } }),
        prisma.server.create({ data: { userId, name: 'C', baseUrl: 'http://c', displayOrder: 2 } }),
      ]);

      // Reverse order: C, B, A
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.servers.reorder', {
            orders: [
              { id: c.id, displayOrder: 0 },
              { id: b.id, displayOrder: 1 },
              { id: a.id, displayOrder: 2 },
            ],
          })
        );

      expect(res.status).toBe(200);

      // Verify new order
      const servers = await prisma.server.findMany({
        where: { userId },
        orderBy: { displayOrder: 'asc' },
      });
      expect(servers[0].name).toBe('C');
      expect(servers[1].name).toBe('B');
      expect(servers[2].name).toBe('A');
    });
  });
});
