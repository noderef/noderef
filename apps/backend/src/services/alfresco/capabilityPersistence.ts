/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
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
import type { CapabilityProfile, PublicServer } from '@app/contracts';
import { RESTRICTED_PROFILE } from '@app/contracts';
import { createLogger } from '../../lib/logger.js';
import type { ServerService } from '../serverService.js';
import { resolveCapabilityProfile } from './capabilities.js';

const log = createLogger('alfresco.capabilityPersistence');

/**
 * Atomically persist `isAdmin` with the capability profile.
 * `isAdmin` is always derived from `profile.isAdmin`.
 */
export async function persistCapabilityProfile(
  serverService: ServerService,
  userId: number,
  serverId: number,
  server: PublicServer,
  profile: CapabilityProfile | null
): Promise<PublicServer> {
  const isAdmin = profile?.isAdmin ?? false;
  const updated = await serverService.update(userId, serverId, {
    isAdmin,
    capabilities: profile,
  });
  return updated ?? { ...server, isAdmin, capabilities: profile };
}

/**
 * Resolve and persist a profile when `capabilities` is NULL (never checked).
 * Failed first check is restrictive (D6).
 */
export async function ensureCapabilityProfile(
  serverService: ServerService,
  userId: number,
  serverId: number,
  api: AlfrescoApi,
  server: PublicServer
): Promise<PublicServer> {
  if (server.serverType !== 'alfresco' || server.capabilities !== null) {
    return server;
  }

  try {
    const { profile } = await resolveCapabilityProfile(api, {
      jsconsoleEndpoint: server.jsconsoleEndpoint,
    });
    return persistCapabilityProfile(serverService, userId, serverId, server, profile);
  } catch (error) {
    log.debug({ error, serverId }, 'Initial capability resolve failed');
    const restricted = { ...RESTRICTED_PROFILE, checkedAt: new Date().toISOString() };
    return persistCapabilityProfile(serverService, userId, serverId, server, restricted);
  }
}
