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
 * Stream download endpoint (GET /rpc-stream)
 */

import type { AlfrescoApi } from '@alfresco/js-api';
import { NodesApi } from '@alfresco/js-api';
import axios from 'axios';
import type { RequestHandler } from 'express';
import { sendAppError } from '../lib/errorHandler.js';
import { log } from '../lib/logger.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getAuthenticatedClient } from '../services/alfresco/clientFactory.js';
import { callMethod } from '../services/alfresco/proxyService.js';
import { ServerService } from '../services/serverService.js';
import { getCurrentUserId } from '../services/userBootstrap.js';

export interface RpcStreamOptions {
  serverService: ServerService;
  contracts: any;
}

/**
 * Helper to coerce query param values to proper types
 */
function coerceQueryValue(value: string | string[]): unknown {
  if (Array.isArray(value)) {
    return value.map(coerceQueryValue);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

/**
 * Authenticate a server request for stream downloads
 */
async function authenticateServerRequest(
  serverService: ServerService,
  baseUrl: string,
  serverId: number
): Promise<AlfrescoApi | undefined> {
  const userId = await getCurrentUserId();
  const creds = await serverService.getCredentialsForBackend(userId, serverId);

  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    log.warn(
      { serverId, authType: creds?.authType },
      'Missing credentials for server stream request'
    );
    return undefined;
  }

  try {
    return await getAuthenticatedClient(baseUrl, creds);
  } catch (error) {
    log.error({ serverId, error }, 'Failed to authenticate stream request');
    throw error;
  }
}

/**
 * Handle node content download using NodesApi.getNodeContent
 */
async function handleNodeContentDownload(
  authenticatedApi: AlfrescoApi,
  baseUrl: string,
  args: any,
  rest: Record<string, string | string[]>,
  res: any
): Promise<boolean> {
  const nodeId = args?.nodeId || rest.nodeId;
  const property = args?.property || rest.property; // e.g., 'cm:preferenceValues'

  if (!nodeId) {
    throw new Error('nodeId is required');
  }

  // If a specific property is requested (not cm:content), use direct HTTP call
  if (property && property !== 'cm:content') {
    // Build URL: /alfresco/api/-default-/public/alfresco/versions/1/nodes/{nodeId}/content;{property}
    const apiClient = authenticatedApi.contentClient;
    const basePath = apiClient.basePath || baseUrl;
    const contentUrl = `${basePath}/alfresco/api/-default-/public/alfresco/versions/1/nodes/${nodeId}/content;${property}`;

    // Make direct HTTP request with authentication
    const response = await fetch(contentUrl, {
      method: 'GET',
      headers: {
        Authorization: apiClient.authentications?.basicAuth?.username
          ? `Basic ${Buffer.from(`${apiClient.authentications.basicAuth.username}:${apiClient.authentications.basicAuth.password}`).toString('base64')}`
          : (apiClient.defaultHeaders as any)?.['Authorization'] || '',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download property content: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Forward content type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.type(contentType);
    }

    res.send(buffer);
    return true;
  }

  // Use NodesApi.getNodeContent method for cm:content
  const nodesApi = new NodesApi(authenticatedApi);
  const content = await nodesApi.getNodeContent(nodeId);

  // Handle different content types
  if (content instanceof Blob) {
    const arrayBuffer = await content.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Forward content type from blob
    if (content.type) {
      res.type(content.type);
    }

    res.send(buffer);
    return true;
  } else if (Buffer.isBuffer(content)) {
    res.send(content);
    return true;
  } else {
    // Convert to buffer
    const buffer = Buffer.from(String(content));
    res.send(buffer);
    return true;
  }
}

/**
 * Handle log file webscripts with direct HTTP call to avoid JSON parsing
 */
async function handleLogFileWebscript(
  authenticatedApi: AlfrescoApi,
  baseUrl: string,
  serverId: number,
  scriptPath: string,
  res: any
): Promise<boolean> {
  // Build webscript URL: /alfresco/s/{scriptPath}
  // Note: /s/ is shorthand for /service/
  const apiBaseUrl = (authenticatedApi as any).config?.hostEcm || baseUrl;
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  const fullUrl = `${normalizedBaseUrl}/alfresco/s/${scriptPath}`;

  // Get stored credentials for authentication
  const prisma = await getPrismaClient();
  const serverService = new ServerService(prisma);
  const userId = await getCurrentUserId();
  const creds = await serverService.getCredentialsForBackend(userId, serverId);

  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    throw new Error('No stored credentials found for server');
  }

  // Make direct HTTP request with text response type
  // Build authentication based on auth type
  const axiosConfig: any = {
    method: 'GET',
    url: fullUrl,
    responseType: 'text',
    headers: { Accept: 'text/plain,*/*' },
  };

  if (creds.authType === 'openid_connect') {
    // Use Bearer token for OIDC
    axiosConfig.headers.Authorization = `Bearer ${creds.token}`;
  } else {
    // Use Basic Auth for basic auth type
    axiosConfig.auth = {
      username: creds.username || '',
      password: creds.token,
    };
  }

  const response = await axios(axiosConfig);

  // Forward response headers
  if (response.headers) {
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined && value !== null && typeof value !== 'function') {
        res.setHeader(key, String(value));
      }
    }
  }

  res.type('text/plain; charset=utf-8');
  res.send(response.data);
  return true;
}

