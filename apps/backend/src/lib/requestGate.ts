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
 * Host / Origin allowlist helpers for the local backend request gate.
 */

import { isServeStaticMode } from './launchToken.js';

export interface ParsedHostHeader {
  hostname: string;
  host: string;
}

export function parseHostHeader(raw: string | string[] | undefined): ParsedHostHeader | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw.trim();
  if (!value || /[\s\r\n]/.test(value) || value.length > 256) {
    return null;
  }

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end <= 1) {
      return null;
    }
    const hostname = value.slice(1, end);
    const rest = value.slice(end + 1);
    if (rest && !/^:\d{1,5}$/.test(rest)) {
      return null;
    }
    if (!hostname) {
      return null;
    }
    return { hostname, host: value };
  }

  const colon = value.indexOf(':');
  if (colon === -1) {
    return { hostname: value, host: value };
  }

  const hostname = value.slice(0, colon);
  const port = value.slice(colon + 1);
  if (!hostname || value.includes(':', colon + 1) || !/^\d{1,5}$/.test(port)) {
    return null;
  }
  return { hostname, host: value };
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export function isHostAllowed(hostHeader: string | string[] | undefined): boolean {
  const parsed = parseHostHeader(hostHeader);
  if (!parsed) {
    return false;
  }
  if (isServeStaticMode()) {
    return parsed.hostname.length > 0;
  }
  return isLoopbackHostname(parsed.hostname);
}

export function isNullOrigin(origin: string | undefined): boolean {
  return typeof origin === 'string' && origin.trim().toLowerCase() === 'null';
}

export function getRequestOrigin(originHeader: string | string[] | undefined): string | undefined {
  if (typeof originHeader !== 'string') {
    return undefined;
  }
  const origin = originHeader.trim();
  return origin.length > 0 ? origin : undefined;
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    if (url.username || url.password) {
      return false;
    }
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isSameOriginAsHost(
  origin: string,
  hostHeader: string | string[] | undefined
): boolean {
  try {
    const url = new URL(origin);
    const parsed = parseHostHeader(hostHeader);
    if (!parsed) {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return (
      url.host.toLowerCase() === parsed.host.toLowerCase() ||
      url.hostname.toLowerCase() === parsed.hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Origins that may receive Access-Control-Allow-Origin and whose requests we
 * will process (token still required on desktop APIs).
 *
 * `Origin: null` is never treated as an allowed CORS origin.
 */
export function isAllowedWebOrigin(
  origin: string | undefined,
  hostHeader: string | string[] | undefined
): boolean {
  if (!origin || isNullOrigin(origin)) {
    return false;
  }
  if (isServeStaticMode()) {
    return isSameOriginAsHost(origin, hostHeader);
  }
  return isLoopbackOrigin(origin);
}

export function isHealthPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/health';
}

export function isOidcCallbackPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/auth/callback';
}

export function isWebAuthPublicPath(method: string, path: string): boolean {
  return (
    (method === 'GET' && path === '/web-auth/status') ||
    (method === 'POST' && path === '/web-auth/login')
  );
}

export function isPublicUnauthenticatedPath(method: string, path: string): boolean {
  return isHealthPath(method, path) || isOidcCallbackPath(method, path);
}
