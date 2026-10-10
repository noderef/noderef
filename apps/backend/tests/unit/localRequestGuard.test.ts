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
 * HTTP PoC/regression for the local request gate.
 *
 * Before the fix (recorded 2026-10-10 against cors.ts):
 * - Origin: null POST /rpc JSON → 200, ACAO "null", handler ran
 * - Origin: https://evil.example POST /rpc JSON → 200, handler ran (browser
 *   preflight would hide the body because ACAO was "null", but the server
 *   still executed the RPC)
 * - Host: evil.example POST /rpc → 200, handler ran
 * - text/plain POST /rpc → 415 (content-type), handler did not run
 * - text/plain POST /rpc-binary → 200, handler ran (simple request CSRF)
 * - GET /rpc-stream without Origin → 200, ACAO "*", handler ran
 */

import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setLaunchTokenForTests } from '../../src/lib/launchToken.js';
import { applySecurityMiddleware } from '../../src/middleware/security.js';
import { localRequestGuardMiddleware } from '../../src/middleware/requestGate.js';
import {
  webAuthLoginHandler,
  webAuthStatusHandler,
  webPasswordGateMiddleware,
} from '../../src/routes/webAuth.js';

const TOKEN = 'test-launch-token-aaaaaaaaaaaaaaaaaaaaaa';

interface ProbeApp {
  app: Express;
  rpcHits: { count: number };
}

function createProbeApp(): ProbeApp {
  const rpcHits = { count: 0 };
  const app = express();
  app.use(localRequestGuardMiddleware());
  applySecurityMiddleware(app);
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'noderef-backend' }));
  app.get('/auth/callback', (_req, res) => res.status(200).send('ok'));
  app.get('/web-auth/status', webAuthStatusHandler());
  app.post('/web-auth/login', express.json(), webAuthLoginHandler());
  app.use(webPasswordGateMiddleware());
  app.post('/rpc', (_req, res) => {
    rpcHits.count += 1;
    res.json({ ok: true, method: 'hit' });
  });
  app.post('/rpc-binary', (_req, res) => {
    rpcHits.count += 1;
    res.json({ ok: true, uploaded: true });
  });
  app.get('/rpc-stream', (_req, res) => {
    rpcHits.count += 1;
    res.json({ ok: true, streamed: true });
  });
  app.get('/rpc/agent/runs/1/stream', (_req, res) => {
    rpcHits.count += 1;
    res.json({ ok: true, sse: true });
  });
  return { app, rpcHits };
}

