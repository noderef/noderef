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

import {
  Client,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UriTemplate,
} from '@modelcontextprotocol/client';
import type { AgentGatewayStatus, McpCatalog } from '@app/contracts';
import { createLogger } from '../../lib/logger.js';
import { ALL_TOOLS } from '../agent/tools/registry.js';
import type { AgentGatewayConfigService } from './configService.js';
import type { GatewayCredentialProvider } from './credentialProvider.js';
import { createGatewayFetch, sanitizeGatewayError } from './gatewayFetch.js';
import {
  emptyCatalog,
  mapPrompts,
  mapResources,
  mapResourceTemplates,
  mapTools,
} from './mcpCatalog.js';
import { sessionFingerprint } from './mcpNames.js';
import { assertGatewayEndpointAllowed } from './endpointPolicy.js';
import { serverLifecycle } from './serverLifecycle.js';
import {
  CATALOG_CACHE_TTL_MS,
  CLIENT_NAME,
  GatewayStatusError,
  LIST_ITEM_LIMIT,
  LIST_PAGE_LIMIT,
  SESSION_IDLE_TTL_MS,
  SESSION_LRU_LIMIT,
  SUPPORTED_PROTOCOL_VERSIONS,
} from './types.js';
import type { GatewayAuthMode } from './types.js';

const log = createLogger('agent.gateway.session');
const CLIENT_VERSION = '0.13.1';
const LOCAL_TOOL_NAMES = new Set(ALL_TOOLS.map(tool => tool.name));

interface SessionEntry {
  key: string;
  userId: number;
  serverId: number;
  serverBaseUrl: string;
  fingerprint: string;
  client: Client;
  transport: StreamableHTTPClientTransport;
  lastUsedAt: number;
  catalog: McpCatalog | null;
  catalogAt: number;
  catalogInvalid: boolean;
}

export interface SessionConnectParams {
  userId: number;
  serverId: number;
  serverBaseUrl: string;
  endpointUrl: string;
  apiKey: string;
  apiKeyCiphertext: string | null;
  configVersion: number;
  mode: GatewayAuthMode;
}

async function listPaged<T>(
  loadPage: (
    cursor: string
  ) => Promise<{ items: T[]; nextCursor?: string | null }>
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor = '';
  let truncated = false;

  for (let page = 0; page < LIST_PAGE_LIMIT; page += 1) {
    const result = await loadPage(cursor);
    items.push(...result.items);
    if (items.length > LIST_ITEM_LIMIT) {
      items.length = LIST_ITEM_LIMIT;
      truncated = true;
      break;
    }
    if (!result.nextCursor) {
      break;
    }
    cursor = result.nextCursor;
    if (page === LIST_PAGE_LIMIT - 1) {
      truncated = true;
    }
  }

  return { items, truncated };
}

function mapHttpStatus(error: unknown): AgentGatewayStatus | null {
  if (error instanceof GatewayStatusError) {
    return error.status;
  }
  if (error instanceof SdkHttpError) {
    if (error.status === 401) return 'unauthorized';
    if (error.status === 403) return 'forbidden';
    if (error.status === 404) return 'unreachable';
  }
  return null;
}

function isSessionExpired(error: unknown): boolean {
  return error instanceof SdkHttpError && error.status === 404;
}

