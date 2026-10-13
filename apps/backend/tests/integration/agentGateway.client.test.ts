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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentGatewayService } from '../../src/services/agentGateway/agentGatewayService.js';
import {
  getAgentGatewayRuntime,
  resetAgentGatewayRuntimeForTests,
} from '../../src/services/agentGateway/gatewayRuntime.js';
import { serializeMcpSettings } from '../../src/services/agentGateway/mcpSettings.js';
import { ServerService } from '../../src/services/serverService.js';
import { encryptSecret } from '../../src/lib/encryption.js';
import { startFakeMcpGateway, type FakeMcpGateway } from '../fixtures/fakeMcpGateway.js';
import { cleanupTables, prisma } from '../setup/database.js';

function jwt(sub: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `${header}.${payload}.sig`;
}

vi.mock('../../src/services/alfresco/oidcTicketService.js', () => ({
  refreshOidcTokens: vi.fn(async () => ({
    accessToken: jwt('subject-1'),
    refreshToken: 'refreshed-refresh',
    expiresIn: 3600,
  })),
  exchangeOidcTokenForTicket: vi.fn(),
}));

describe('agent gateway client', () => {
  let gateway: FakeMcpGateway | null = null;
  const createdGateways: FakeMcpGateway[] = [];

  beforeEach(async () => {
    resetAgentGatewayRuntimeForTests();
    await cleanupTables();
  });

  afterEach(async () => {
    resetAgentGatewayRuntimeForTests();
    await Promise.all(createdGateways.map(item => item.close().catch(() => undefined)));
    createdGateways.length = 0;
    gateway = null;
  });

  async function bootGateway(options?: Parameters<typeof startFakeMcpGateway>[0]) {
    const started = await startFakeMcpGateway(options);
    createdGateways.push(started);
    gateway = started;
    return started;
  }

  function services() {
    const serverService = new ServerService(prisma);
    const runtime = getAgentGatewayRuntime(prisma, serverService);
    const gatewayService = new AgentGatewayService(
      prisma,
      serverService,
      runtime.config,
      runtime.credentials,
      runtime.sessions
    );
    return { serverService, runtime, gatewayService };
  }

  async function seedServer(
    username: string,
    creds: {
      authType?: string;
      username?: string | null;
      token: string;
      refreshToken?: string;
      tokenExpiry?: Date;
      oidcHost?: string;
      oidcRealm?: string;
      oidcClientId?: string;
    }
  ) {
    const user = await prisma.user.create({
      data: { username, email: `${username}@example.test` },
    });
    const { serverService, runtime } = services();
    const server = await serverService.create(user.id, {
      name: `${username}-server`,
      baseUrl: 'http://alfresco.example.test',
      authType: creds.authType ?? 'basic',
      username: creds.username ?? username,
      token: creds.token,
      refreshToken: creds.refreshToken,
      tokenExpiry: creds.tokenExpiry,
      oidcHost: creds.oidcHost,
      oidcRealm: creds.oidcRealm,
      oidcClientId: creds.oidcClientId,
    });
    await runtime.config.save(user.id, server.id, {
      enabled: true,
      endpointUrl: gateway!.url,
      apiKey: 'gw-secret',
    });
    return { user, server, runtime };
  }

  it('isolates sessions across users and servers and keeps invalidate local', async () => {
    await bootGateway();
    const users = await Promise.all([
      prisma.user.create({ data: { username: 'u1', email: 'u1@example.test' } }),
      prisma.user.create({ data: { username: 'u2', email: 'u2@example.test' } }),
    ]);
    const { serverService, runtime } = services();
    const servers = [];
    for (const user of users) {
      for (const index of [1, 2]) {
        const server = await serverService.create(user.id, {
          name: `${user.username}-${index}`,
          baseUrl: 'http://alfresco.example.test',
          authType: 'basic',
          username: `${user.username}-${index}`,
          token: `pass-${user.username}-${index}`,
        });
        await runtime.config.save(user.id, server.id, {
          enabled: true,
          endpointUrl: gateway!.url,
          apiKey: 'gw-secret',
        });
        servers.push({ user, server });
      }
    }

    for (const item of servers) {
      const config = await runtime.config.getDecrypted(item.user.id, item.server.id);
      await runtime.sessions.getCatalog({
        userId: item.user.id,
        serverId: item.server.id,
        serverBaseUrl: item.server.baseUrl,
        endpointUrl: config!.endpointUrl!,
        apiKey: config!.apiKey!,
        apiKeyCiphertext: config!.apiKeyCiphertext,
        configVersion: config!.configVersion,
        mode: 'withAlfresco',
      });
    }

    expect(runtime.sessions.sessionCount()).toBe(4);
    const auths = gateway!.requests
      .filter(req => req.headers['x-alfresco-authorization'])
      .map(req => req.headers['x-alfresco-authorization']);
    expect(new Set(auths).size).toBe(4);

    await runtime.sessions.invalidate(servers[0].user.id, servers[0].server.id);
    expect(runtime.sessions.sessionCount()).toBe(3);
  });

  it('sends basic and bearer Alfresco headers and refreshes OIDC without reconnecting', async () => {
    await bootGateway();
    const { user, server, runtime } = await seedServer('basic-user', {
      token: 'basic-secret',
    });
    const config = await runtime.config.getDecrypted(user.id, server.id);
    await runtime.sessions.getCatalog({
      userId: user.id,
      serverId: server.id,
      serverBaseUrl: server.baseUrl,
      endpointUrl: config!.endpointUrl!,
      apiKey: config!.apiKey!,
      apiKeyCiphertext: config!.apiKeyCiphertext,
      configVersion: config!.configVersion,
      mode: 'withAlfresco',
    });
    const basic = gateway!.requests.find(req => req.headers['x-alfresco-authorization']);
    expect(basic?.headers.authorization).toBe('Bearer gw-secret');
    expect(basic?.headers['x-alfresco-authorization']).toBe(
      `Basic ${Buffer.from('basic-user:basic-secret').toString('base64')}`
    );

    const oidcUser = await prisma.user.create({
      data: { username: 'oidc-user', email: 'oidc@example.test' },
    });
    const { serverService } = services();
    const oidcServer = await serverService.create(oidcUser.id, {
      name: 'oidc',
      baseUrl: 'http://alfresco.example.test',
      authType: 'openid_connect',
      username: null,
      token: jwt('subject-1'),
      refreshToken: 'refresh-old',
      tokenExpiry: new Date(Date.now() + 60_000),
      oidcHost: 'http://keycloak.example.test',
      oidcRealm: 'alfresco',
      oidcClientId: 'noderef',
    });
    await runtime.config.save(oidcUser.id, oidcServer.id, {
      enabled: true,
      endpointUrl: gateway!.url,
      apiKey: 'gw-secret',
    });
    const oidcConfig = await runtime.config.getDecrypted(oidcUser.id, oidcServer.id);
    const connect = {
      userId: oidcUser.id,
      serverId: oidcServer.id,
      serverBaseUrl: oidcServer.baseUrl,
      endpointUrl: oidcConfig!.endpointUrl!,
      apiKey: oidcConfig!.apiKey!,
      apiKeyCiphertext: oidcConfig!.apiKeyCiphertext,
      configVersion: oidcConfig!.configVersion,
      mode: 'withAlfresco' as const,
    };
    await runtime.sessions.getCatalog(connect);
    await runtime.sessions.getCatalog(connect);
    const oidcAuths = gateway!.requests
      .filter(req => req.headers['x-alfresco-authorization']?.startsWith('Bearer '))
      .map(req => req.headers['x-alfresco-authorization']);
    expect(oidcAuths.some(value => value === `Bearer ${jwt('subject-1')}`)).toBe(true);
    expect(runtime.sessions.sessionCount()).toBe(2);
  });

  it('does not send Alfresco credentials on an unsaved test connection', async () => {
    await bootGateway();
    const { user, server, gatewayService } = await seedServer('tester', {
      token: 'keep-secret',
    }).then(async seeded => ({ ...seeded, ...services() }));
    const result = await gatewayService.testConnection(user.id, server.id, {
      enabled: true,
      endpointUrl: gateway!.url,
      apiKey: 'gw-secret',
    });
    expect(result.status).toBe('connected');
    expect(gateway!.requests.every(req => !req.headers['x-alfresco-authorization'])).toBe(true);
    expect(result.protocolVersion).toMatch(/^2025-/);
  });

  it('pages tool lists, sets truncated, and skips list calls without capabilities', async () => {
    const paged = await bootGateway({ paginatedToolCount: 510, pageSize: 20 });
    const { user, server, runtime } = await seedServer('pager', { token: 'pass' });
    const config = await runtime.config.getDecrypted(user.id, server.id);
    const catalog = await runtime.sessions.getCatalog({
      userId: user.id,
      serverId: server.id,
      serverBaseUrl: server.baseUrl,
      endpointUrl: config!.endpointUrl!,
      apiKey: config!.apiKey!,
      apiKeyCiphertext: config!.apiKeyCiphertext,
      configVersion: config!.configVersion,
      mode: 'withAlfresco',
    });
    expect(catalog.truncated).toBe(true);
    expect(catalog.tools).toHaveLength(500);

    await paged.close();
    createdGateways.length = 0;
    const empty = await bootGateway({
      capabilities: { tools: false, prompts: false, resources: false },
    });
    await runtime.config.save(user.id, server.id, {
      enabled: true,
      endpointUrl: empty.url,
      apiKey: 'gw-secret',
    });
    await runtime.sessions.invalidate(user.id, server.id);
    const emptyConfig = await runtime.config.getDecrypted(user.id, server.id);
    const emptyCatalog = await runtime.sessions.getCatalog({
      userId: user.id,
      serverId: server.id,
      serverBaseUrl: server.baseUrl,
      endpointUrl: emptyConfig!.endpointUrl!,
      apiKey: emptyConfig!.apiKey!,
      apiKeyCiphertext: emptyConfig!.apiKeyCiphertext,
      configVersion: emptyConfig!.configVersion,
      mode: 'withAlfresco',
    });
    expect(emptyCatalog.tools).toEqual([]);
    expect(emptyCatalog.prompts).toEqual([]);
    expect(empty.requests.some(req => req.jsonRpcMethod === 'tools/list')).toBe(false);
  });

  it('refetches after list_changed and supports tools and prompts', async () => {
    await bootGateway();
    const { user, server, runtime, gatewayService } = await seedServer('catalog', {
      token: 'pass',
    }).then(async seeded => ({ ...seeded, ...services() }));
    const chat = await prisma.agentChat.create({
      data: {
        userId: user.id,
        serverId: server.id,
        title: 'Chat',
        mcpSettingsJson: serializeMcpSettings({ enabled: true, tools: ['echo_read'] }),
      },
    });
    const first = await gatewayService.getCatalog(user.id, server.id, true);
    expect(first.tools.some(tool => tool.name === 'echo_read')).toBe(true);
    expect(first.protocolVersion).toMatch(/^2025-/);
    gateway!.sendToolListChanged();
    const second = await gatewayService.getCatalog(user.id, server.id, true);
    expect(second.status).toBe('connected');
    expect(second.tools.length).toBeGreaterThan(0);

    const config = await runtime.config.getDecrypted(user.id, server.id);
    const connect = {
      userId: user.id,
      serverId: server.id,
      serverBaseUrl: server.baseUrl,
      endpointUrl: config!.endpointUrl!,
      apiKey: config!.apiKey!,
      apiKeyCiphertext: config!.apiKeyCiphertext,
      configVersion: config!.configVersion,
      mode: 'withAlfresco' as const,
    };
    const tool = await runtime.sessions.callTool(connect, 'echo_read', { message: 'hi' });
    expect(tool.isError).toBeFalsy();
    const prompt = await gatewayService.getPrompt(user.id, { chatId: chat.id }, 'summarize', {
      topic: 'ACS',
    });
    const withoutChat = await gatewayService.getPrompt(
      user.id,
      { serverId: server.id },
      'summarize',
      { topic: 'ACS' }
    );
    expect(withoutChat.text).toBe(prompt.text);
    expect(prompt.text).toContain('Summarize: ACS');
  });

  it('retries once after a session 404 and blocks redirects', async () => {
    await bootGateway();
    const { user, server, runtime } = await seedServer('retry', { token: 'pass' });
    const config = await runtime.config.getDecrypted(user.id, server.id);
    const connect = {
      userId: user.id,
      serverId: server.id,
      serverBaseUrl: server.baseUrl,
      endpointUrl: config!.endpointUrl!,
      apiKey: config!.apiKey!,
      apiKeyCiphertext: config!.apiKeyCiphertext,
      configVersion: config!.configVersion,
      mode: 'withAlfresco' as const,
    };
    await runtime.sessions.getCatalog(connect, true);
    const initializes = gateway!.requests.filter(req => req.jsonRpcMethod === 'initialize').length;
    gateway!.expireNextSession();
    const catalog = await runtime.sessions.getCatalog(connect, true);
    expect(catalog.status).toBe('connected');
    expect(
      gateway!.requests.filter(req => req.jsonRpcMethod === 'initialize').length
    ).toBeGreaterThan(initializes);

    const target = await startFakeMcpGateway();
    createdGateways.push(target);
    const redirected = await startFakeMcpGateway({ redirectTo: target.url });
    createdGateways.push(redirected);
    await runtime.config.save(user.id, server.id, {
      enabled: true,
      endpointUrl: redirected.url,
      apiKey: 'gw-secret',
    });
    const { gatewayService } = services();
    const test = await gatewayService.testConnection(user.id, server.id);
    expect(test.status).toBe('redirect_blocked');
    expect(target.requests).toHaveLength(0);
  });

  it('never returns the gateway key and keeps or clears it as requested', async () => {
    await bootGateway();
    const { user, server, runtime } = await seedServer('secrets', { token: 'pass' });
    const view = await runtime.config.getView(user.id, server.id);
    expect(view.hasApiKey).toBe(true);
    expect(JSON.stringify(view)).not.toContain('gw-secret');
    await runtime.config.save(user.id, server.id, {
      enabled: true,
      endpointUrl: gateway!.url,
    });
    const kept = await runtime.config.getDecrypted(user.id, server.id);
    expect(kept?.apiKey).toBe('gw-secret');
    await runtime.config.save(user.id, server.id, {
      enabled: true,
      endpointUrl: gateway!.url,
      clearApiKey: true,
    });
    const cleared = await runtime.config.getDecrypted(user.id, server.id);
    expect(cleared?.apiKey).toBeNull();
    const raw = await prisma.agentGatewayConfig.findUnique({ where: { serverId: server.id } });
    expect(raw?.apiKey).toBeNull();
    expect(await encryptSecret('gw-secret')).not.toBe('gw-secret');
  });
});
