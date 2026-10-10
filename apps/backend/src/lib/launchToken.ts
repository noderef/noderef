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
 * Per-launch backend token. Written to a local runtime file the Neutralino
 * renderer can read (a web page cannot) and required on desktop API requests.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const LAUNCH_TOKEN_HEADER = 'x-noderef-token';
export const LAUNCH_TOKEN_QUERY = 'nr_token';
export const LAUNCH_TOKEN_FILE = 'backend-token';

let launchToken: string | null = null;

export function isServeStaticMode(): boolean {
  return process.env.SERVE_STATIC === '1';
}

/**
 * Desktop (Neutralino / Vite) requires the per-launch token.
 * Docker/SERVE_STATIC uses same-origin + optional WEB_PASSWORD instead.
 */
export function isLaunchTokenRequired(): boolean {
  return !isServeStaticMode();
}

export function getLaunchToken(): string | null {
  return launchToken;
}

export function getOrCreateLaunchToken(): string {
  if (!launchToken) {
    launchToken = randomBytes(32).toString('base64url');
  }
  return launchToken;
}

/** Test-only: pin or clear the in-memory launch token. */
export function setLaunchTokenForTests(token: string | null): void {
  launchToken = token;
}

function hashForSafeCompare(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function tokensEqual(left: string, right: string): boolean {
  return timingSafeEqual(hashForSafeCompare(left), hashForSafeCompare(right));
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export function readLaunchTokenFromRequest(req: Request): string | undefined {
  const header = firstHeaderValue(req.headers[LAUNCH_TOKEN_HEADER])?.trim();
  if (header) {
    return header;
  }
  return firstQueryValue(req.query?.[LAUNCH_TOKEN_QUERY])?.trim();
}

export function requestHasValidLaunchToken(req: Request): boolean {
  if (!launchToken) {
    return false;
  }
  const provided = readLaunchTokenFromRequest(req);
  if (!provided) {
    return false;
  }
  return tokensEqual(provided, launchToken);
}

export function redactLaunchTokenInUrl(url: string): string {
  return url.replace(new RegExp(`([?&]${LAUNCH_TOKEN_QUERY}=)[^&]*`, 'gi'), '$1***REDACTED***');
}
