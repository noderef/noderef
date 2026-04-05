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
 * Stream download endpoint (GET /rpc-stream)
 */

import type { AlfrescoApi } from '@alfresco/js-api';
import { NodesApi } from '@alfresco/js-api';
import axios from 'axios';
import type { RequestHandler } from 'express';
import { getAlfrescoNodeContentPath } from '../lib/alfresco-endpoints.js';
import { normalizeBaseUrl } from '../lib/alfresco-url.js';
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
    const contentUrl = `${normalizeBaseUrl(basePath)}${getAlfrescoNodeContentPath(nodeId, property)}`;

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
const setResponseHeaders = (res: any, headers: Record<string, unknown> | undefined): void => {
  if (!headers) {
    return;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) {
      res.setHeader(key, String(value));
    }
  }
};

const isReadableStream = (value: unknown): value is NodeJS.ReadableStream => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return typeof (value as { pipe?: unknown }).pipe === 'function';
};

const isEmptyObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Buffer.isBuffer(value) &&
  Object.keys(value).length === 0;

const sendText = (res: any, text: string): void => {
  res.type('text/plain; charset=utf-8');
  res.send(text);
};

const handleAxiosEmptyObjectFallback = (result: any, res: any): boolean => {
  if (!isEmptyObject(result.data)) {
    return false;
  }

  if (typeof result.request?.responseText === 'string' && result.request.responseText.length > 0) {
    sendText(res, result.request.responseText);
    return true;
  }
  if (typeof result.response?.data === 'string') {
    sendText(res, result.response.data);
    return true;
  }
  return false;
};

function handleStreamResult(result: any, res: any): void {
  if (result?.data !== undefined) {
    setResponseHeaders(res, result.headers);

    if (Buffer.isBuffer(result.data)) {
      res.send(result.data);
      return;
    }
    if (isReadableStream(result.data)) {
      result.data.pipe(res);
      return;
    }
    if (typeof result.data === 'string') {
      if (!res.getHeader('content-type')) {
        sendText(res, result.data);
      } else {
        res.send(result.data);
      }
      return;
    }
    if (handleAxiosEmptyObjectFallback(result, res)) {
      return;
    }
    res.send(result.data);
    return;
  }

  if (isReadableStream(result)) {
    result.pipe(res);
    return;
  }
  if (typeof result === 'string') {
    sendText(res, result);
    return;
  }
  if (Buffer.isBuffer(result)) {
    res.type('application/octet-stream');
    res.send(result);
    return;
  }
  if (isEmptyObject(result)) {
    sendText(res, '');
    return;
  }
  res.json(result);
}

type StreamQuery = Record<string, string | string[]>;

interface ParsedStreamRequest {
  baseUrl: string;
  method: string;
  serverId?: number;
  rest: StreamQuery;
}

const parseStreamRequestQuery = (query: StreamQuery): ParsedStreamRequest => {
  const { baseUrl: baseUrlRaw, method: methodRaw, serverId: serverIdRaw, ...rest } = query;

  const baseUrl = Array.isArray(baseUrlRaw) ? baseUrlRaw[0] : baseUrlRaw;
  const method = Array.isArray(methodRaw) ? methodRaw[0] : methodRaw;

  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('INVALID_BASE_URL');
  }
  if (!method || typeof method !== 'string') {
    throw new Error('INVALID_METHOD');
  }

  let serverId: number | undefined;
  if (serverIdRaw !== undefined) {
    const rawValue = Array.isArray(serverIdRaw) ? serverIdRaw[0] : serverIdRaw;
    if (rawValue && rawValue.length) {
      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isNaN(parsed)) {
        throw new Error('INVALID_SERVER_ID');
      }
      serverId = parsed;
    }
  }

  return { baseUrl, method, serverId, rest };
};

const validateStreamRequest = (
  parsed: ParsedStreamRequest,
  contracts: any
): { code: string; message: string; details?: Record<string, unknown> } | null => {
  if (!contracts?.AlfrescoRpcStreamCallSchema) {
    return null;
  }

  try {
    contracts.AlfrescoRpcStreamCallSchema.passthrough().parse({
      baseUrl: parsed.baseUrl,
      method: parsed.method,
    });
    return null;
  } catch (validationErr) {
    log.warn({ error: validationErr }, 'Stream RPC validation error');
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request parameters',
      details: { zodError: (validationErr as { errors?: unknown }).errors },
    };
  }
};

