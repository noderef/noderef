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

/** Header and query names must match apps/backend/src/lib/launchToken.ts */
export const LAUNCH_TOKEN_HEADER = 'X-NodeRef-Token';
export const LAUNCH_TOKEN_QUERY = 'nr_token';

let cachedToken: string | null | undefined;

export function isLaunchTokenShape(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,}$/.test(value.trim());
}

export function getCachedLaunchToken(): string | null {
  return cachedToken ?? null;
}

export function setCachedLaunchToken(token: string | null): void {
  cachedToken = token;
}

export function resetLaunchTokenCacheForTests(): void {
  cachedToken = undefined;
}

export function appendLaunchTokenToUrl(url: string, token: string | null | undefined): string {
  if (!token) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set(LAUNCH_TOKEN_QUERY, token);
  return parsed.toString();
}

export function isBackendRequestUrl(url: string, backendUrl: string): boolean {
  return url.startsWith(backendUrl);
}

export function headersWithLaunchToken(
  initHeaders: HeadersInit | undefined,
  token: string | null,
  url: string,
  backendUrl: string
): Headers {
  const headers = new Headers(initHeaders);
  if (token && isBackendRequestUrl(url, backendUrl)) {
    headers.set(LAUNCH_TOKEN_HEADER, token);
  }
  return headers;
}

export function requestUrlFromInput(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}
