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
 * Backend data services RPC registration
 * Registers all backend.* RPC methods for servers, workspace, etc.
 */

import { NodesApi, SitesApi } from '@alfresco/js-api';
import type { CreateServer, UpdateServer } from '@app/contracts';
import { z } from 'zod';
import { listAnthropicModels } from '../../ai/anthropic.js';
import { buildSlingshotContentUrl, buildSlingshotNodeUrl } from '../../lib/alfresco-url.js';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import {
  resolveUserAiConfig,
  upsertUserAiSettings,
} from '../../services/ai/userSettingsService.js';
import { getAuthenticatedClientWithRefresh } from '../../services/alfresco/authenticationHelper.js';
import { JsConsoleHistoryService } from '../../services/jsConsoleHistoryService.js';
import { LocalFileService } from '../../services/localFileService.js';
import { NodeHistoryService } from '../../services/nodeHistoryService.js';
import { SavedSearchService } from '../../services/savedSearchService.js';
import { SearchHistoryService } from '../../services/searchHistoryService.js';
import { ServerService } from '../../services/serverService.js';
import { getCurrentUserId } from '../../services/userBootstrap.js';
import {
  getAiAssistantEnabled,
  getUser,
  setAiAssistantEnabled,
  updateUserProfile,
} from '../../services/userSettings.js';

const log = createLogger('backend.rpc');
const DEFAULT_AI_PROVIDER = 'anthropic';
const DEFAULT_AI_MODEL = 'claude-3-5-sonnet-20241022';

// Type alias for zod schema
type ZSchema = z.ZodType<unknown>;

type Routes = Record<string, { schema: ZSchema; handler: (p: unknown) => Promise<unknown> }>;

async function fetchSlingshotNodeData(
  baseUrl: string,
  nodeId: string,
  username: string,
  token: string,
  authType: 'basic' | 'openid_connect' = 'basic'
): Promise<{ nodeData: any; slingshotUrl: string }> {
  const nodeRef = `workspace/SpacesStore/${nodeId}`;
  const slingshotUrl = buildSlingshotNodeUrl(baseUrl, nodeRef);

  // Build Authorization header based on auth type
  const authHeader =
    authType === 'openid_connect'
      ? `Bearer ${token}`
      : `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;

  const response = await fetch(slingshotUrl, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    AppErrors.connectionError(`Failed to fetch node details: ${response.statusText}`);
  }

  const nodeData = await response.json();
  return { nodeData, slingshotUrl };
}

function normalizeNodeRef(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.includes('://')) {
    return value;
  }

  if (value.startsWith('workspace/')) {
    return value.replace('workspace/', 'workspace://');
  }

  return `workspace://SpacesStore/${value}`;
}

function extractMimeTypeFromSlingshotNode(nodeData: any): string | null {
  if (!Array.isArray(nodeData?.properties)) {
    return null;
  }

  const contentProperty = nodeData.properties.find((prop: any) => {
    const prefixedName = prop?.name?.prefixedName ?? prop?.name;
    return (
      prefixedName === 'cm:content' ||
      prefixedName === '{http://www.alfresco.org/model/content/1.0}content'
    );
  });

  if (!contentProperty) {
    return null;
  }

  const firstValue = contentProperty.values?.[0]?.value;
  if (!firstValue) {
    return null;
  }

  if (typeof firstValue === 'string') {
    const match = firstValue.match(/mimetype=([^|]+)/i);
    return match ? match[1] : null;
  }

  if (typeof firstValue === 'object') {
    if (typeof firstValue.mimetype === 'string' && firstValue.mimetype) {
      return firstValue.mimetype;
    }
    if (typeof firstValue.mimeType === 'string' && firstValue.mimeType) {
      return firstValue.mimeType;
    }
  }

  return null;
}

function extractPropertyValueFromSlingshotNode(
  nodeData: any,
  propertyNames: string[]
): string | null {
  if (!Array.isArray(nodeData?.properties)) {
    return null;
  }

  const property = nodeData.properties.find((prop: any) => {
    const prefixedName = prop?.name?.prefixedName ?? prop?.name;
    return propertyNames.includes(prefixedName);
  });

  if (!property) {
    return null;
  }

  const firstValue = property.values?.[0]?.value;
  if (!firstValue) {
    return null;
  }

  if (typeof firstValue === 'string') {
    return firstValue;
  }

  if (typeof firstValue === 'object' && typeof firstValue.value === 'string') {
    return firstValue.value;
  }

  return null;
}

function extractNodeNameFromSlingshotNode(nodeData: any): string | null {
  const typeName = nodeData?.type?.prefixedName ?? nodeData?.type;

  if (typeName === 'cm:person') {
    const username = extractPropertyValueFromSlingshotNode(nodeData, [
      'cm:userName',
      '{http://www.alfresco.org/model/person/1.0}userName',
    ]);
    if (username) {
      return username;
    }
  }

  return (
    extractPropertyValueFromSlingshotNode(nodeData, [
      'cm:name',
      '{http://www.alfresco.org/model/content/1.0}name',
    ]) ?? null
  );
}

function extractParentRefFromSlingshotNode(nodeData: any): string | null {
  if (!Array.isArray(nodeData?.parents)) {
    return null;
  }

  const primaryParent =
    nodeData.parents.find((parent: any) => parent?.primary) ?? nodeData.parents[0];
  const parentNodeRef = primaryParent?.nodeRef ?? primaryParent?.nodeId ?? null;

  if (typeof parentNodeRef === 'string' && parentNodeRef) {
    return normalizeNodeRef(parentNodeRef);
  }

  return null;
}

