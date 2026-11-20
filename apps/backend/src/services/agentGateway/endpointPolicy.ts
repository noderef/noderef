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

export class EndpointPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EndpointPolicyError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return LOOPBACK_HOSTS.has(host) || LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function isDockerInternalHost(hostname: string): boolean {
  return hostname.toLowerCase() === 'host.docker.internal';
}

function isSingleLabelHost(hostname: string): boolean {
  return Boolean(hostname) && !hostname.includes('.') && !hostname.includes(':');
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

export function normalizeGatewayEndpointUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new EndpointPolicyError('Agent Gateway URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EndpointPolicyError('Agent Gateway URL is invalid');
  }

  if (parsed.username || parsed.password) {
    throw new EndpointPolicyError('Agent Gateway URL must not include credentials');
  }
  if (parsed.hash) {
    throw new EndpointPolicyError('Agent Gateway URL must not include a fragment');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new EndpointPolicyError('Agent Gateway URL must use http or https');
  }

  parsed.hash = '';
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed;
}

export function assertGatewayEndpointAllowed(
  endpointUrl: string,
  options?: { alfrescoBaseUrl?: string | null }
): URL {
  const endpoint = normalizeGatewayEndpointUrl(endpointUrl);
  const host = hostnameOf(endpoint);

  if (endpoint.protocol === 'https:') {
    return endpoint;
  }

  if (isLoopbackHost(host) || isDockerInternalHost(host) || isSingleLabelHost(host)) {
    return endpoint;
  }

  if (options?.alfrescoBaseUrl) {
    try {
      const alfresco = new URL(options.alfrescoBaseUrl);
      if (hostnameOf(alfresco) === host) {
        return endpoint;
      }
    } catch {
      // Ignore invalid Alfresco URLs; the http restriction still applies.
    }
  }

  throw new EndpointPolicyError(
    'HTTP Agent Gateway URLs are only allowed for localhost, Docker service names, host.docker.internal, or the same host as the Alfresco server'
  );
}

export function endpointsMatch(configured: URL, actual: URL): boolean {
  return configured.origin === actual.origin && configured.pathname === actual.pathname;
}
