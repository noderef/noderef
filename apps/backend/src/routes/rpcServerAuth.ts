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

import type { AlfrescoApi } from '@alfresco/js-api';
import { log } from '../lib/logger.js';
import { getAuthenticatedClient } from '../services/alfresco/clientFactory.js';
import type { ServerService } from '../services/serverService.js';
import { getCurrentUserId } from '../services/userBootstrap.js';

export type RpcServerAuthKind = 'binary' | 'stream';

/**
 * Shared Alfresco client resolution for RPC routes that proxy authenticated calls.
 */
export async function authenticateAlfrescoRpcRequest(
  serverService: ServerService,
  baseUrl: string,
  serverId: number,
  kind: RpcServerAuthKind
): Promise<AlfrescoApi | undefined> {
  const userId = await getCurrentUserId();
  const creds = await serverService.getCredentialsForBackend(userId, serverId);

  if (!creds?.token || (creds.authType === 'basic' && !creds.username)) {
    log.warn(
      { serverId, authType: creds?.authType },
      `Missing credentials for server ${kind} request`
    );
    return undefined;
  }

  try {
    return await getAuthenticatedClient(baseUrl, creds);
  } catch (error) {
    log.error({ serverId, error }, `Failed to authenticate ${kind} request`);
    throw error;
  }
}
