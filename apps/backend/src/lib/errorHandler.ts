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

import type { Response } from 'express';
import { ErrorCode } from '@app/contracts';
import { log } from './logger.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Centralized error handler for RPC routes
 * Maps application error codes to HTTP status codes and formats responses
 *
 * Security note: In production, error details are hidden to prevent information leakage.
 * Full error details are always logged for debugging.
 */
export function sendAppError(res: Response, err: unknown): void {
  const code = (err as any)?.code;
  const details = (err as any)?.details;
  const message = (err as any)?.message || 'Internal error';

  // Map ErrorCode to HTTP status
  const statusMap: Record<string, number> = {
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.INVALID_INPUT]: 400,
    [ErrorCode.TIMEOUT]: 504,
    [ErrorCode.CONNECTION_ERROR]: 503,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503,
    [ErrorCode.CONFLICT]: 409,
  };

  const status = statusMap[code] ?? 500;
  const errorCode = code ?? ErrorCode.UNKNOWN;

  // Log full error details for debugging (with redaction rules from logger config)
  log.error({ err, code, details }, 'RPC error');

  // Build response object
  const response: { code: string; message: string; details?: any } = {
    code: errorCode,
    message,
  };

  // Only include details in non-production environments
  // This prevents leaking internal error messages, stack traces, or connection info
  if (details && !isProd) {
    response.details = details;
  }

  res.status(status).json(response);
}
