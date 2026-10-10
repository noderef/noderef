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
 * Local request gate: Host validation, Origin allowlist, per-launch token, CORS.
 *
 * CORS headers are not a security boundary. Disallowed origins/hosts are
 * rejected (403) before handlers run so simple/no-preflight requests cannot
 * trigger side effects.
 */

import type { Request, RequestHandler, Response } from 'express';
import {
  isLaunchTokenRequired,
  isServeStaticMode,
  LAUNCH_TOKEN_QUERY,
  requestHasValidLaunchToken,
} from '../lib/launchToken.js';
import {
  getRequestOrigin,
  isAllowedWebOrigin,
  isHealthPath,
  isHostAllowed,
  isNullOrigin,
  isOidcCallbackPath,
  isPublicUnauthenticatedPath,
  isWebAuthPublicPath,
} from '../lib/requestGate.js';

const ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Last-Event-ID',
  'X-NodeRef-Token',
].join(', ');

function applyCorsHeaders(res: Response, allowOrigin: string): void {
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', 'X-NodeRef, X-NodeRef-Build');
}

function sendForbidden(res: Response, code: string, message: string, corsOrigin?: string): void {
  if (corsOrigin) {
    applyCorsHeaders(res, corsOrigin);
  }
  res.status(403).json({ code, message });
}

function sendUnauthorized(res: Response, corsOrigin?: string): void {
  if (corsOrigin) {
    applyCorsHeaders(res, corsOrigin);
  }
  res.status(401).json({
    code: 'LAUNCH_TOKEN_REQUIRED',
    message: 'Invalid or missing launch token.',
  });
}

/**
 * Origin to echo in ACAO. `null` is only echoed for:
 * - Neutralino preflight on desktop (so the real request can carry the token)
 * - Authenticated Neutralino requests
 * - Unauthenticated /health discovery (no secrets)
 */
function corsOriginFor(req: Request): string | undefined {
  const origin = getRequestOrigin(req.headers.origin);
  if (isAllowedWebOrigin(origin, req.headers.host)) {
    return origin;
  }
  if (origin && isNullOrigin(origin) && !isServeStaticMode()) {
    if (
      req.method === 'OPTIONS' ||
      requestHasValidLaunchToken(req) ||
      isHealthPath(req.method, req.path)
    ) {
      return 'null';
    }
  }
  return undefined;
}

function isOriginAcceptable(req: Request): boolean {
  const origin = getRequestOrigin(req.headers.origin);

  if (isPublicUnauthenticatedPath(req.method, req.path)) {
    return true;
  }

  if (req.method === 'OPTIONS') {
    if (isAllowedWebOrigin(origin, req.headers.host)) {
      return true;
    }
    // Desktop Neutralino may preflight as Origin: null; OPTIONS has no side effects.
    if (isNullOrigin(origin) && !isServeStaticMode()) {
      return true;
    }
    if (!origin && isServeStaticMode()) {
      return true;
    }
    return false;
  }

  if (isAllowedWebOrigin(origin, req.headers.host)) {
    return true;
  }

  // Missing Origin is not a CORS web origin. Desktop still requires the
  // launch token below; Docker web mode allows it (curl / some same-origin GETs).
  if (!origin) {
    return true;
  }

  if (isNullOrigin(origin)) {
    return !isServeStaticMode() && requestHasValidLaunchToken(req);
  }

  return false;
}

export function localRequestGuardMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!isHostAllowed(req.headers.host)) {
      return sendForbidden(res, 'FORBIDDEN_HOST', 'Invalid Host header.');
    }

    const corsOrigin = corsOriginFor(req);

    if (!isOriginAcceptable(req)) {
      return sendForbidden(res, 'FORBIDDEN_ORIGIN', 'Request origin is not allowed.', corsOrigin);
    }

    if (corsOrigin) {
      applyCorsHeaders(res, corsOrigin);
    } else {
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    if (isOidcCallbackPath(req.method, req.path) || isHealthPath(req.method, req.path)) {
      return next();
    }

    if (isWebAuthPublicPath(req.method, req.path)) {
      return next();
    }

    if (isLaunchTokenRequired() && !requestHasValidLaunchToken(req)) {
      return sendUnauthorized(res, corsOrigin);
    }

    const query = req.query as Record<string, unknown> | undefined;
    if (query) {
      try {
        delete query[LAUNCH_TOKEN_QUERY];
      } catch {
        // Query object may be immutable depending on Express version.
      }
    }

    next();
  };
}
