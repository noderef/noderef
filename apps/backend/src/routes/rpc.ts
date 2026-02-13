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
 * Main RPC router setup and POST /rpc handler
 */

import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { sendAppError } from '../lib/errorHandler.js';
import { log } from '../lib/logger.js';

export type ZSchema = z.ZodTypeAny;
export type Routes = Record<string, { schema: ZSchema; handler: (p: unknown) => Promise<unknown> }>;

/**
 * Create RPC POST handler
 */
export function rpcHandler(routes: Routes): RequestHandler {
  return async (req, res) => {
    const { method, params } = req.body ?? {};

    // Validate method
    if (typeof method !== 'string' || method.length === 0 || method.length > 64) {
      return res.status(400).json({ error: 'Invalid method' });
    }

    const route = routes[method];
    if (!route) {
      log.warn({ method }, 'Unknown RPC method');
      return res.status(404).json({ error: 'Unknown method' });
    }

    try {
      const parsed = route.schema.parse(params);
      const result = await route.handler(parsed);
      return res.json(result);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
        log.warn({ method, error: (err as { message?: string }).message }, 'RPC validation error');
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
          details: { zodError: (err as { errors?: unknown }).errors },
        });
      }

      log.error({ method, error: err }, 'RPC call failed');
      sendAppError(res, err);
    }
  };
}

/**
 * Create debug endpoint handler for listing RPC methods
 */
export function rpcDebugHandler(routes: Routes): RequestHandler {
  return (_req, res) => {
    res.json({
      methods: Object.keys(routes).sort(),
      count: Object.keys(routes).length,
      alfrescoMethods: Object.keys(routes).filter(k => k.startsWith('alfresco.')),
    });
  };
}

/**
 * Register ping route
 */
export function registerPingRoute(routes: Routes, PingRequestSchema: z.ZodTypeAny): void {
  routes.ping = {
    schema: PingRequestSchema,
    handler: async params => {
      const input = PingRequestSchema.parse(params);
      return {
        message: 'pong',
        timestamp: Date.now(),
        echo: input,
      };
    },
  };
}