describe('localRequestGuard desktop', () => {
  const prevServeStatic = process.env.SERVE_STATIC;
  const prevPassword = process.env.WEB_PASSWORD;
  let probe: ProbeApp;

  beforeEach(() => {
    delete process.env.SERVE_STATIC;
    delete process.env.WEB_PASSWORD;
    setLaunchTokenForTests(TOKEN);
    probe = createProbeApp();
  });

  afterEach(() => {
    setLaunchTokenForTests(null);
    if (prevServeStatic === undefined) {
      delete process.env.SERVE_STATIC;
    } else {
      process.env.SERVE_STATIC = prevServeStatic;
    }
    if (prevPassword === undefined) {
      delete process.env.WEB_PASSWORD;
    } else {
      process.env.WEB_PASSWORD = prevPassword;
    }
  });

  it('rejects Origin: null POST /rpc without a token (sandboxed iframe)', async () => {
    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'null')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(probe.rpcHits.count).toBe(0);
  });

  it('rejects a foreign origin POST /rpc and does not run the handler', async () => {
    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    expect(probe.rpcHits.count).toBe(0);
  });

  it('rejects a DNS-rebinding Host header even with a valid token', async () => {
    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', 'evil.example')
      .set('Origin', 'http://evil.example')
      .set('X-NodeRef-Token', TOKEN)
      .set('Content-Type', 'application/json')
      .send({ method: 'alfresco.jsconsole.execute', params: {} });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_HOST');
    expect(probe.rpcHits.count).toBe(0);
  });

  it('rejects a simple text/plain POST /rpc-binary from a foreign origin', async () => {
    const res = await request(probe.app)
      .post('/rpc-binary')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'text/plain')
      .send('filedata=not-a-real-upload');

    expect(res.status).toBe(403);
    expect(probe.rpcHits.count).toBe(0);
  });

  it('rejects GET /rpc-stream without a token', async () => {
    const res = await request(probe.app)
      .get('/rpc-stream?method=nodes.getContent&nodeId=abc')
      .set('Host', '127.0.0.1:5111');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('LAUNCH_TOKEN_REQUIRED');
    expect(probe.rpcHits.count).toBe(0);
  });

  it('allows loopback origin + token on POST /rpc', async () => {
    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('X-NodeRef-Token', TOKEN)
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, method: 'hit' });
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    expect(probe.rpcHits.count).toBe(1);
  });

  it('allows Origin: null with a valid launch token (Neutralino fallback)', async () => {
    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'null')
      .set('X-NodeRef-Token', TOKEN)
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('null');
    expect(probe.rpcHits.count).toBe(1);
  });

  it('allows SSE/stream URLs authenticated via nr_token query', async () => {
    const res = await request(probe.app)
      .get('/rpc/agent/runs/1/stream?afterId=1&nr_token=' + TOKEN)
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'http://127.0.0.1:3000');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, sse: true });
    expect(probe.rpcHits.count).toBe(1);
  });

  it('rejects a wrong launch token', async () => {
    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('X-NodeRef-Token', 'wrong-token-bbbbbbbbbbbbbbbbbbbbbbbb')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('LAUNCH_TOKEN_REQUIRED');
    expect(probe.rpcHits.count).toBe(0);
  });

  it('keeps /health reachable without a token, including Origin: null', async () => {
    const res = await request(probe.app)
      .get('/health')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'null');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.headers['access-control-allow-origin']).toBe('null');
  });

  it('keeps the OIDC loopback callback working without a token', async () => {
    const res = await request(probe.app)
      .get('/auth/callback?code=abc&state=xyz')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'https://keycloak.example');

    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  it('answers CORS preflight from the Vite origin without a token', async () => {
    const res = await request(probe.app)
      .options('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-noderef-token');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'x-noderef-token'
    );
  });

  it('does not echo a foreign origin on preflight', async () => {
    const res = await request(probe.app)
      .options('/rpc')
      .set('Host', '127.0.0.1:5111')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('localRequestGuard Docker/SERVE_STATIC', () => {
  const prevServeStatic = process.env.SERVE_STATIC;
  const prevPassword = process.env.WEB_PASSWORD;

  afterEach(() => {
    setLaunchTokenForTests(null);
    if (prevServeStatic === undefined) {
      delete process.env.SERVE_STATIC;
    } else {
      process.env.SERVE_STATIC = prevServeStatic;
    }
    if (prevPassword === undefined) {
      delete process.env.WEB_PASSWORD;
    } else {
      process.env.WEB_PASSWORD = prevPassword;
    }
  });

  it('allows same-origin API calls without a launch token', async () => {
    process.env.SERVE_STATIC = '1';
    delete process.env.WEB_PASSWORD;
    setLaunchTokenForTests(null);
    const probe = createProbeApp();

    const res = await request(probe.app)
      .post('/rpc')
      .set('Host', 'noderef.example:5001')
      .set('Origin', 'http://noderef.example:5001')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(res.status).toBe(200);
    expect(probe.rpcHits.count).toBe(1);
  });

  it('rejects Origin: null and foreign origins in Docker mode', async () => {
    process.env.SERVE_STATIC = '1';
    delete process.env.WEB_PASSWORD;
    const probe = createProbeApp();

    const nullOrigin = await request(probe.app)
      .post('/rpc')
      .set('Host', 'noderef.example:5001')
      .set('Origin', 'null')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    const foreign = await request(probe.app)
      .post('/rpc')
      .set('Host', 'noderef.example:5001')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(nullOrigin.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(probe.rpcHits.count).toBe(0);
  });

  it('still requires WEB_PASSWORD for APIs when the gate is enabled', async () => {
    process.env.SERVE_STATIC = '1';
    process.env.WEB_PASSWORD = 'correct-horse';
    const probe = createProbeApp();

    const blocked = await request(probe.app)
      .post('/rpc')
      .set('Host', 'noderef.example:5001')
      .set('Origin', 'http://noderef.example:5001')
      .set('Content-Type', 'application/json')
      .send({ method: 'backend.servers.list', params: {} });

    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('WEB_PASSWORD_REQUIRED');
    expect(probe.rpcHits.count).toBe(0);

    const status = await request(probe.app)
      .get('/web-auth/status')
      .set('Host', 'noderef.example:5001')
      .set('Origin', 'http://noderef.example:5001');
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ required: true, authenticated: false });
  });
});