const parseStreamArgs = (rest: StreamQuery): unknown => {
  if (typeof rest._args === 'string') {
    try {
      return JSON.parse(rest._args);
    } catch {
      // Fallback to key/value coercion below.
    }
  }

  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === '_args') {
      continue;
    }
    args[key] = coerceQueryValue(value);
  }
  return args;
};

const maybeHandleNodeContentDownload = async (params: {
  parsed: ParsedStreamRequest;
  args: unknown;
  authenticatedApi: AlfrescoApi | undefined;
  res: any;
}): Promise<boolean> => {
  const { parsed, args, authenticatedApi, res } = params;
  if (parsed.method !== 'nodes.getNodeContent' && parsed.method !== 'nodes.getContent') {
    return false;
  }
  if (!authenticatedApi || parsed.serverId === undefined) {
    return false;
  }

  try {
    return await handleNodeContentDownload(
      authenticatedApi,
      parsed.baseUrl,
      args,
      parsed.rest,
      res
    );
  } catch (directHttpError) {
    log.warn(
      {
        error: directHttpError,
        method: parsed.method,
        nodeId: (args as any)?.nodeId || parsed.rest.nodeId,
      },
      'Direct API call failed, falling back to proxy method'
    );
    return false;
  }
};

const maybeHandleLogFileWebscript = async (params: {
  parsed: ParsedStreamRequest;
  args: unknown;
  authenticatedApi: AlfrescoApi | undefined;
  res: any;
}): Promise<boolean> => {
  const { parsed, args, authenticatedApi, res } = params;
  if (parsed.method !== 'webscript.executeWebScript' || !Array.isArray(args) || args.length < 2) {
    return false;
  }
  if (!authenticatedApi || parsed.serverId === undefined) {
    return false;
  }

  const [, scriptPath] = args as [string, string];
  if (!scriptPath?.includes('log4j-log-file')) {
    return false;
  }

  try {
    return await handleLogFileWebscript(
      authenticatedApi,
      parsed.baseUrl,
      parsed.serverId,
      scriptPath,
      res
    );
  } catch (directHttpError) {
    log.warn(
      { error: directHttpError, scriptPath },
      'Direct HTTP call failed, falling back to API method'
    );
    return false;
  }
};

/**
 * Create RPC stream download handler
 */
export function rpcStreamHandler({ serverService, contracts }: RpcStreamOptions): RequestHandler {
  return async (req, res) => {
    try {
      let parsed: ParsedStreamRequest;
      try {
        parsed = parseStreamRequestQuery(req.query as StreamQuery);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INVALID_INPUT';
        if (message === 'INVALID_BASE_URL') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid baseUrl' });
        }
        if (message === 'INVALID_METHOD') {
          return res
            .status(400)
            .json({ code: 'INVALID_INPUT', message: 'Missing or invalid method' });
        }
        if (message === 'INVALID_SERVER_ID') {
          return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid serverId' });
        }
        return res
          .status(400)
          .json({ code: 'INVALID_INPUT', message: 'Invalid request parameters' });
      }

      const validationError = validateStreamRequest(parsed, contracts);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const args = parseStreamArgs(parsed.rest);
      const authenticatedApi =
        parsed.serverId !== undefined
          ? await authenticateServerRequest(serverService, parsed.baseUrl, parsed.serverId)
          : undefined;

      if (await maybeHandleNodeContentDownload({ parsed, args, authenticatedApi, res })) {
        return;
      }
      if (await maybeHandleLogFileWebscript({ parsed, args, authenticatedApi, res })) {
        return;
      }

      const result: any = await callMethod(parsed.baseUrl, parsed.method, args, authenticatedApi);
      handleStreamResult(result, res);
    } catch (err: unknown) {
      log.error({ error: err }, 'Stream RPC call failed');
      sendAppError(res, err);
    }
  };
}
