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
 * Integration Tests: backend.localFiles.*
 */

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestApp, resetTestUserId, rpc } from '../setup/app';
import { cleanupTables, ensureTestUser, prisma } from '../setup/database';

describe('backend.localFiles', () => {
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

  describe('backend.localFiles.create', () => {
    it('creates a new local file', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(
          rpc('backend.localFiles.create', { name: 'my-script.js', content: 'console.log("hi")' })
        );

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('my-script.js');
      expect(res.body.content).toBe('console.log("hi")');
    });

    it('creates file with default type', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.localFiles.create', { name: 'test.txt' }));

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('text/plain');
    });
  });

  describe('backend.localFiles.list', () => {
    it('returns empty when no files', async () => {
      const res = await request(app).post('/rpc').send(rpc('backend.localFiles.list', {}));

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('lists files for the user', async () => {
      await prisma.localFile.createMany({
        data: [
          { userId, name: 'file1.js', type: 'javascript', content: '// first' },
          { userId, name: 'file2.js', type: 'javascript', content: '// second' },
        ],
      });

      const res = await request(app).post('/rpc').send(rpc('backend.localFiles.list', {}));

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('filters by search term', async () => {
      await prisma.localFile.createMany({
        data: [
          { userId, name: 'alfresco-utils.js', type: 'javascript', content: '' },
          { userId, name: 'node-helper.js', type: 'javascript', content: '' },
        ],
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.localFiles.list', { search: 'alfresco' }));

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('alfresco-utils.js');
    });
  });

  describe('backend.localFiles.update', () => {
    it('updates file content', async () => {
      const file = await prisma.localFile.create({
        data: { userId, name: 'test.js', type: 'javascript', content: 'old' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.localFiles.update', { id: file.id, content: 'new content' }));

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('new content');
      expect(res.body.name).toBe('test.js'); // unchanged
    });

    it('updates file name', async () => {
      const file = await prisma.localFile.create({
        data: { userId, name: 'old-name.js', type: 'javascript', content: '' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.localFiles.update', { id: file.id, name: 'new-name.js' }));

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('new-name.js');
    });
  });

  describe('backend.localFiles.delete', () => {
    it('soft deletes a file', async () => {
      const file = await prisma.localFile.create({
        data: { userId, name: 'to-delete.js', type: 'javascript', content: '' },
      });

      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.localFiles.delete', { id: file.id }));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify soft delete
      const deleted = await prisma.localFile.findUnique({ where: { id: file.id } });
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('returns false for non-existent file', async () => {
      const res = await request(app)
        .post('/rpc')
        .send(rpc('backend.localFiles.delete', { id: 99999 }));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });
  });
});
