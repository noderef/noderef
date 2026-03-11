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
 * Integration Tests: backend.serverInsights.*
 *
 * Tests CRUD operations for insight graphs.
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.serverInsights', () => {
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

  describe('backend.serverInsights.createGraph', () => {
    it('creates a new insight graph', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.serverInsights.createGraph', {
            serverId,
            title: 'Content by Created Date',
            filterQuery: 'TYPE:"cm:content"',
            dateField: 'cm:created',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Content by Created Date');
      expect(res.body.serverId).toBe(serverId);
      expect(res.body.filterQuery).toBe('TYPE:"cm:content"');
      expect(res.body.dateField).toBe('cm:created');
      expect(res.body.color).toBe('#228be6');
      expect(res.body.columnSpan).toBe(1);
    });

    it('creates a graph with custom color and columnSpan', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.serverInsights.createGraph', {
            serverId,
            title: 'Wide Graph',
            filterQuery: 'TYPE:"cm:folder"',
            dateField: 'cm:modified',
            color: '#fa5252',
            columnSpan: 2,
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.color).toBe('#fa5252');
      expect(res.body.columnSpan).toBe(2);
    });

    it('rejects graph without title', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.serverInsights.createGraph', {
            serverId,
            title: '',
            filterQuery: 'TYPE:"cm:content"',
            dateField: 'cm:created',
          })
        );

      expect(res.status).not.toBe(200);
    });
  });

  describe('backend.serverInsights.listGraphs', () => {
    it('lists all insight graphs for a server', async () => {
      await prisma.insightGraph.createMany({
        data: [
          {
            userId,
            serverId,
            title: 'Graph A',
            filterQuery: 'TYPE:"cm:content"',
            dateField: 'cm:created',
          },
          {
            userId,
            serverId,
            title: 'Graph B',
            filterQuery: 'TYPE:"cm:folder"',
            dateField: 'cm:modified',
          },
        ],
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.serverInsights.listGraphs', { serverId }));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('does not return graphs from other servers', async () => {
      const server2 = await prisma.server.create({
        data: { userId, name: 'Server 2', baseUrl: 'http://server2:8080' },
      });

      await prisma.insightGraph.create({
        data: {
          userId,
          serverId,
          title: 'Graph on Server 1',
          filterQuery: 'q1',
          dateField: 'cm:created',
        },
      });
      await prisma.insightGraph.create({
        data: {
          userId,
          serverId: server2.id,
          title: 'Graph on Server 2',
          filterQuery: 'q2',
          dateField: 'cm:created',
        },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.serverInsights.listGraphs', { serverId }));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Graph on Server 1');
    });
  });

  describe('backend.serverInsights.updateGraph', () => {
    it('updates graph title', async () => {
      const graph = await prisma.insightGraph.create({
        data: {
          userId,
          serverId,
          title: 'Old Title',
          filterQuery: 'q',
          dateField: 'cm:created',
        },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.serverInsights.updateGraph', {
            id: graph.id,
            title: 'New Title',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('New Title');
    });

    it('updates filterQuery and invalidates stale snapshots', async () => {
      const graph = await prisma.insightGraph.create({
        data: {
          userId,
          serverId,
          title: 'Test',
          filterQuery: 'old query',
          dateField: 'cm:created',
        },
      });

      // Create a snapshot with old query hash
      await prisma.insightSnapshot.create({
        data: {
          graphId: graph.id,
          bucketDate: '2026-01-01',
          queryHash: 'oldhash1234567890',
          totalItems: 42,
        },
      });

      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.serverInsights.updateGraph', {
            id: graph.id,
            filterQuery: 'new query',
          })
        );

      expect(res.status).toBe(200);
      expect(res.body.filterQuery).toBe('new query');

      // Verify old snapshots were cleaned up
      const remaining = await prisma.insightSnapshot.findMany({
        where: { graphId: graph.id },
      });
      expect(remaining).toHaveLength(0);
    });
  });

  describe('backend.serverInsights.deleteGraph', () => {
    it('deletes an insight graph', async () => {
      const graph = await prisma.insightGraph.create({
        data: {
          userId,
          serverId,
          title: 'To Delete',
          filterQuery: 'q',
          dateField: 'cm:created',
        },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.serverInsights.deleteGraph', { id: graph.id }));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await prisma.insightGraph.findUnique({ where: { id: graph.id } });
      expect(deleted).toBeNull();
    });

    it('cascades delete to snapshots', async () => {
      const graph = await prisma.insightGraph.create({
        data: {
          userId,
          serverId,
          title: 'With Snapshots',
          filterQuery: 'q',
          dateField: 'cm:created',
        },
      });

      await prisma.insightSnapshot.create({
        data: {
          graphId: graph.id,
          bucketDate: '2026-01-01',
          queryHash: 'hash1234567890ab',
          totalItems: 10,
        },
      });

      await request(app)
        .post('/rpc')
        .send(rpc('backend.serverInsights.deleteGraph', { id: graph.id }));

      const remainingSnapshots = await prisma.insightSnapshot.findMany({
        where: { graphId: graph.id },
      });
      expect(remainingSnapshots).toHaveLength(0);
    });
  });
});
