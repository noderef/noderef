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

import { createOkProfile, parseCapabilityProfile, RESTRICTED_PROFILE } from '@app/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { PublicServer } from '@app/contracts';
import type { ServerService } from '../../src/services/serverService.js';
import {
  persistCapabilityProfile,
  ensureCapabilityProfile,
} from '../../src/services/alfresco/capabilityPersistence.js';

const baseServer = {
  id: 1,
  userId: 1,
  name: 'ACS',
  baseUrl: 'https://alfresco.example',
  serverType: 'alfresco',
  isAdmin: true,
  capabilities: null,
  jsconsoleEndpoint: null,
} as PublicServer;

describe('capability profile persistence', () => {
  it('round-trips JSON without changing flags', () => {
    const profile = createOkProfile({
      isAdmin: true,
      jsConsole: false,
      supportTools: true,
      nodeBrowser: true,
    });
    const parsed = parseCapabilityProfile(JSON.parse(JSON.stringify(profile)));
    expect(parsed).toEqual(profile);
  });

  it('rejects invalid JSON payloads as never-checked', () => {
    expect(parseCapabilityProfile('{not-json')).toBeNull();
    expect(parseCapabilityProfile({ isAdmin: 'yes' })).toBeNull();
    expect(parseCapabilityProfile(null)).toBeNull();
  });

  it('writes isAdmin atomically from the profile', async () => {
    const update = vi.fn(async (_userId, _id, data) => ({
      ...baseServer,
      ...data,
    }));
    const profile = createOkProfile({ isAdmin: false });
    const persisted = await persistCapabilityProfile(
      { update } as unknown as ServerService,
      1,
      1,
      baseServer,
      profile
    );
    expect(update).toHaveBeenCalledWith(1, 1, { isAdmin: false, capabilities: profile });
    expect(persisted.isAdmin).toBe(false);
  });

  it('resolves NULL capabilities once and skips later calls', async () => {
    const update = vi.fn(async (_userId, _id, data) => ({
      ...baseServer,
      ...data,
    }));
    const serverService = { update } as unknown as ServerService;
    const alreadyChecked = {
      ...baseServer,
      capabilities: createOkProfile({ isAdmin: false }),
    };

    const skipped = await ensureCapabilityProfile(
      serverService,
      1,
      1,
      {} as never,
      alreadyChecked
    );
    expect(skipped).toBe(alreadyChecked);
    expect(update).not.toHaveBeenCalled();

    const failed = await ensureCapabilityProfile(serverService, 1, 1, {} as never, baseServer);
    expect(failed.capabilities?.status).toBe('unknown');
    expect(failed.isAdmin).toBe(false);
    expect(failed.capabilities).toMatchObject({
      isAdmin: false,
      jsConsole: false,
      supportTools: false,
      nodeBrowser: false,
    });
    expect(RESTRICTED_PROFILE.isAdmin).toBe(false);
  });
});
