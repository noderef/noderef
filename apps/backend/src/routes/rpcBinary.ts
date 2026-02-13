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
 * Binary upload endpoint (POST /rpc-binary with multer)
 */

import type { AlfrescoApi } from '@alfresco/js-api';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { sendAppError } from '../lib/errorHandler.js';
import { log } from '../lib/logger.js';
import { getAuthenticatedClient } from '../services/alfresco/clientFactory.js';
import { callMethod } from '../services/alfresco/proxyService.js';
import { ServerService } from '../services/serverService.js';
import { getCurrentUserId } from '../services/userBootstrap.js';

export interface RpcBinaryOptions {
  serverService: ServerService;
  contracts: any;
}

/**
 * Create multer upload middleware
 */
export function createUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
  });
}

/**
 * Authenticate a server request for binary uploads
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
      'Missing credentials for server binary request'
    );
    return undefined;
  }

  try {
    return await getAuthenticatedClient(baseUrl, creds);
  } catch (error) {
    log.error({ serverId, error }, 'Failed to authenticate binary request');
    throw error;
  }
}

/**
 * Create RPC binary upload handler
 */
export function rpcBinaryHandler({ serverService, contracts }: RpcBinaryOptions): RequestHandler {
  return async (req, res) => {
    try {
      const {
        baseUrl,
        method,
        serverId: serverIdRaw,
        _args: rawArgs,
        ...otherFields
      } = req.body ?? {};

      // Validate with zod schema if available
      if (contracts?.AlfrescoRpcBinaryCallSchema) {
        try {
          contracts.AlfrescoRpcBinaryCallSchema.passthrough().parse({
            baseUrl,
            method,
            serverId: serverIdRaw ? Number(serverIdRaw) : undefined,
          });
        } catch (validationErr) {
          log.warn({ error: validationErr }, 'Binary RPC validation error');
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

      if (!req.file?.buffer) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing filedata' });
      }

      // Prepare file argument with metadata preserved (Alfresco SDK expects name/type)
      const fileArg = req.file.buffer;
      (fileArg as any).name = req.file.originalname;
      (fileArg as any).originalname = req.file.originalname;
      (fileArg as any).size = req.file.size;
      (fileArg as any).type = req.file.mimetype;
      (fileArg as any).lastModified = Date.now();

      // Parse optional _args field (JSON-encoded array/object excluding the binary itself)
      let parsedArgs: unknown;
      if (rawArgs !== undefined) {
        const argValue = Array.isArray(rawArgs) ? rawArgs[0] : rawArgs;
        if (typeof argValue === 'string' && argValue.trim().length > 0) {
          try {
            parsedArgs = JSON.parse(argValue);
          } catch {
            return res
              .status(400)
              .json({ code: 'INVALID_INPUT', message: 'Invalid _args JSON payload' });
          }
        }
      }

      let args: unknown;
      if (parsedArgs !== undefined) {
        if (Array.isArray(parsedArgs)) {
          args = [fileArg, ...parsedArgs];
        } else {
          args = [fileArg, parsedArgs];
        }
      } else {
        // Fallback: treat remaining form fields as options object
        const options = {
          ...otherFields,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        };
        args = [fileArg, options];
      }

      let authenticatedApi: AlfrescoApi | undefined;
      if (serverId !== undefined) {
        authenticatedApi = await authenticateServerRequest(serverService, baseUrl, serverId);
      }

      const result = await callMethod(baseUrl, method, args, authenticatedApi);
      return res.json(result);
    } catch (err: unknown) {
      log.error({ error: err }, 'Binary RPC call failed');
      sendAppError(res, err);
    }
  };
}
