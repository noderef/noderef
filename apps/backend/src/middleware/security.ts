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
 * Security middleware configuration
 * Includes Helmet CSP, rate limiting, and content-type validation
 */

import type { Express, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Configure Helmet security headers
 */
function helmetMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: isDev
      ? false
      : {
          useDefaults: true,
          directives: {
            // Allow Neutralino's loopback fetches and inline scripts from your bundle (no eval)
            'default-src': ["'self'"],
            'script-src': ["'self'"], // avoid 'unsafe-inline' if possible
            'style-src': ["'self'", "'unsafe-inline'"], // Mantine injects styles
            'img-src': ["'self'", 'data:'],
            'font-src': ["'self'", 'data:'],
            'connect-src': ["'self'", 'http://127.0.0.1:*'],
            'worker-src': ["'self'", 'blob:'], // Monaco workers
            'child-src': ['blob:'], // for older UA compatibility
            'object-src': ["'none'"],
            'base-uri': ["'none'"],
            'frame-ancestors': ["'none'"],
          },
        },
    crossOriginOpenerPolicy: isDev ? false : { policy: 'same-origin' },
    crossOriginResourcePolicy: isDev ? { policy: 'cross-origin' } : { policy: 'same-origin' },
  });
}

/**
 * Rate limiter for standard RPC endpoints
 */
function rpcRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 10_000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Rate limiter for binary upload endpoints (lower limit)
 */
function binaryRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 10_000,
    max: 50,
  });
}

/**
 * Rate limiter for stream download endpoints (lower limit)
 */
function streamRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 10_000,
    max: 50,
  });
}

/**
 * Content-type validation middleware for RPC endpoints
 */
function contentTypeValidator(): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'POST' && req.path === '/rpc') {
      const ct = req.headers['content-type'] || '';
      if (!ct.startsWith('application/json')) {
        return res.status(415).end();
      }
    }
    next();
  };
}

/**
 * Apply all security middleware to the Express app
 */
export function applySecurityMiddleware(app: Express): void {
  // Disable default Express headers
  app.disable('x-powered-by');

  // Security headers
  app.use(helmetMiddleware());

  // Content-type validation
  app.use(contentTypeValidator());

  // Rate limiting for RPC routes
  app.use('/rpc', rpcRateLimiter());
  app.use('/rpc-binary', binaryRateLimiter());
  app.use('/rpc-stream', streamRateLimiter());
  // Agent SSE: one long-lived GET per run; allow more connection attempts than binary downloads.
  app.use(
    '/rpc/agent/runs',
    rateLimit({
      windowMs: 10_000,
      max: isDev ? 200 : 80,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
}