export class McpSessionManager {
  private sessions = new Map<string, SessionEntry>();
  private inflight = new Map<string, Promise<SessionEntry>>();
  private evictTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private configService: AgentGatewayConfigService,
    private credentials: GatewayCredentialProvider
  ) {
    serverLifecycle.onEvent(event => {
      if (event.type === 'server.updated' || event.type === 'server.deleted') {
        void this.invalidate(event.userId, event.serverId);
      } else if (event.type === 'server.loggedOut') {
        void this.invalidateByBaseUrl(event.baseUrl);
      }
    });
    this.evictTimer = setInterval(() => {
      void this.evictIdle();
    }, 30_000);
    this.evictTimer.unref?.();
  }

  async getSession(params: SessionConnectParams): Promise<SessionEntry> {
    const identity = await this.credentials.getIdentity(params.userId, params.serverId);
    const fingerprint = sessionFingerprint({
      endpointUrl: params.endpointUrl,
      apiKeyCiphertext: params.apiKeyCiphertext,
      configVersion: params.configVersion,
      authType: identity.authType,
      alfrescoIdentity: identity.identity,
    });
    const key = `${params.userId}:${params.serverId}:${fingerprint}`;
    const existing = this.sessions.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      this.touchLru(key);
      return existing;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const promise = this.connect(key, fingerprint, params);
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  async withSession<T>(
    params: SessionConnectParams,
    run: (entry: SessionEntry) => Promise<T>
  ): Promise<T> {
    const entry = await this.getSession(params);
    try {
      return await run(entry);
    } catch (error) {
      if (isSessionExpired(error)) {
        await this.dispose(entry.key);
        const retry = await this.getSession(params);
        return run(retry);
      }
      const status = mapHttpStatus(error);
      if (status === 'unauthorized' || status === 'forbidden' || status === 'unreachable') {
        await this.dispose(entry.key);
        throw new GatewayStatusError(status, sanitizeGatewayError(error, [params.apiKey]).message);
      }
      if (error instanceof GatewayStatusError) {
        throw error;
      }
      throw new GatewayStatusError(
        'protocol_error',
        sanitizeGatewayError(error, [params.apiKey]).message
      );
    }
  }

  async getCatalog(params: SessionConnectParams, refresh = false): Promise<McpCatalog> {
    return this.withSession(params, async entry => {
      const fresh =
        !refresh &&
        !entry.catalogInvalid &&
        entry.catalog &&
        Date.now() - entry.catalogAt < CATALOG_CACHE_TTL_MS;
      if (fresh && entry.catalog) {
        return entry.catalog;
      }
      const catalog = await this.fetchCatalog(entry);
      entry.catalog = catalog;
      entry.catalogAt = Date.now();
      entry.catalogInvalid = false;
      return catalog;
    });
  }

  async callTool(
    params: SessionConnectParams,
    name: string,
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeout?: number }
  ) {
    return this.withSession(params, entry =>
      entry.client.callTool(
        { name, arguments: args },
        {
          signal: options?.signal,
          timeout: options?.timeout,
        }
      )
    );
  }

  async getPrompt(
    params: SessionConnectParams,
    name: string,
    args?: Record<string, string>
  ) {
    return this.withSession(params, entry =>
      entry.client.getPrompt({ name, arguments: args })
    );
  }

  async readResource(params: SessionConnectParams, uri: string) {
    return this.withSession(params, entry => entry.client.readResource({ uri }));
  }

  expandTemplate(uriTemplate: string, values: Record<string, string>): string {
    return new UriTemplate(uriTemplate).expand(values);
  }

  matchTemplate(
    uriTemplate: string,
    uri: string
  ): Record<string, string> | null {
    const matched = new UriTemplate(uriTemplate).match(uri);
    if (!matched) {
      return null;
    }
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(matched)) {
      if (typeof value === 'string') {
        params[key] = value;
      }
    }
    return params;
  }

  async connectEphemeral(params: {
    endpointUrl: string;
    apiKey: string;
    serverBaseUrl?: string | null;
  }): Promise<{
    catalog: McpCatalog;
    protocolVersion: string | null;
    serverInfo: { name?: string | null; version?: string | null } | null;
  }> {
    const endpoint = assertGatewayEndpointAllowed(params.endpointUrl, {
      alfrescoBaseUrl: params.serverBaseUrl,
    });
    const { client, transport } = this.createClient({
      endpoint,
      apiKey: params.apiKey,
      userId: 0,
      serverId: 0,
      mode: 'gatewayOnly',
    });
    try {
      await client.connect(transport);
      const fakeEntry: SessionEntry = {
        key: 'ephemeral',
        userId: 0,
        serverId: 0,
        serverBaseUrl: params.serverBaseUrl ?? '',
        fingerprint: 'ephemeral',
        client,
        transport,
        lastUsedAt: Date.now(),
        catalog: null,
        catalogAt: 0,
        catalogInvalid: true,
      };
      const catalog = await this.fetchCatalog(fakeEntry);
      return {
        catalog,
        protocolVersion: client.getNegotiatedProtocolVersion() ?? null,
        serverInfo: client.getServerVersion() ?? null,
      };
    } catch (error) {
      const status = mapHttpStatus(error) ?? 'unreachable';
      throw new GatewayStatusError(status, sanitizeGatewayError(error, [params.apiKey]).message);
    } finally {
      await this.closeClient(client, transport);
    }
  }

  async invalidate(userId: number, serverId: number): Promise<void> {
    const keys = [...this.sessions.keys()].filter(key =>
      key.startsWith(`${userId}:${serverId}:`)
    );
    await Promise.all(keys.map(key => this.dispose(key)));
  }

  async invalidateByBaseUrl(baseUrl: string): Promise<void> {
    const normalized = baseUrl.replace(/\/+$/, '');
    const keys = [...this.sessions.values()]
      .filter(entry => entry.serverBaseUrl.replace(/\/+$/, '') === normalized)
      .map(entry => entry.key);
    await Promise.all(keys.map(key => this.dispose(key)));
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(key => this.dispose(key)));
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  private async connect(
    key: string,
    fingerprint: string,
    params: SessionConnectParams
  ): Promise<SessionEntry> {
    const endpoint = assertGatewayEndpointAllowed(params.endpointUrl, {
      alfrescoBaseUrl: params.serverBaseUrl,
    });
    const { client, transport } = this.createClient({
      endpoint,
      apiKey: params.apiKey,
      userId: params.userId,
      serverId: params.serverId,
      mode: params.mode,
    });

    try {
      await client.connect(transport);
    } catch (error) {
      await this.closeClient(client, transport);
      const status = mapHttpStatus(error) ?? 'unreachable';
      throw new GatewayStatusError(status, sanitizeGatewayError(error, [params.apiKey]).message);
    }

    const entry: SessionEntry = {
      key,
      userId: params.userId,
      serverId: params.serverId,
      serverBaseUrl: params.serverBaseUrl,
      fingerprint,
      client,
      transport,
      lastUsedAt: Date.now(),
      catalog: null,
      catalogAt: 0,
      catalogInvalid: true,
    };
    this.sessions.set(key, entry);
    this.evictOverflow();
    return entry;
  }

  private createClient(input: {
    endpoint: URL;
    apiKey: string;
    userId: number;
    serverId: number;
    mode: GatewayAuthMode;
  }): { client: Client; transport: StreamableHTTPClientTransport } {
    const fetchImpl = createGatewayFetch({
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      getAlfrescoAuthorization:
        input.mode === 'withAlfresco'
          ? () => this.credentials.getAlfrescoAuthorization(input.userId, input.serverId)
          : undefined,
    });

    const client = new Client(
      { name: CLIENT_NAME, version: CLIENT_VERSION },
      {
        versionNegotiation: { mode: 'legacy' },
        supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        listMaxPages: LIST_PAGE_LIMIT,
        listChanged: {
          tools: {
            onChanged: () => {
              this.markCatalogInvalid(input.userId, input.serverId);
            },
          },
          prompts: {
            onChanged: () => {
              this.markCatalogInvalid(input.userId, input.serverId);
            },
          },
          resources: {
            onChanged: () => {
              this.markCatalogInvalid(input.userId, input.serverId);
            },
          },
        },
      }
    );

    const transport = new StreamableHTTPClientTransport(input.endpoint, {
      fetch: fetchImpl,
      requestInit: { redirect: 'manual' },
      redirectPolicy: 'same-origin',
    });

    return { client, transport };
  }

  private markCatalogInvalid(userId: number, serverId: number): void {
    for (const entry of this.sessions.values()) {
      if (entry.userId === userId && entry.serverId === serverId) {
        entry.catalogInvalid = true;
      }
    }
  }

  private async fetchCatalog(entry: SessionEntry): Promise<McpCatalog> {
    const capabilities = entry.client.getServerCapabilities() ?? {};
    const hasTools = Boolean(capabilities.tools);
    const hasPrompts = Boolean(capabilities.prompts);
    const hasResources = Boolean(capabilities.resources);

    const [toolsPage, promptsPage, resourcesPage, templatesPage] = await Promise.all([
      hasTools
        ? listPaged(async cursor => {
            const page = await entry.client.listTools({ cursor });
            return { items: page.tools ?? [], nextCursor: page.nextCursor };
          })
        : Promise.resolve({ items: [], truncated: false }),
      hasPrompts
        ? listPaged(async cursor => {
            const page = await entry.client.listPrompts({ cursor });
            return { items: page.prompts ?? [], nextCursor: page.nextCursor };
          })
        : Promise.resolve({ items: [], truncated: false }),
      hasResources
        ? listPaged(async cursor => {
            const page = await entry.client.listResources({ cursor });
            return { items: page.resources ?? [], nextCursor: page.nextCursor };
          })
        : Promise.resolve({ items: [], truncated: false }),
      hasResources
        ? listPaged(async cursor => {
            const page = await entry.client.listResourceTemplates({ cursor });
            return { items: page.resourceTemplates ?? [], nextCursor: page.nextCursor };
          })
        : Promise.resolve({ items: [], truncated: false }),
    ]);

    const mappedTools = mapTools(toolsPage.items, LOCAL_TOOL_NAMES);
    return {
      status: 'connected',
      serverInfo: entry.client.getServerVersion() ?? null,
      protocolVersion: entry.client.getNegotiatedProtocolVersion() ?? null,
      capabilities: {
        tools: hasTools,
        prompts: hasPrompts,
        resources: hasResources,
      },
      tools: mappedTools.tools,
      prompts: mapPrompts(promptsPage.items),
      resources: mapResources(resourcesPage.items),
      resourceTemplates: mapResourceTemplates(templatesPage.items),
      fetchedAt: new Date().toISOString(),
      truncated:
        toolsPage.truncated ||
        promptsPage.truncated ||
        resourcesPage.truncated ||
        templatesPage.truncated,
    };
  }

  private touchLru(key: string): void {
    const entry = this.sessions.get(key);
    if (!entry) return;
    this.sessions.delete(key);
    this.sessions.set(key, entry);
  }

  private evictOverflow(): void {
    while (this.sessions.size > SESSION_LRU_LIMIT) {
      const oldest = this.sessions.keys().next().value;
      if (!oldest) break;
      void this.dispose(oldest);
    }
  }

  private async evictIdle(): Promise<void> {
    const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
    const stale = [...this.sessions.values()]
      .filter(entry => entry.lastUsedAt < cutoff)
      .map(entry => entry.key);
    await Promise.all(stale.map(key => this.dispose(key)));
  }

  private async dispose(key: string): Promise<void> {
    const entry = this.sessions.get(key);
    if (!entry) return;
    this.sessions.delete(key);
    await this.closeClient(entry.client, entry.transport);
  }

  private async closeClient(
    client: Client,
    transport: StreamableHTTPClientTransport
  ): Promise<void> {
    try {
      await transport.terminateSession();
    } catch (error) {
      if (!(error instanceof SdkHttpError) || error.status !== 405) {
        log.debug({ err: sanitizeGatewayError(error) }, 'Failed to terminate MCP session');
      }
    }
    try {
      await client.close();
    } catch {
      // Ignore close races.
    }
  }
}

export { emptyCatalog, mapHttpStatus };
