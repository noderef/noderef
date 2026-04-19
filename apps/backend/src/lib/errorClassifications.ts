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

function getErrorCode(reason: unknown): string | undefined {
  const code =
    (reason as any)?.code || (reason as any)?.error?.code || (reason as any)?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorMessage(reason: unknown): string {
  return typeof (reason as any)?.message === 'string' ? (reason as any).message : '';
}

function getErrorStatus(reason: unknown): number | undefined {
  const status =
    (reason as any)?.status ??
    (reason as any)?.statusCode ??
    (reason as any)?.response?.status ??
    (reason as any)?.response?.statusCode;

  return typeof status === 'number' ? status : undefined;
}

export function isTransientNetworkFailure(reason: unknown): boolean {
  const code = getErrorCode(reason);
  const message = getErrorMessage(reason);

  const transientCodes = [
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
  ];

  return (
    (code ? transientCodes.includes(code) : false) ||
    transientCodes.some(c => message.includes(c)) ||
    message.includes('connect ECONNREFUSED') ||
    getErrorStatus(reason) === 502 ||
    getErrorStatus(reason) === 503 ||
    getErrorStatus(reason) === 504
  );
}

export function isExpectedAuthFailure(reason: unknown): boolean {
  const status = getErrorStatus(reason);
  const message = getErrorMessage(reason);
  const errorKey =
    (reason as any)?.error?.errorKey ??
    (reason as any)?.response?.body?.error?.errorKey ??
    (reason as any)?.response?.error?.errorKey;

  return (
    status === 401 ||
    status === 403 ||
    /login failed/i.test(message) ||
    /authentication failed/i.test(message) ||
    errorKey === 'Login failed'
  );
}

export function isExpectedUpstreamHttpFailure(reason: unknown): boolean {
  const status = getErrorStatus(reason);
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return true;
  }

  const message = getErrorMessage(reason);
  return (
    /<html>/i.test(message) &&
    /(404 not found|401 unauthorized|403 forbidden|500 internal server error)/i.test(message)
  );
}
