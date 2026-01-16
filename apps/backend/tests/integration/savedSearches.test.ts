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
 * Integration Tests: backend.savedSearches.*
 *
 * Tests CRUD operations for saved searches.
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.savedSearches', () => {
  let app: Express;
  let userId: number;
  let serverId: number;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    resetTestUserId(); // Reset cached user ID
    await cleanupTables();
    const user = await ensureTestUser();
    userId = user.id;

    // Create a server for saved searches
    const server = await prisma.server.create({
      data: { userId, name: 'Test Server', baseUrl: 'http://localhost:8080' },
    });
    serverId = server.id;
  });

  describe('backend.savedSearches.create', () => {
    it('creates a new saved search', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.savedSearches.create', {
            serverId,
            name: 'Find Large Files',
            query: 'TYPE:"cm:content" AND @cm\\:content.size:[1000000 TO MAX]',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Find Large Files');
      expect(res.body.serverId).toBe(serverId);
    });

    it('creates a default saved search', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.savedSearches.create', {
            serverId,
            name: 'Default Search',
            query: 'TYPE:"cm:folder"',
            isDefault: true,
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.isDefault).toBe(true);
    });
  });

  describe('backend.savedSearches.list', () => {
    it('lists all saved searches for user', async () => {
      // Create two saved searches
      await prisma.savedSearch.createMany({
        data: [
          { userId, serverId, name: 'Search A', query: 'TYPE:"cm:content"' },
          { userId, serverId, name: 'Search B', query: 'TYPE:"cm:folder"' },
        ],
      });

      const res = await request(app).post('/rpc').send(rpc('backend.savedSearches.list', {}));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('filters by serverId when provided', async () => {
      // Create another server
      const server2 = await prisma.server.create({
        data: { userId, name: 'Server 2', baseUrl: 'http://server2:8080' },
      });

      // Create searches on different servers
      await prisma.savedSearch.create({
        data: { userId, serverId, name: 'Search on Server 1', query: 'q1' },
      });
      await prisma.savedSearch.create({
        data: { userId, serverId: server2.id, name: 'Search on Server 2', query: 'q2' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.savedSearches.list', { serverId }));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Search on Server 1');
    });
  });

  describe('backend.savedSearches.get', () => {
    it('retrieves a saved search by ID', async () => {
      const search = await prisma.savedSearch.create({
        data: { userId, serverId, name: 'My Search', query: 'TYPE:"cm:content"' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.savedSearches.get', { id: search.id }));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(search.id);
      expect(res.body.name).toBe('My Search');
    });
  });

  describe('backend.savedSearches.update', () => {
    it('updates saved search name', async () => {
      const search = await prisma.savedSearch.create({
        data: { userId, serverId, name: 'Old Name', query: 'q' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.savedSearches.update', {
            id: search.id,
            name: 'New Name',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('updates query and columns', async () => {
      const search = await prisma.savedSearch.create({
        data: { userId, serverId, name: 'Test', query: 'old query' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.savedSearches.update', {
            id: search.id,
            query: 'new query',
            columns: 'name,modified,size',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.query).toBe('new query');
      expect(res.body.columns).toBe('name,modified,size');
    });
  });

  describe('backend.savedSearches.delete', () => {
    it('deletes a saved search', async () => {
      const search = await prisma.savedSearch.create({
        data: { userId, serverId, name: 'To Delete', query: 'q' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.savedSearches.delete', { id: search.id }));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const deleted = await prisma.savedSearch.findUnique({ where: { id: search.id } });
      expect(deleted).toBeNull();
    });
  });
});
