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
 * Web password gate routes and middleware for Docker static deployments.
 */

import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import {
  hasValidWebPasswordSession,
  isWebPasswordGateActive,
  isWebPasswordValid,
  setWebPasswordSessionCookie,
} from '../lib/webPasswordAuth.js';

interface WebAuthLoginPayload {
  password?: unknown;
}

export function webAuthStatusHandler(): RequestHandler {
  return (req, res) => {
    const required = isWebPasswordGateActive();
    const authenticated = required ? hasValidWebPasswordSession(req) : false;
    res.json({ required, authenticated });
  };
}

export function webAuthLoginRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many login attempts. Please retry in a minute.',
      });
    },
  });
}

export function webAuthLoginHandler(): RequestHandler {
  return (req, res) => {
    if (!isWebPasswordGateActive()) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Web password gate is not enabled.',
      });
    }

    const body = (req.body ?? {}) as WebAuthLoginPayload;
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isWebPasswordValid(password)) {
      return res.status(401).json({
        code: 'INVALID_PASSWORD',
        message: 'Invalid password.',
      });
    }

    setWebPasswordSessionCookie(req, res);
    res.json({ required: true, authenticated: true });
  };
}

export function webPasswordGateMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!isWebPasswordGateActive()) {
      return next();
    }

    if (hasValidWebPasswordSession(req)) {
      return next();
    }

    return res.status(401).json({
      code: 'WEB_PASSWORD_REQUIRED',
      message: 'Web password authentication required.',
    });
  };
}
