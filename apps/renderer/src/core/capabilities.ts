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

import type { CapabilityProfile } from '@app/contracts';
import { backendRpc } from './ipc/backend';
import { useServersStore } from './store/servers';

const REFRESH_DEBOUNCE_MS = 30_000;
const lastRefreshByServer = new Map<number, number>();

export function getRpcErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export async function refreshCapabilitiesDebounced(
  serverId: number
): Promise<CapabilityProfile | null> {
  const now = Date.now();
  const last = lastRefreshByServer.get(serverId) ?? 0;
  if (now - last < REFRESH_DEBOUNCE_MS) {
    return null;
  }
  lastRefreshByServer.set(serverId, now);

  try {
    const profile = await backendRpc.servers.refreshCapabilities(serverId);
    useServersStore.getState().updateServer(serverId, {
      capabilities: profile,
      isAdmin: profile.isAdmin,
    });
    return profile;
  } catch (error) {
    console.error('Failed to refresh server capabilities:', error);
    return null;
  }
}

export async function applyRefreshedCapabilities(
  serverId: number
): Promise<CapabilityProfile | null> {
  try {
    const profile = await backendRpc.servers.refreshCapabilities(serverId);
    useServersStore.getState().updateServer(serverId, {
      capabilities: profile,
      isAdmin: profile.isAdmin,
    });
    lastRefreshByServer.set(serverId, Date.now());
    return profile;
  } catch (error) {
    console.error('Failed to refresh server capabilities:', error);
    return null;
  }
}