/**
 * Handle generic stream result
 */
function handleStreamResult(result: any, res: any): void {
  // Handle Axios-style response with data property
  if (result?.data !== undefined) {
    // Forward headers if they exist
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        if (value !== undefined && value !== null) {
          res.setHeader(key, String(value));
        }
      }
    }

    // Handle different data types
    if (Buffer.isBuffer(result.data)) {
      res.send(result.data);
      return;
    }
    if (result.data && typeof result.data === 'object' && 'pipe' in result.data) {
      (result.data as NodeJS.ReadableStream).pipe(res);
      return;
    }
    if (typeof result.data === 'string') {
      // Set content type for text responses if not already set
      if (!res.getHeader('content-type')) {
        res.type('text/plain; charset=utf-8');
      }
      res.send(result.data);
      return;
    }
    // Check if data is an empty object - try to get raw response text
    if (
      typeof result.data === 'object' &&
      result.data !== null &&
      !Buffer.isBuffer(result.data) &&
      Object.keys(result.data).length === 0
    ) {
      // Try to get raw response text from Axios request object
      if (result.request?.responseText !== undefined) {
        const rawText = result.request.responseText;
        if (typeof rawText === 'string' && rawText.length > 0) {
          res.type('text/plain; charset=utf-8');
          res.send(rawText);
          return;
        }
      }
      // Try response.data if available
      if (result.response?.data !== undefined && typeof result.response.data === 'string') {
        res.type('text/plain; charset=utf-8');
        res.send(result.response.data);
        return;
      }
    }
    // For other data types, send as-is
    res.send(result.data);
    return;
  }

  // Handle Node.js stream directly
  if (result && typeof result === 'object' && 'pipe' in result && typeof result.pipe === 'function') {
    (result as NodeJS.ReadableStream).pipe(res);
    return;
  }

  if (typeof result === 'string') {
    res.type('text/plain; charset=utf-8');
    res.send(result);
    return;
  }

  if (Buffer.isBuffer(result)) {
    res.type('application/octet-stream');
    res.send(result);
    return;
  }

  // Check if result is an empty object - return empty string for text responses
  if (typeof result === 'object' && result !== null && Object.keys(result).length === 0) {
    res.type('text/plain; charset=utf-8');
    res.send('');
    return;
  }

  // Fallback: return as JSON if not a stream
  res.json(result);
}

/**
 * Create RPC stream download handler
 */
