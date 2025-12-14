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

import type {
  AlfrescoRpcCall,
  AlfrescoRpcResponse,
  ConfigureOAuth2Req,
  ConfigureOAuth2Res,
  ExchangeOAuth2TokenReq,
  ExchangeOAuth2TokenRes,
  LoginReq,
  LoginRes,
  LogoutReq,
  LogoutRes,
  PollOAuth2CodeReq,
  PollOAuth2CodeRes,
  ValidateCredentialsReq,
  ValidateCredentialsRes,
} from '@app/contracts';
import { getRpcBaseUrl, rpc, waitForBackend } from './rpc.js';

/**
 * Generic RPC client for Alfresco operations
 * All Alfresco SDK methods are accessed via the generic proxy interface
 */

/**
 * Generic call method for any Alfresco SDK method
 * @param method The dotted method name (e.g., "nodes.getNode", "people.getPerson", "sites.listSites")
 * @param args The arguments to pass to the method (can be object or array)
 * @param baseUrl The base URL of the Alfresco server
 * @returns The raw SDK response
 */
export async function call(
  method: string,
  args: unknown,
  baseUrl: string,
  serverId?: number
): Promise<AlfrescoRpcResponse> {
  console.log(`📡 RPC Call: ${method}`, { baseUrl, args, serverId });
  const req: AlfrescoRpcCall = {
    baseUrl,
    method,
    args,
    serverId,
  };
  const startTime = Date.now();
  try {
    const result = await rpc<AlfrescoRpcResponse>('alfresco.call', req);
    const duration = Date.now() - startTime;
    console.log(`📡 RPC Response: ${method} (${duration}ms)`, result);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`📡 RPC Error: ${method} (${duration}ms)`, error);
    throw error;
  }
}

type RpcBinaryOptions = Record<string, unknown> & {
  serverId?: number;
  args?: unknown[] | Record<string, unknown>;
};

/**
 * Upload a file using multipart/form-data
 * @param method The dotted method name (e.g., "upload.uploadFile")
 * @param baseUrl The base URL of the Alfresco server
 * @param file The file to upload (File or Blob)
 * @param options Additional options to pass to the upload method (serverId, args, custom fields)
 * @returns The raw SDK response
 */
export async function rpcBinary(
  method: string,
  baseUrl: string,
  file: File | Blob,
  options?: RpcBinaryOptions
): Promise<unknown> {
  const formData = new FormData();
  formData.set('baseUrl', baseUrl);
  formData.set('method', method);

  if (options?.serverId !== undefined) {
    formData.set('serverId', String(options.serverId));
  }

  if (options?.args !== undefined) {
    formData.set('_args', JSON.stringify(options.args));
  }

  const fileName =
    (file instanceof File && file.name) || // Browser File
    (typeof (file as { name?: string }).name === 'string'
      ? (file as { name?: string }).name
      : undefined);
  formData.append('filedata', file, fileName ?? 'upload.bin'); // Use 'filedata' as field name to match backend

  // Add options as form fields
  if (options) {
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined || value === null) continue;
      if (key === 'serverId' || key === 'args') continue;
      if (typeof value === 'object') {
        formData.set(key, JSON.stringify(value));
      } else {
        formData.set(key, String(value));
      }
    }
  }

  const backendUrl = await getBackendUrl();
  const url = `${backendUrl}/rpc-binary`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(async () => ({ message: await response.text() }));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Build a URL for streaming downloads
 * @param method The dotted method name (e.g., "nodes.getContent")
 * @param params Query parameters including baseUrl and method-specific params
 * @returns The URL for the stream endpoint
 */