function extractParentRefFromNodeEntry(nodeEntry: any): string | null {
  if (typeof nodeEntry?.parentId === 'string' && nodeEntry.parentId) {
    return normalizeNodeRef(nodeEntry.parentId);
  }

  const elements = nodeEntry?.path?.elements;
  if (Array.isArray(elements) && elements.length > 0) {
    const parentElement = elements[elements.length - 1];
    if (typeof parentElement?.id === 'string' && parentElement.id) {
      return normalizeNodeRef(parentElement.id);
    }
  }

  return null;
}

/**
 * Register all backend data service RPC methods
 * @param routes The routes object to register methods on
 * @param contracts The contracts module
 */
export async function registerBackendRpc(
  routes: Routes,
  _contracts: typeof import('@app/contracts')
): Promise<void> {
  const { getPrismaClient } = await import('../../lib/prisma.js');
  const prisma = await getPrismaClient();
  const serverService = new ServerService(prisma);
  const savedSearchService = new SavedSearchService(prisma);
  const searchHistoryService = new SearchHistoryService(prisma);
  const nodeHistoryService = new NodeHistoryService(prisma);
  const localFileService = new LocalFileService(prisma);
  const jsConsoleHistoryService = new JsConsoleHistoryService(prisma);

  // Workspace bootstrap - load all data needed for renderer startup
  routes['backend.workspace.load'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const [servers, localFilesPage, savedSearches, user, nodeHistory, recentJsConsoleHistory] =
        await Promise.all([
          serverService.findAll(userId),
          localFileService.list(userId, { take: 20 }),
          savedSearchService.findAll(userId),
          getUser(userId),
          nodeHistoryService.getActivitySummary(userId, { limit: 20 }),
          jsConsoleHistoryService.list(userId, { limit: 20 }),
        ]);

      const localFiles = {
        items: localFilesPage.items,
        pagination: {
          totalItems: localFilesPage.total,
          skipCount: localFilesPage.skip,
          maxItems: localFilesPage.take,
          hasMoreItems: localFilesPage.hasMoreItems,
        },
      };

      return {
        servers,
        localFiles,
        savedSearches,
        recentNodeHistory: nodeHistory.timeline,
        recentJsConsoleHistory: recentJsConsoleHistory.items,
        user: user
          ? {
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              thumbnail: user.thumbnail ?? null,
            }
          : null,
      };
    },
  };

  routes['backend.nodeHistory.activity'] = {
    schema: z.object({
      serverId: z.number().int().positive().optional(),
      days: z.number().int().min(7).max(366).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, days, limit, offset } = params as {
        serverId?: number;
        days?: number;
        limit?: number;
        offset?: number;
      };

      return nodeHistoryService.getActivitySummary(userId, {
        serverId,
        days,
        limit,
        offset,
      });
    },
  };

  routes['backend.repository.getSlingshotChildren'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId } = params as { serverId: number; nodeId: string };

      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }
      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Fetch credentials for Slingshot API (direct HTTP call, not through js-api)
      const creds = await serverService.getCredentialsForBackend(userId, serverId);
      if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
        AppErrors.unauthorized('No stored credentials found for server');
      }
      const credsDefined = creds!;

      const { nodeData, slingshotUrl } = await fetchSlingshotNodeData(
        serverDefined.baseUrl,
        nodeId,
        credsDefined.username || '',
        credsDefined.token!,
        credsDefined.authType as 'basic' | 'openid_connect'
      );

      log.debug(
        { serverId, nodeId, slingshotUrl, childCount: nodeData.children?.length || 0 },
        'Fetched slingshot children'
      );

      return {
        children: nodeData.children ?? [],
      };
    },
  };

  routes['backend.repository.getSystemTreeRoot'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId: number };

      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }
      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      const { SearchApi } = await import('@alfresco/js-api');
      const searchApi = new SearchApi(api);

      const searchResult = await searchApi.search({
        query: {
          query: 'PATH:"/sys:system"',
          language: 'afts',
        },
        fields: ['id'],
      });

      const systemNodeId = searchResult?.list?.entries?.[0]?.entry?.id;
      if (!systemNodeId) {
        AppErrors.notFound('System node');
      }
      // TypeScript doesn't recognize never-return, so we assert systemNodeId is defined
      const systemNodeIdDefined = systemNodeId!;

      // Get credentials for Slingshot API call
      const creds = await serverService.getCredentialsForBackend(userId, serverId);
      if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
        AppErrors.unauthorized('No stored credentials found for server');
      }
      const credsDefined = creds!;

      const { nodeData, slingshotUrl } = await fetchSlingshotNodeData(
        serverDefined.baseUrl,
        systemNodeIdDefined,
        credsDefined.username || '',
        credsDefined.token!,
        credsDefined.authType as 'basic' | 'openid_connect'
      );

      log.debug(
        {
          serverId,
          systemNodeId,
          slingshotUrl,
          childCount: nodeData.children?.length || 0,
        },
        'Fetched system tree root children'
      );

      return {
        systemNodeId,
        children: nodeData.children ?? [],
      };
    },
  };

  routes['backend.ai.getSettings'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const config = await resolveUserAiConfig(userId);
      return {
        provider: config?.provider ?? DEFAULT_AI_PROVIDER,
        model: config?.model ?? DEFAULT_AI_MODEL,
        hasToken: Boolean(config?.apiKey),
        enabled: await getAiAssistantEnabled(userId),
      };
    },
  };

  routes['backend.ai.saveSettings'] = {
    schema: z.object({
      provider: z.string().min(1),
      model: z.string().min(1),
      token: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { provider, model, token, enabled } = params as {
        provider: string;
        model: string;
        token?: string;
        enabled?: boolean;
      };
      const normalizedToken = token && token.trim().length > 0 ? token.trim() : undefined;

      await upsertUserAiSettings(userId, {
        provider,
        model,
        token: normalizedToken,
        isDefault: true,
      });

      if (typeof enabled === 'boolean') {
        await setAiAssistantEnabled(userId, enabled);
      }

      return { success: true };
    },
  };

  routes['backend.ai.listModels'] = {
    schema: z.object({
      provider: z.string().optional(),
      token: z.string().optional(),
    }),
    handler: async (params: unknown) => {
      const typedParams = params as { provider?: string; token?: string };
      const userId = await getCurrentUserId();
      const providerOverride = typedParams.provider?.trim();
      const tokenOverride = typedParams.token?.trim();

      let config: Awaited<ReturnType<typeof resolveUserAiConfig>> | null = null;
      if (!tokenOverride || !providerOverride) {
        config = await resolveUserAiConfig(userId).catch(() => null);
      }

      const provider = providerOverride || config?.provider || DEFAULT_AI_PROVIDER;
      const token = tokenOverride || config?.apiKey;
      if (!token) {
        AppErrors.invalidInput('No API token provided or stored.');
      }
      // TypeScript doesn't recognize never-return, so we assert token is defined
      const tokenDefined = token!;

      if (provider !== 'anthropic') {
        AppErrors.invalidInput(`Model listing not supported for provider "${provider}".`);
      }

      const models = await listAnthropicModels(tokenDefined);
      return { provider, models };
    },
  };

  // Server operations
  routes['backend.servers.list'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      return serverService.findAll(userId);
    },
  };

  routes['backend.servers.get'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return serverService.findById(userId, id);
    },
  };

  routes['backend.servers.create'] = {
    schema: z.object({
      name: z.string(),
      baseUrl: z.string(),
      serverType: z.string().optional(),
      authType: z.string().nullable().optional(),
      isAdmin: z.boolean().optional(),
      username: z.string().nullable().optional(),
      token: z.string().nullable().optional(),
      refreshToken: z.string().nullable().optional(),
      tokenExpiry: z.string().nullable().optional(), // ISO date string
      oidcHost: z.string().nullable().optional(),
      oidcRealm: z.string().nullable().optional(),
      oidcClientId: z.string().nullable().optional(),
      jsconsoleEndpoint: z.string().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      displayOrder: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as Omit<CreateServer, 'userId'>;
      // Convert tokenExpiry string to Date if provided
      if (data.tokenExpiry && typeof data.tokenExpiry === 'string') {
        (data as any).tokenExpiry = new Date(data.tokenExpiry);
      }
      return serverService.create(userId, data);
    },
  };

  routes['backend.servers.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      baseUrl: z.string().optional(),
      serverType: z.string().optional(),
      authType: z.string().nullable().optional(),
      isAdmin: z.boolean().optional(),
      username: z.string().nullable().optional(),
      token: z.string().nullable().optional(),
      refreshToken: z.string().nullable().optional(),
      tokenExpiry: z.string().nullable().optional(), // ISO date string
      oidcHost: z.string().nullable().optional(),
      oidcRealm: z.string().nullable().optional(),
      oidcClientId: z.string().nullable().optional(),
      jsconsoleEndpoint: z.string().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      displayOrder: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, ...data } = params as { id: number } & UpdateServer;
      // Convert tokenExpiry string to Date if provided
      if (data.tokenExpiry && typeof data.tokenExpiry === 'string') {
        (data as any).tokenExpiry = new Date(data.tokenExpiry);
      }
      return serverService.update(userId, id, data);
    },
  };

  routes['backend.servers.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await serverService.delete(userId, id);
      return { success };
    },
  };

  routes['backend.servers.reorder'] = {
    schema: z.object({
      orders: z.array(
        z.object({
          id: z.number(),
          displayOrder: z.number(),
        })
      ),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { orders } = params as { orders: Array<{ id: number; displayOrder: number }> };
      await serverService.reorder(userId, orders);
      return {};
    },
  };

  routes['backend.servers.updateLastAccessed'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      await serverService.updateLastAccessed(userId, id);
      return {};
    },
  };

  routes['backend.servers.refreshTokens'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return serverService.refreshOAuthTokens(userId, id);
    },
  };

  routes['backend.servers.updateOidcTokens'] = {
    schema: z.object({
      id: z.number(),
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresIn: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, accessToken, refreshToken, expiresIn } = params as {
        id: number;
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
      };

      // Calculate token expiry
      const tokenExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      // Update server with new tokens
      return serverService.update(userId, id, {
        token: accessToken,
        refreshToken,
        tokenExpiry,
      });
    },
  };

  // Saved Search operations
  routes['backend.savedSearches.list'] = {
    schema: z.object({
      serverId: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId?: number };
      return savedSearchService.findAll(userId, serverId);
    },
  };

  routes['backend.savedSearches.get'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      return savedSearchService.findById(userId, id);
    },
  };

  routes['backend.savedSearches.create'] = {
    schema: z.object({
      serverId: z.number(),
      name: z.string(),
      query: z.string(),
      columns: z.string().nullable().optional(),
      isDefault: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as {
        serverId: number;
        name: string;
        query: string;
        columns?: string | null;
        isDefault?: boolean;
      };
      return savedSearchService.create(userId, data);
    },
  };

  routes['backend.savedSearches.update'] = {
    schema: z.object({
      id: z.number(),
      name: z.string().optional(),
      query: z.string().optional(),
      columns: z.string().nullable().optional(),
      isDefault: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, ...data } = params as {
        id: number;
        name?: string;
        query?: string;
        columns?: string | null;
        isDefault?: boolean;
      };
      return savedSearchService.update(userId, id, data);
    },
  };

  routes['backend.savedSearches.delete'] = {
    schema: z.object({ id: z.number() }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await savedSearchService.delete(userId, id);
      return { success };
    },
  };

  // Search History operations
  routes['backend.searchHistory.list'] = {
    schema: z.object({
      limit: z.number().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { limit } = params as { limit?: number };
      return searchHistoryService.list(userId, limit);
    },
  };

  routes['backend.searchHistory.create'] = {
    schema: z.object({
      query: z.string(),
      resultsCount: z.number().optional().nullable(),
      searchId: z.number().optional().nullable(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const data = params as {
        query: string;
        resultsCount?: number | null;
        searchId?: number | null;
      };
      return searchHistoryService.create(userId, data);
    },
  };

  routes['backend.localFiles.list'] = {
    schema: z.object({
      query: z.string().optional(),
      skipCount: z.number().int().min(0).optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
      sortBy: z.enum(['name', 'lastModified', 'createdAt', 'type']).optional(),
      sortDir: z.enum(['asc', 'desc']).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { query, skipCount, maxItems, sortBy, sortDir } = params as {
        query?: string;
        skipCount?: number;
        maxItems?: number;
        sortBy?: 'name' | 'lastModified' | 'createdAt' | 'type';
        sortDir?: 'asc' | 'desc';
      };
      const result = await localFileService.list(userId, {
        search: query,
        skip: skipCount,
        take: maxItems,
        sortBy,
        sortDir,
      });
      return {
        items: result.items,
        pagination: {
          totalItems: result.total,
          skipCount: result.skip,
          maxItems: result.take,
          hasMoreItems: result.hasMoreItems,
        },
      };
    },
  };

  routes['backend.localFiles.create'] = {
    schema: z.object({
      name: z.string().min(1).max(255),
      type: z.string().max(255).nullable().optional(),
      content: z.string().nullable().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { name, type, content } = params as {
        name: string;
        type?: string | null;
        content?: string | null;
      };

      return localFileService.create(userId, {
        name,
        type: type ?? null,
        content: content ?? '',
      });
    },
  };

  routes['backend.localFiles.update'] = {
    schema: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255).optional(),
      type: z.string().max(255).nullable().optional(),
      content: z.string().nullable().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id, name, type, content } = params as {
        id: number;
        name?: string;
        type?: string | null;
        content?: string | null;
      };

      const payload: {
        name?: string;
        type?: string | null;
        content?: string | null;
      } = {
        name,
        type: type ?? null,
      };

      if (Object.prototype.hasOwnProperty.call(params as object, 'content')) {
        payload.content = content ?? '';
      }

      const updated = await localFileService.update(userId, id, payload);

      if (!updated) {
        AppErrors.notFound('Local file', id);
      }

      return updated;
    },
  };

  routes['backend.localFiles.delete'] = {
    schema: z.object({
      id: z.number().int().positive(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { id } = params as { id: number };
      const success = await localFileService.softDelete(userId, id);
      return { success };
    },
  };

  // Repository node operations
  routes['backend.repository.getNodeChildren'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string().optional(),
      maxItems: z.number().int().min(1).max(2000).optional(),
      skipCount: z.number().int().min(0).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId, maxItems, skipCount } = params as {
        serverId: number;
        nodeId?: string;
        maxItems?: number;
        skipCount?: number;
      };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      // Use NodesApi to get children
      const nodesApi = new NodesApi(api);
      const targetNodeId = nodeId || '-root-'; // Default to Company Home

      log.debug({ serverId, nodeId: targetNodeId }, 'Fetching node children');

      // Fetch children from Alfresco
      const result = await nodesApi.listNodeChildren(targetNodeId, {
        include: ['properties', 'aspectNames', 'path'],
        fields: [
          'id',
          'name',
          'nodeType',
          'isFolder',
          'isFile',
          'modifiedAt',
          'modifiedByUser',
          'createdAt',
          'createdByUser',
          'content',
          'path',
        ],
        maxItems,
        skipCount,
      });

      // Log API response in development mode
      if (process.env.NODE_ENV === 'development') {
        log.debug(
          {
            nodeId: targetNodeId,
            entriesCount: result.list?.entries?.length || 0,
          },
          'Alfresco API children response'
        );
        log.debug({ result }, 'Alfresco API children response (full)');
      }

      const getNodePropertyValue = (node: any, propertyName: string): string | undefined => {
        const value = node.properties?.[propertyName];
        if (value == null) return undefined;

        if (Array.isArray(value)) {
          return value.filter(entry => entry != null).join(', ');
        }

        if (typeof value === 'object') {
          if ('value' in value && value.value != null) {
            return String(value.value);
          }
          if ('displayName' in value && value.displayName != null) {
            return String(value.displayName);
          }
        }

        return typeof value === 'string' ? value : String(value);
      };

      // Fetch current node details to build breadcrumb
      let breadcrumb: Array<{ id: string; name: string }> = [];
      try {
        const nodeDetails = await nodesApi.getNode(targetNodeId, {
          include: ['path'],
        });

        const pathElements = nodeDetails?.entry?.path?.elements || [];
        breadcrumb = pathElements
          .filter((element: any) => element.id && element.id !== targetNodeId)
          .map((element: any) => ({
            id: element.id,
            name: element.name,
          }));

        if (nodeDetails?.entry?.id) {
          breadcrumb.push({ id: nodeDetails.entry.id, name: nodeDetails.entry.name });
        }
      } catch (err) {
        log.warn({ err, nodeId: targetNodeId }, 'Failed to fetch node details for breadcrumb');
      }

      // Transform to our format and filter out thumbnails
      const nodes = (result.list?.entries || [])
        .filter((entry: any) => {
          const node = entry.entry;
          // Exclude thumbnail nodes
          return node.nodeType !== 'cm:thumbnail';
        })
        .map((entry: any) => {
          const node = entry.entry;
          return {
            id: node.id,
            name: node.name,
            isFolder: node.isFolder,
            isFile: node.isFile,
            nodeType: node.nodeType,
            mimeType: node.content?.mimeType,
            createdAt: node.createdAt,
            modifiedAt: node.modifiedAt,
            modifiedBy: node.modifiedByUser?.displayName || node.modifiedByUser?.id,
            modifiedById: node.modifiedByUser?.id,
            description: getNodePropertyValue(node, 'cm:description'),
            hasChildren: node.isFolder, // Folders can potentially have children
            path: node.path?.name, // Full path for evaluators
          };
        });

      const pagination = result.list?.pagination;
      const paginationInfo = {
        count: pagination?.count ?? nodes.length,
        hasMoreItems: pagination?.hasMoreItems ?? false,
        maxItems: pagination?.maxItems ?? maxItems ?? nodes.length,
        skipCount: pagination?.skipCount ?? skipCount ?? 0,
        totalItems: pagination?.totalItems,
      };

      return { nodes, breadcrumb, pagination: paginationInfo };
    },
  };

  // Repository node actions
  routes['backend.repository.createSite'] = {
    schema: z.object({
      serverId: z.number(),
      parentNodeId: z.string().optional(),
      id: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9-]+$/)
        .optional(),
      title: z.string().trim().min(1),
      description: z.string().optional(),
      visibility: z.enum(['PUBLIC', 'PRIVATE', 'MODERATED']).optional(),
      skipConfiguration: z.boolean().optional(),
      skipAddToFavorites: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const {
        serverId,
        parentNodeId,
        id,
        title,
        description,
        visibility = 'PUBLIC',
        skipConfiguration = false,
        skipAddToFavorites = false,
      } = params as {
        serverId: number;
        parentNodeId?: string;
        id?: string;
        title: string;
        description?: string;
        visibility?: 'PUBLIC' | 'PRIVATE' | 'MODERATED';
        skipConfiguration?: boolean;
        skipAddToFavorites?: boolean;
      };

      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      const sitesApi = new SitesApi(api);
      const nodesApi = new NodesApi(api);

      const payload = {
        id: id?.trim() || undefined,
        title: title.trim(),
        description: description?.trim(),
        visibility,
      };

      log.debug({ serverId, siteId: payload.id, visibility }, 'Creating site');

      const siteResult = await sitesApi.createSite(payload as any, {
        skipConfiguration,
        skipAddToFavorites,
      });

      const siteEntry = (siteResult as any)?.entry ?? null;

      const getNodePropertyValue = (node: any, propertyName: string): string | undefined => {
        const value = node.properties?.[propertyName];
        if (value == null) return undefined;

        if (Array.isArray(value)) {
          return value.filter(entry => entry != null).join(', ');
        }

        if (typeof value === 'object') {
          if ('value' in value && value.value != null) {
            return String(value.value);
          }
          if ('displayName' in value && value.displayName != null) {
            return String(value.displayName);
          }
        }

        return typeof value === 'string' ? value : String(value);
      };

      const mapNode = (entry: any) => ({
        id: entry.id,
        name: entry.name,
        isFolder: entry.isFolder,
        isFile: entry.isFile,
        nodeType: entry.nodeType,
        mimeType: entry.content?.mimeType,
        description: getNodePropertyValue(entry, 'cm:description'),
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
        modifiedBy: entry.modifiedByUser?.displayName || entry.modifiedByUser?.id,
        modifiedById: entry.modifiedByUser?.id,
        hasChildren: entry.isFolder,
        path: entry.path?.name,
      });

      let node: any = null;

      const loadNodeByGuid = async (guid: string) => {
        const result = await nodesApi.getNode(guid, {
          include: ['properties', 'aspectNames', 'path'],
          fields: [
            'id',
            'name',
            'nodeType',
            'isFolder',
            'isFile',
            'modifiedAt',
            'modifiedByUser',
            'createdAt',
            'createdByUser',
            'content',
            'path',
            'properties',
          ],
        });
        node = mapNode(result.entry);
      };

      const loadNodeFromParent = async (parentId: string, siteId?: string) => {
        const result = await nodesApi.listNodeChildren(parentId, {
          include: ['properties', 'aspectNames', 'path'],
          fields: [
            'id',
            'name',
            'nodeType',
            'isFolder',
            'isFile',
            'modifiedAt',
            'modifiedByUser',
            'createdAt',
            'createdByUser',
            'content',
            'path',
            'properties',
          ],
          maxItems: 200,
          skipCount: 0,
        });

        const match = (result.list?.entries || []).find((entry: any) => {
          const child = entry.entry;
          if (!child?.isFolder) return false;
          if (child.nodeType !== 'st:site') return false;
          if (siteId) {
            return child.name === siteId;
          }
          return true;
        });

        if (match?.entry) {
          node = mapNode(match.entry);
        }
      };

      try {
        if (siteEntry?.guid) {
          await loadNodeByGuid(siteEntry.guid);
        } else if (parentNodeId) {
          await loadNodeFromParent(parentNodeId, siteEntry?.id);
        }
      } catch (err) {
        log.warn({ err, siteId: siteEntry?.id }, 'Created site but failed to load node metadata');
      }

      log.info(
        { serverId, siteId: siteEntry?.id, hasNode: Boolean(node) },
        'Site created successfully'
      );

      return { site: siteEntry, node };
    },
  };

  routes['backend.repository.getSite'] = {
    schema: z.object({
      serverId: z.number(),
      siteId: z.string().min(1),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, siteId } = params as { serverId: number; siteId: string };

      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      const sitesApi = new SitesApi(api);
      const result = await sitesApi.getSite(siteId);

      log.debug({ serverId, siteId }, 'Fetched site details');

      return { site: (result as any)?.entry ?? null };
    },
  };

  routes['backend.repository.updateSite'] = {
    schema: z.object({
      serverId: z.number(),
      siteId: z.string().min(1),
      title: z.string().trim().min(1).optional(),
      description: z.string().optional(),
      visibility: z.enum(['PUBLIC', 'PRIVATE', 'MODERATED']).optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, siteId, title, description, visibility } = params as {
        serverId: number;
        siteId: string;
        title?: string;
        description?: string;
        visibility?: 'PUBLIC' | 'PRIVATE' | 'MODERATED';
      };

      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      const sitesApi = new SitesApi(api);

      const payload: any = {};
      if (title != null) payload.title = title;
      if (description != null) payload.description = description;
      if (visibility != null) payload.visibility = visibility;

      const result = await sitesApi.updateSite(siteId, payload);

      log.info({ serverId, siteId }, 'Site updated successfully');

      return { site: (result as any)?.entry ?? null };
    },
  };

  routes['backend.repository.deleteSite'] = {
    schema: z.object({
      serverId: z.number(),
      siteId: z.string().min(1),
      permanent: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const {
        serverId,
        siteId,
        permanent = false,
      } = params as {
        serverId: number;
        siteId: string;
        permanent?: boolean;
      };

      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      const sitesApi = new SitesApi(api);
      await sitesApi.deleteSite(siteId, { permanent });

      log.info({ serverId, siteId, permanent }, 'Site deleted successfully');

      return { success: true };
    },
  };

  routes['backend.repository.renameNode'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      newName: z.string(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId, newName } = params as {
        serverId: number;
        nodeId: string;
        newName: string;
      };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      // Rename node
      const nodesApi = new NodesApi(api);
      const result = await nodesApi.updateNode(nodeId, {
        name: newName,
      });

      log.debug({ serverId, nodeId, newName }, 'Node renamed successfully');

      return { success: true, node: result.entry };
    },
  };

  routes['backend.repository.deleteNode'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      permanent: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const {
        serverId,
        nodeId,
        permanent = false,
      } = params as { serverId: number; nodeId: string; permanent?: boolean };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      // Delete node
      const nodesApi = new NodesApi(api);
      await nodesApi.deleteNode(nodeId, { permanent });

      log.debug({ serverId, nodeId, permanent }, 'Node deleted successfully');

      return { success: true };
    },
  };

  routes['backend.repository.getNodeDetails'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId } = params as { serverId: number; nodeId: string };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // Get credentials
      const creds = await serverService.getCredentialsForBackend(userId, serverId);
      if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
        AppErrors.unauthorized('No stored credentials found for server');
      }
      // TypeScript doesn't recognize never-return, so we assert server and creds are defined
      const serverDefined = server!;
      const credsDefined = creds!;

      const { nodeData, slingshotUrl } = await fetchSlingshotNodeData(
        serverDefined.baseUrl,
        nodeId,
        credsDefined.username || '',
        credsDefined.token!,
        credsDefined.authType as 'basic' | 'openid_connect'
      );

      log.debug({ serverId, nodeId, slingshotUrl }, 'Fetched node details from slingshot API');

      // Log response in development mode
      if (process.env.NODE_ENV === 'development') {
        log.debug({ nodeId }, 'Slingshot node details response');
        log.debug({ nodeData }, 'Slingshot node details response (full)');
      }

      const fullPath = nodeData.qnamePath?.prefixedName ?? null;
      let parentPath = fullPath;
      if (fullPath) {
        const lastSlashIndex = fullPath.lastIndexOf('/');
        if (lastSlashIndex >= 0) {
          parentPath = lastSlashIndex === 0 ? '/' : fullPath.substring(0, lastSlashIndex);
        }
      }

      await nodeHistoryService.recordAccess({
        userId,
        serverId,
        nodeRef: normalizeNodeRef(nodeData.nodeRef ?? nodeId),
        parentRef: extractParentRefFromSlingshotNode(nodeData),
        name:
          extractNodeNameFromSlingshotNode(nodeData) ??
          nodeData.name?.name ??
          nodeData.name?.prefixedName ??
          nodeId,
        path: parentPath,
        type: nodeData.type?.prefixedName ?? null,
        mimetype: extractMimeTypeFromSlingshotNode(nodeData),
      });

      return { nodeData };
    },
  };

  routes['backend.repository.getSlingshotContent'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      property: z.string().optional().default('cm:content'),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId, property } = params as {
        serverId: number;
        nodeId: string;
        property: string;
      };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Get credentials for direct HTTP call to Slingshot API
      const creds = await serverService.getCredentialsForBackend(userId, serverId);
      if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
        AppErrors.unauthorized('No stored credentials found for server');
      }
      const credsDefined = creds!;

      // Build slingshot content URL
      const nodeRef = `workspace/SpacesStore/${nodeId}`;
      const contentUrl = buildSlingshotContentUrl(serverDefined.baseUrl, nodeRef, property);

      log.debug(
        { serverId, nodeId, property, contentUrl },
        'Downloading content from slingshot API'
      );

      // Build Authorization header based on auth type
      const authHeader =
        credsDefined.authType === 'openid_connect'
          ? `Bearer ${credsDefined.token!}`
          : `Basic ${Buffer.from(`${credsDefined.username || ''}:${credsDefined.token!}`).toString('base64')}`;

      // Fetch content from slingshot API
      const response = await fetch(contentUrl, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
        },
      });

      if (!response.ok) {
        AppErrors.connectionError(`Failed to download content: ${response.statusText}`);
      }

      // Return the response as a buffer
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      return {
        buffer,
        contentType,
      };
    },
  };

  // JavaScript Console - Get history
  routes['backend.jsconsole.getHistory'] = {
    schema: z.object({
      serverId: z.number().optional(),
      limit: z.number().optional().default(25),
      cursor: z.number().optional(), // ID of the last item from previous page
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, limit, cursor } = params as {
        serverId?: number;
        limit?: number;
        cursor?: number;
      };

      return jsConsoleHistoryService.list(userId, {
        serverId,
        limit,
        cursor,
      });
    },
  };

  // JavaScript Console execution
  routes['backend.jsconsole.execute'] = {
    schema: z.object({
      serverId: z.number(),
      script: z.string(),
      documentNodeRef: z.string().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, script, documentNodeRef } = params as {
        serverId: number;
        script: string;
        documentNodeRef?: string;
      };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      // Get credentials for JavaScript console runas field
      const creds = await serverService.getCredentialsForBackend(userId, serverId);
      if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
        AppErrors.unauthorized('No stored credentials found for server');
      }
      const credsDefined = creds!;

      // Get JavaScript console endpoint from server configuration
      const jsConsoleEndpoint = serverDefined.jsconsoleEndpoint;

      if (!jsConsoleEndpoint) {
        AppErrors.invalidInput(
          'JavaScript Console endpoint not configured for this server. Please configure it in server settings.'
        );
      }
      // TypeScript doesn't recognize never-return, so we assert jsConsoleEndpoint is defined
      const jsConsoleEndpointDefined = jsConsoleEndpoint!;

      // Remove leading slash to prevent double slashes in URL
      const jsConsoleEndpointClean = jsConsoleEndpointDefined.replace(/^\/+/, '');

      log.debug({ serverId, endpoint: jsConsoleEndpointClean }, 'Executing JavaScript on server');

      try {
        // The JavaScript console uses a two-step process:
        // 1. POST to {endpoint}/execute with script and resultChannel
        // 2. GET from {endpoint}/{resultChannel}/executionResult

        // Generate unique result channel ID (timestamp-based)
        const resultChannel = Date.now().toString();

        // Step 1: Execute the script
        const { WebscriptApi } = await import('@alfresco/js-api');
        const webscriptApi = new WebscriptApi(api);

        const executePayload = {
          script,
          template: '',
          spaceNodeRef: '',
          transaction: 'readwrite',
          runas: credsDefined.username || '',
          urlargs: '',
          documentNodeRef: documentNodeRef || '',
          resultChannel,
        };

        // Step 1: POST to /execute to start the script
        // This may return immediately (short scripts) or timeout (long scripts)
        try {
          const executeResult = await webscriptApi.executeWebScript(
            'POST',
            `${jsConsoleEndpointClean}/execute`,
            undefined, // scriptArgs
            undefined, // contextRoot (use default 'alfresco')
            undefined, // servicePath (use default 'service')
            executePayload // postBody
          );

          // If execute returns successfully with a result, use it
          if (
            executeResult &&
            (executeResult.scriptPerf !== undefined || executeResult.error !== undefined)
          ) {
            log.debug({ serverId, resultChannel, immediate: true }, 'Script completed immediately');

            // Save execution to history
            const output = executeResult?.printOutput
              ? Array.isArray(executeResult.printOutput)
                ? executeResult.printOutput.join('\n')
                : String(executeResult.printOutput)
              : null;

            const error = executeResult?.error
              ? typeof executeResult.error === 'string'
                ? executeResult.error
                : JSON.stringify(executeResult.error)
              : null;

            await jsConsoleHistoryService.create({
              userId,
              serverId,
              script,
              output,
              error,
            });

            return {
              success: true,
              result: executeResult,
            };
          }
        } catch (executeError: any) {
          // Ignore 408 timeout - this is expected for long-running scripts
          // We'll get the result via polling instead
          if (executeError.status !== 408) {
            log.error({ err: executeError, serverId }, 'Execute POST failed');
            throw executeError;
          }
          log.debug({ serverId, resultChannel }, 'Execute returned 408, will poll for results');
        }

        // Step 2: Poll /executionResult until script completes
        const maxPolls = 60; // Poll for up to 60 seconds
        let result: any = null;

        for (let poll = 1; poll <= maxPolls; poll++) {
          // Wait 1 second before each poll
          await new Promise(resolve => setTimeout(resolve, 1000));

          try {
            result = await webscriptApi.executeWebScript(
              'GET',
              `${jsConsoleEndpointClean}/${resultChannel}/executionResult`,
              undefined, // scriptArgs
              undefined, // contextRoot
              undefined, // servicePath
              undefined // postBody
            );

            // Check if execution is complete
            // Completion is signaled by: error OR result array exists OR scriptPerf is present
            const isComplete =
              result?.error !== undefined ||
              Array.isArray(result?.result) ||
              result?.scriptPerf !== undefined;

            if (isComplete) {
              log.debug(
                {
                  serverId,
                  poll,
                  printOutputLength: result.printOutput?.length || 0,
                },
                'Script execution completed'
              );
              break;
            }

            // Log progress for long-running scripts
            if (poll % 5 === 0) {
              log.debug(
                { serverId, poll, printOutputLength: result?.printOutput?.length || 0 },
                'Polling...'
              );
            }
          } catch (pollError) {
            // Continue polling on errors (result might not be ready yet)
            log.debug({ serverId, poll, error: pollError }, 'Poll attempt failed');
          }
        }

        // Save execution to history
        const output = result?.printOutput
          ? Array.isArray(result.printOutput)
            ? result.printOutput.join('\n')
            : String(result.printOutput)
          : null;

        const error = result?.error
          ? typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error)
          : null;

        await jsConsoleHistoryService.create({
          userId,
          serverId,
          script,
          output,
          error,
        });

        // Return the final result
        return {
          success: true,
          result,
        };
      } catch (error) {
        log.error({ err: error, serverId }, 'JavaScript execution failed');

        // Try to save the error to history
        await jsConsoleHistoryService.create({
          userId: await getCurrentUserId(),
          serverId,
          script,
          output: null,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    },
  };

  // Get JavaScript script files from Data Dictionary
  routes['backend.jsconsole.getScriptFiles'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId: number };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      try {
        const { SearchApi } = await import('@alfresco/js-api');
        const searchApi = new SearchApi(api);

        // Search for JavaScript files in the Scripts folder using AFTS
        const aftsQuery =
          'PATH:"/app:company_home/app:dictionary/app:scripts//*" AND TYPE:"cm:content"';

        const searchRequest = {
          query: {
            query: aftsQuery,
            language: 'afts',
          },
          include: ['properties'],
          fields: ['id', 'name', 'content', 'modifiedAt'],
        };

        const searchResult = await searchApi.search(searchRequest);

        log.debug(
          { serverId, searchResult: JSON.stringify(searchResult, null, 2) },
          'Search result from Alfresco'
        );

        // Filter to only include JavaScript files (.js extension)
        const jsFiles = (searchResult.list?.entries || [])
          .map((entry: any) => entry.entry)
          .filter(
            (node: any) => node.content && node.name && node.name.toLowerCase().endsWith('.js')
          )
          .map((node: any) => ({
            id: node.id,
            name: node.name,
            nodeRef: `workspace://SpacesStore/${node.id}`,
            modifiedAt: node.modifiedAt,
            size: node.content?.sizeInBytes || 0,
          }));

        log.debug({ serverId, count: jsFiles.length, jsFiles }, 'JavaScript files found');
        return jsFiles;
      } catch (error) {
        log.error({ err: error, serverId }, 'Failed to search for script files');
        throw error;
      }
    },
  };

  // Load JavaScript script file content
  routes['backend.jsconsole.loadScriptFile'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId } = params as { serverId: number; nodeId: string };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      try {
        const { NodesApi } = await import('@alfresco/js-api');
        const nodesApi = new NodesApi(api);

        const [content, nodeDetails] = await Promise.all([
          nodesApi.getNodeContent(nodeId),
          nodesApi.getNode(nodeId, {
            include: ['path'],
            fields: ['id', 'name', 'nodeType', 'content', 'path'],
          }),
        ]);

        // Content is a Blob, convert to text
        let scriptContent = '';
        if (content instanceof Blob) {
          scriptContent = await content.text();
        } else if (typeof content === 'string') {
          scriptContent = content;
        } else {
          scriptContent = String(content);
        }

        const nodeEntry: any = (nodeDetails as any)?.entry ?? nodeDetails;

        await nodeHistoryService.recordAccess({
          userId,
          serverId,
          nodeRef: normalizeNodeRef(nodeEntry?.id ?? nodeId),
          parentRef: extractParentRefFromNodeEntry(nodeEntry),
          name: nodeEntry?.name ?? null,
          path: nodeEntry?.path?.name ?? null,
          type: nodeEntry?.nodeType ?? null,
          mimetype: nodeEntry?.content?.mimeType ?? null,
        });

        return {
          content: scriptContent,
        };
      } catch (error) {
        log.error({ err: error, serverId, nodeId }, 'Failed to load script file');
        throw error;
      }
    },
  };

  // Get Alfresco authentication ticket for a server
  routes['backend.servers.getAuthTicket'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId } = params as { serverId: number };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      // Get the authentication ticket
      const ticket = api!.config?.ticketEcm || api!.getTicket();

      return {
        ticket: ticket || null,
      };
    },
  };

  // Save JavaScript script file content
  routes['backend.jsconsole.saveScriptFile'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      content: z.string(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { serverId, nodeId, content } = params as {
        serverId: number;
        nodeId: string;
        content: string;
      };

      // Get server details
      const server = await serverService.findById(userId, serverId);
      if (!server) {
        AppErrors.notFound('Server', serverId);
      }

      // TypeScript doesn't recognize never-return, so we assert server is defined
      const serverDefined = server!;

      // Use centralized authentication with automatic token refresh (DRY principle)
      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        serverDefined.baseUrl,
        prisma
      );
      if (!api) {
        AppErrors.unauthorized('No stored credentials found for server');
      }

      try {
        const { NodesApi } = await import('@alfresco/js-api');
        const nodesApi = new NodesApi(api);

        // Update the node content
        await nodesApi.updateNodeContent(nodeId, content);

        log.debug({ serverId, nodeId, contentLength: content.length }, 'Script file saved');

        return {
          success: true,
          message: 'Script saved successfully',
        };
      } catch (error) {
        log.error({ err: error, serverId, nodeId }, 'Failed to save script file');
        throw error;
      }
    },
  };

  // User operations
  routes['backend.user.get'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const user = await getUser(userId);
      if (!user) {
        AppErrors.notFound('User');
      }
      // TypeScript doesn't recognize never-return, so we assert user is defined
      const userDefined = user!;
      return {
        id: userDefined.id,
        username: userDefined.username,
        fullName: userDefined.fullName,
        email: userDefined.email,
        thumbnail: userDefined.thumbnail ?? null,
      };
    },
  };

  routes['backend.user.update'] = {
    schema: z.object({
      fullName: z.string().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { fullName, thumbnail } = params as {
        fullName?: string | null;
        thumbnail?: string | null;
      };
      await updateUserProfile(userId, {
        fullName: fullName === undefined ? undefined : fullName,
        thumbnail: thumbnail === undefined ? undefined : thumbnail,
      });
      return { success: true, thumbnail: thumbnail ?? null };
    },
  };
}