export function rpcStreamHandler({ serverService, contracts }: RpcStreamOptions): RequestHandler {
  return async (req, res) => {
    try {
      const {
        baseUrl: baseUrlRaw,
        method: methodRaw,
        serverId: serverIdRaw,
        ...rest
      } = req.query as Record<string, string | string[]>;

      // Extract and validate baseUrl and method (ensure they're strings, not arrays)
      const baseUrl = Array.isArray(baseUrlRaw) ? baseUrlRaw[0] : baseUrlRaw;
      const method = Array.isArray(methodRaw) ? methodRaw[0] : methodRaw;

      let serverId: number | undefined;
      if (serverIdRaw !== undefined) {
        const rawValue = Array.isArray(serverIdRaw) ? serverIdRaw[0] : serverIdRaw;
        if (rawValue && rawValue.length) {
          const parsed = Number.parseInt(rawValue, 10);
          if (Number.isNaN(parsed)) {
            return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid serverId' });
          }
          serverId = parsed;
        }
      }

      // Validate with zod schema if available
      if (contracts?.AlfrescoRpcStreamCallSchema) {
        try {
          contracts.AlfrescoRpcStreamCallSchema.passthrough().parse({ baseUrl, method });
        } catch (validationErr) {
          log.warn({ error: validationErr }, 'Stream RPC validation error');
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: { zodError: (validationErr as { errors?: unknown }).errors },
          });
        }
      } else {
        // Fallback validation
        if (!baseUrl || typeof baseUrl !== 'string') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid baseUrl' });
        }
        if (!method || typeof method !== 'string') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid method' });
        }
      }

      // Convert query params to proper types for SDK
      // Special handling: if _args is provided as JSON string, parse it as array/object
      let args: unknown;
      if (rest._args && typeof rest._args === 'string') {
        try {
          args = JSON.parse(rest._args);
        } catch {
          // If parsing fails, fall back to object approach
          args = {};
          for (const [key, value] of Object.entries(rest)) {
            if (key !== '_args') {
              (args as Record<string, unknown>)[key] = coerceQueryValue(value);
            }
          }
        }
      } else {
        // Default: convert query params to object
        args = {};
        for (const [key, value] of Object.entries(rest)) {
          (args as Record<string, unknown>)[key] = coerceQueryValue(value);
        }
      }

      // Call the method via proxy service
      let authenticatedApi: AlfrescoApi | undefined;
      if (serverId !== undefined) {
        authenticatedApi = await authenticateServerRequest(serverService, baseUrl, serverId);
      }

      // Special handling for node content download - use NodesApi.getNodeContent
      if (method === 'nodes.getNodeContent' || method === 'nodes.getContent') {
        try {
          if (authenticatedApi && serverId !== undefined) {
            const handled = await handleNodeContentDownload(authenticatedApi, baseUrl, args, rest, res);
            if (handled) return;
          }
        } catch (directHttpError) {
          log.warn(
            { error: directHttpError, method, nodeId: (args as any)?.nodeId || rest.nodeId },
            'Direct API call failed, falling back to proxy method'
          );
          // Fall through to normal API call
        }
      }

      // Special handling for log file webscripts - make direct HTTP call to avoid JSON parsing
      if (method === 'webscript.executeWebScript' && Array.isArray(args) && args.length >= 2) {
        const [, scriptPath] = args as [string, string];
        if (scriptPath?.includes('log4j-log-file')) {
          try {
            if (authenticatedApi && serverId !== undefined) {
              const handled = await handleLogFileWebscript(authenticatedApi, baseUrl, serverId, scriptPath, res);
              if (handled) return;
            }
          } catch (directHttpError) {
            log.warn(
              { error: directHttpError, scriptPath },
              'Direct HTTP call failed, falling back to API method'
            );
            // Fall through to normal API call
          }
        }
      }

      const result: any = await callMethod(baseUrl, method, args, authenticatedApi);
      handleStreamResult(result, res);
    } catch (err: unknown) {
      log.error({ error: err }, 'Stream RPC call failed');
      sendAppError(res, err);
    }
  };
}

