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
 * CORS middleware for Neutralino-friendly cross-origin handling
 */

import type { RequestHandler } from 'express';

/**
 * Strict but Neutralino-friendly CORS middleware
 * - Allows loopback origins (localhost, 127.0.0.1)
 * - Allows null origin for Neutralino desktop app
 * - Blocks everything else
 */
export function corsMiddleware(): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // CORS leniency for dev: accept any loopback port (Vite can run on 3000, 5173, etc.)
    // In prod (Neutralino), origin is often 'null' - allow it for loopback-only service
    const isLoopback =
      typeof origin === 'string' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

    if (!origin || origin === 'null' || isLoopback) {
      // For loopback-only service, '*' is safe (no credentials used)
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else {
      // Block everything else - don't set CORS header, let browser block it
      // This prevents the backend from being accessed from arbitrary web origins
      res.setHeader('Access-Control-Allow-Origin', 'null');
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('X-NodeRef', 'backend@dev');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  };
}
