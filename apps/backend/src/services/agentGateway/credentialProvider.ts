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

import { createHash } from 'node:crypto';
import { AppErrors } from '../../lib/errors.js';
import { buildAlfrescoAuthorization } from '../agent/tools/helpers/authHeaders.js';
import type { ServerService } from '../serverService.js';

export function decodeJwtSub(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export function alfrescoIdentityKey(
  authType: string | null,
  username: string | null,
  token: string | null
): string {
  if (authType === 'openid_connect') {
    if (token) {
      const sub = decodeJwtSub(token);
      if (sub) {
        return `oidc:${sub}`;
      }
      return `oidc-token:${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
    }
    return 'oidc:missing';
  }
  return `basic:${username ?? ''}`;
}

export class GatewayCredentialProvider {
  constructor(private serverService: ServerService) {}

  async getAlfrescoAuthorization(userId: number, serverId: number): Promise<string> {
    await this.serverService.refreshOAuthTokens(userId, serverId);
    const credentials = await this.serverService.getCredentialsForBackend(userId, serverId);
    if (!credentials?.token || (credentials.authType === 'basic' && !credentials.username)) {
      throw AppErrors.unauthorized('No stored credentials found for server');
    }
    return buildAlfrescoAuthorization({
      authType: credentials.authType,
      username: credentials.username,
      token: credentials.token,
    });
  }

  async getIdentity(userId: number, serverId: number): Promise<{
    authType: string | null;
    identity: string;
  }> {
    const credentials = await this.serverService.getCredentialsForBackend(userId, serverId);
    return {
      authType: credentials?.authType ?? null,
      identity: alfrescoIdentityKey(
        credentials?.authType ?? null,
        credentials?.username ?? null,
        credentials?.token ?? null
      ),
    };
  }
}
