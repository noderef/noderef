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

import { endpointsMatch } from './endpointPolicy.js';
import { GatewayStatusError } from './types.js';

const SENSITIVE_HEADER_NAMES = ['authorization', 'x-alfresco-authorization'];

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === 'string') {
    return new URL(input);
  }
  return new URL(input.url);
}

function stripSensitive(value: string, secrets: string[]): string {
  let next = value;
  for (const secret of secrets) {
    if (!secret) continue;
    next = next.split(secret).join('[redacted]');
  }
  next = next.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  next = next.replace(/Basic\s+\S+/gi, 'Basic [redacted]');
  return next;
}

export function sanitizeGatewayError(error: unknown, secrets: string[] = []): Error {
  if (error instanceof GatewayStatusError) {
    return error;
  }
  if (error instanceof Error) {
    const sanitized = new Error(stripSensitive(error.message, secrets));
    sanitized.name = error.name;
    if (error.cause instanceof Error) {
      sanitized.cause = sanitizeGatewayError(error.cause, secrets);
    }
    return sanitized;
  }
  return new Error('Agent Gateway request failed');
}

export function createGatewayFetch(options: {
  endpoint: URL;
  apiKey: string;
  getAlfrescoAuthorization?: () => Promise<string | null>;
}): typeof fetch {
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const target = new URL(url.href);
    target.search = '';
    target.hash = '';
    if (!endpointsMatch(options.endpoint, target)) {
      throw new GatewayStatusError(
        'redirect_blocked',
        'Agent Gateway request target does not match the configured endpoint'
      );
    }

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${options.apiKey}`);
    if (options.getAlfrescoAuthorization) {
      const alfresco = await options.getAlfrescoAuthorization();
      if (alfresco) {
        headers.set('X-Alfresco-Authorization', alfresco);
      } else {
        headers.delete('X-Alfresco-Authorization');
      }
    } else {
      headers.delete('X-Alfresco-Authorization');
    }

    for (const name of SENSITIVE_HEADER_NAMES) {
      // Keep only the values we just set; ignore any caller-supplied copies.
      void name;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
        redirect: 'manual',
      });
    } catch (error) {
      throw sanitizeGatewayError(error, [options.apiKey]);
    }

    if (response.status >= 300 && response.status < 400) {
      throw new GatewayStatusError('redirect_blocked', 'Agent Gateway redirected the request');
    }

    return response;
  };

  return fetchImpl;
}
