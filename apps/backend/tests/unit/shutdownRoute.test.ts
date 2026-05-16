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

import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { isShutdownRequestLoopback, registerShutdownRoute } from '../../src/lib/shutdownRoute.js';

describe('shutdownRoute', () => {
  describe('isShutdownRequestLoopback', () => {
    it('accepts IPv4 and IPv6 loopback forms', () => {
      expect(isShutdownRequestLoopback('127.0.0.1')).toBe(true);
      expect(isShutdownRequestLoopback('127.8.0.1')).toBe(true);
      expect(isShutdownRequestLoopback('::1')).toBe(true);
      expect(isShutdownRequestLoopback('::ffff:127.0.0.1')).toBe(true);
    });

    it('rejects non-loopback addresses', () => {
      expect(isShutdownRequestLoopback('10.0.0.1')).toBe(false);
      expect(isShutdownRequestLoopback('203.0.113.1')).toBe(false);
      expect(isShutdownRequestLoopback('::2')).toBe(false);
    });
  });

  it('POST /shutdown returns 200 for loopback (default supertest client)', async () => {
    const app = express();
    const trigger = vi.fn();
    registerShutdownRoute(app, trigger);

    const res = await request(app).post('/shutdown');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: 'Shutting down' });
  });

  it('POST /shutdown returns 403 when trust proxy exposes a non-loopback req.ip', async () => {
    const app = express();
    app.set('trust proxy', 1);
    registerShutdownRoute(app, vi.fn());

    const res = await request(app).post('/shutdown').set('X-Forwarded-For', '203.0.113.10');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