export async function buildStreamUrl(
  method: string,
  params: Record<string, string | number>
): Promise<string> {
  const backendUrl = await getBackendUrl();
  const queryParams = new URLSearchParams({
    method,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${backendUrl}/rpc-stream?${queryParams.toString()}`;
}

/**
 * Get the backend URL (helper function)
 * This is a workaround since baseURL is not exported from rpc.ts
 * In a real implementation, we'd export baseURL or use a shared config
 */
async function getBackendUrl(): Promise<string> {
  await waitForBackend();
  return getRpcBaseUrl();
}

/**
 * Typed RPC client for Alfresco operations
 * Provides semantic helpers that forward to the generic call method
 */
export const alfrescoRpc = {
  /**
   * Generic call method for any Alfresco SDK method
   */
  call,

  /**
   * Upload a file using multipart/form-data
   */
  rpcBinary,

  /**
   * Build a URL for streaming downloads
   */
  buildStreamUrl,

  /**
   * Login to an Alfresco server
   */
  async login(req: LoginReq): Promise<LoginRes> {
    console.log(`🔐 RPC Login:`, { baseUrl: req.baseUrl, username: req.username });
    const startTime = Date.now();
    try {
      const result = await rpc<LoginRes>('alfresco.login', req);
      const duration = Date.now() - startTime;
      console.log(`🔐 RPC Login Response (${duration}ms):`, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`🔐 RPC Login Error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Logout from an Alfresco server
   */
  async logout(req: LogoutReq): Promise<LogoutRes> {
    console.log(`🚪 RPC Logout:`, { baseUrl: req.baseUrl });
    const startTime = Date.now();
    try {
      const result = await rpc<LogoutRes>('alfresco.logout', req);
      const duration = Date.now() - startTime;
      console.log(`🚪 RPC Logout Response (${duration}ms):`, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`🚪 RPC Logout Error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Validate credentials and check admin status
   */
  async validateCredentials(req: ValidateCredentialsReq): Promise<ValidateCredentialsRes> {
    console.log(`✅ RPC Validate Credentials:`, { baseUrl: req.baseUrl, username: req.username });
    const startTime = Date.now();
    try {
      const result = await rpc<ValidateCredentialsRes>('alfresco.validateCredentials', req);
      const duration = Date.now() - startTime;
      console.log(`✅ RPC Validate Credentials Response (${duration}ms):`, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`✅ RPC Validate Credentials Error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Configure OAuth2 authentication
   */
  async configureOAuth2(req: ConfigureOAuth2Req): Promise<ConfigureOAuth2Res> {
    console.log(`🔐 RPC Configure OAuth2:`, {
      baseUrl: req.baseUrl,
      host: req.host,
      realm: req.realm,
    });
    const startTime = Date.now();
    try {
      const result = await rpc<ConfigureOAuth2Res>('alfresco.auth.configureOAuth2', req);
      const duration = Date.now() - startTime;
      console.log(`🔐 RPC Configure OAuth2 Response (${duration}ms):`, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`🔐 RPC Configure OAuth2 Error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Exchange OAuth2 authorization code for access token
   */
  async exchangeOAuth2Token(req: ExchangeOAuth2TokenReq): Promise<ExchangeOAuth2TokenRes> {
    console.log(`🔐 RPC Exchange OAuth2 Token:`, {
      baseUrl: req.baseUrl,
      host: req.host,
      realm: req.realm,
    });
    const startTime = Date.now();
    try {
      const result = await rpc<ExchangeOAuth2TokenRes>('alfresco.auth.exchangeOAuth2Token', req);
      const duration = Date.now() - startTime;
      console.log(`🔐 RPC Exchange OAuth2 Token Response (${duration}ms):`, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`🔐 RPC Exchange OAuth2 Token Error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Poll for OAuth2 authorization code (for desktop OAuth flow)
   */
  async pollOAuth2Code(req: PollOAuth2CodeReq): Promise<PollOAuth2CodeRes> {
    const startTime = Date.now();
    try {
      const result = await rpc<PollOAuth2CodeRes>('alfresco.auth.pollOAuth2Code', req);
      const duration = Date.now() - startTime;
      console.log(`🔐 RPC Poll OAuth2 Code Response (${duration}ms):`, result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`🔐 RPC Poll OAuth2 Code Error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Get the current authenticated user
   * Uses the generic proxy: people.getPerson('-me-')
   * Note: getPerson expects a positional string argument, so we pass it as an array
   */
  async getCurrentUser(baseUrl: string): Promise<unknown> {
    return call('people.getPerson', ['-me-'], baseUrl);
  },

  /**
   * List sites available to the current user
   * Uses the generic proxy: sites.listSites(options)
   */
  async listSites(baseUrl: string, options?: { maxItems?: number }): Promise<unknown> {
    return call('sites.listSites', options || {}, baseUrl);
  },

  /**
   * List groups available to the current user
   * Uses the generic proxy: groups.listGroups(options)
   */
  async listGroups(
    baseUrl: string,
    options?: { maxItems?: number; skipCount?: number }
  ): Promise<unknown> {
    return call('groups.listGroups', options || {}, baseUrl);
  },

  /**
   * Get members of a specific group
   * Uses the generic proxy: groups.listGroupMemberships(groupId, options)
   */
  async getGroupMembers(
    baseUrl: string,
    groupId: string,
    options?: { maxItems?: number; skipCount?: number }
  ): Promise<unknown> {
    return call('groups.listGroupMemberships', [groupId, options || {}], baseUrl);
  },

  /**
   * Semantic helpers for common operations
   * These forward to the generic call method for discoverability
   */
  nodes: {
    getNode: (baseUrl: string, nodeId: string, opts?: unknown) =>
      call('nodes.getNode', { nodeId, ...(opts || {}) }, baseUrl),
  },

  people: {
    getPerson: (baseUrl: string, personId: string, opts?: unknown) =>
      call('people.getPerson', opts ? [personId, opts] : [personId], baseUrl),
  },

  sites: {
    getSite: (baseUrl: string, siteId: string, opts?: unknown) =>
      call('sites.getSite', { siteId, ...(opts || {}) }, baseUrl),
    listSites: (baseUrl: string, opts?: { maxItems?: number }) =>
      call('sites.listSites', opts || {}, baseUrl),
  },

  groups: {
    listGroups: (baseUrl: string, opts?: { maxItems?: number; skipCount?: number }) =>
      call('groups.listGroups', opts || {}, baseUrl),
    listGroupMemberships: (
      baseUrl: string,
      groupId: string,
      opts?: { maxItems?: number; skipCount?: number }
    ) => call('groups.listGroupMemberships', [groupId, opts || {}], baseUrl),
  },

  search: {
    search: (baseUrl: string, queryBody: unknown) => call('search.search', { queryBody }, baseUrl),
  },
};
