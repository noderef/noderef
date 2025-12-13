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
 * Centralized logging configuration
 * All services should import this logger to ensure consistent logging
 */

import pino from 'pino';

// Determine environment
const isDev = process.env.NODE_ENV !== 'production';

// Allow DEBUG (alias) or EXPOSE_DEBUG to influence verbosity when LOG_LEVEL isn't set explicitly.
// Explicitly turning debug "off" (0/false) will quiet logs to "warn" to avoid
// noisy startup output in containerized runs.
// DEBUG is the user-facing alias, EXPOSE_DEBUG is the internal variable (backwards compatible)
const debugFlag = (process.env.DEBUG ?? process.env.EXPOSE_DEBUG ?? '').toLowerCase();
const debugEnabled = debugFlag === '1' || debugFlag === 'true' || debugFlag === 'yes';
const debugDisabled = debugFlag === '0' || debugFlag === 'false' || debugFlag === 'no';

const resolvedLevel =
  process.env.LOG_LEVEL ||
  (isDev || debugEnabled ? 'debug' : debugDisabled ? 'warn' : 'info');

/**
 * Shared logger instance with security-aware configuration
 */
export const log = pino({
  level: resolvedLevel,

  // Redact sensitive fields from logs
  redact: {
    paths: [
      'password',
      'token',
      'refreshToken',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Alfresco API fields
      'username',
      'credentials',
      'secret',
      // Request body redaction for sensitive endpoints
      'req.body.token',
      'req.body.refreshToken',
      'req.body.password',
      'req.body.authorization',
    ],
    censor: '***REDACTED***',
  },

  // Pretty print in development
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Create a child logger for a specific module/service
 */
export function createLogger(name: string) {
  return log.child({ module: name });
}
