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

import type { AlfrescoApi } from '@alfresco/js-api';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { ServerService } from '../serverService.js';
import { getAuthenticatedClient } from './clientFactory.js';

const log = createLogger('alfresco.auth-helper');

/**
 * Get an authenticated Alfresco client for a server with automatic token refresh
 * This is the centralized function that ALL backend calls should use (DRY principle)
 *
 * @param userId The user ID
 * @param serverId The server ID
 * @param baseUrl The base URL of the Alfresco server
 * @param prisma Optional Prisma client
 * @returns An authenticated AlfrescoApi client
 */
export async function getAuthenticatedClientWithRefresh(
  userId: number,
  serverId: number,
  baseUrl: string,
  prisma: PrismaClient
): Promise<AlfrescoApi | undefined> {
  const serverService = new ServerService(prisma);

  let creds = await serverService.getCredentialsForBackend(userId, serverId);

  // Refresh OIDC token if expired or expiring soon (within 5 minutes)
  if (creds?.authType === 'openid_connect' && creds.tokenExpiry) {
    const expiryThreshold = new Date(Date.now() + 5 * 60 * 1000);
    if (creds.tokenExpiry <= expiryThreshold) {
      log.info(
        { serverId, expiry: creds.tokenExpiry },
        'Token expired or expiring soon, refreshing...'
      );
      try {
        await serverService.refreshOAuthTokens(userId, serverId);
        creds = await serverService.getCredentialsForBackend(userId, serverId);
        log.info({ serverId }, 'Token refreshed successfully');
      } catch (error) {
        log.error({ error, serverId }, 'Failed to refresh token, will try with existing token');
      }
    }
  }

  // Validate credentials
  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    log.warn({ serverId, authType: creds?.authType }, 'Missing credentials for server');
    return undefined;
  }

  log.debug({ serverId, authType: creds.authType }, 'Retrieved stored credentials');

  try {
    const api = await getAuthenticatedClient(baseUrl, creds);
    log.debug({ serverId }, 'Successfully authenticated with stored credentials');
    return api;
  } catch (error) {
    log.error({ serverId, error }, 'Failed to authenticate with stored credentials');
    throw error;
  }
}
