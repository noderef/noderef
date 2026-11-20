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

import { Feature, hasCapability, isFeatureAvailable } from '@app/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveCapabilityProfileWithDeps,
  type CapabilityResolverDeps,
} from '../../src/services/alfresco/capabilities.js';

function personPayload(isAdmin?: boolean) {
  return {
    entry: {
      id: 'user1',
      firstName: 'Ada',
      capabilities: isAdmin === undefined ? undefined : { isAdmin },
    },
  };
}

function groupsPayload(ids: string[], hasMoreItems = false) {
  return {
    list: {
      pagination: { hasMoreItems },
      entries: ids.map(id => ({ entry: { id } })),
    },
  };
}

describe('resolveCapabilityProfileWithDeps', () => {
  it('uses people capabilities.isAdmin without listing groups', async () => {
    const listGroupMemberships = vi.fn();
    const probeWebscript = vi.fn().mockResolvedValue(200);
    const result = await resolveCapabilityProfileWithDeps(
      {
        getPerson: async () => personPayload(true),
        listGroupMemberships,
        probeWebscript,
      },
      { jsconsoleEndpoint: 'ootbee/jsconsole' }
    );

    expect(result.profile.isAdmin).toBe(true);
    expect(result.profile.nodeBrowser).toBe(true);
    expect(result.profile.supportTools).toBe(true);
    expect(result.profile.jsConsole).toBe(true);
    expect(listGroupMemberships).not.toHaveBeenCalled();
  });

  it('falls back to group membership when people omits capabilities', async () => {
    const result = await resolveCapabilityProfileWithDeps(
      {
        getPerson: async () => personPayload(),
        listGroupMemberships: async () => groupsPayload(['GROUP_ALFRESCO_ADMINISTRATORS']),
        probeWebscript: async () => 404,
      },
      { jsconsoleEndpoint: null }
    );

    expect(result.profile.isAdmin).toBe(true);
    expect(result.profile.supportTools).toBe(false);
    expect(result.profile.jsConsole).toBe(false);
  });

  it('matches GROUP_ALFRESCO_ADMINISTRATORS on page 2', async () => {
    const listGroupMemberships = vi
      .fn()
      .mockResolvedValueOnce(groupsPayload(['GROUP_SITE_COLLABORATORS'], true))
      .mockResolvedValueOnce(groupsPayload(['GROUP_ALFRESCO_ADMINISTRATORS']));

    const result = await resolveCapabilityProfileWithDeps({
      getPerson: async () => personPayload(false),
      listGroupMemberships,
      probeWebscript: async () => 200,
    });

    expect(listGroupMemberships).toHaveBeenCalledTimes(2);
    expect(result.profile.isAdmin).toBe(true);
  });

  it('stops group pagination at the hard ceiling', async () => {
    const listGroupMemberships = vi.fn().mockImplementation(async ({ skipCount }: { skipCount: number }) =>
      groupsPayload(
        Array.from({ length: 100 }, (_, index) => `GROUP_OTHER_${skipCount + index}`),
        true
      )
    );

    const result = await resolveCapabilityProfileWithDeps({
      getPerson: async () => personPayload(false),
      listGroupMemberships,
    });

    expect(result.profile.isAdmin).toBe(false);
    expect(listGroupMemberships.mock.calls.length).toBe(20);
  });

  it('does not probe webscripts for non-admins', async () => {
    const probeWebscript = vi.fn();
    const result = await resolveCapabilityProfileWithDeps({
      getPerson: async () => personPayload(false),
      listGroupMemberships: async () => groupsPayload(['GROUP_SITE_COLLABORATORS']),
      probeWebscript,
    });

    expect(result.profile).toMatchObject({
      isAdmin: false,
      jsConsole: false,
      supportTools: false,
      nodeBrowser: false,
      status: 'ok',
    });
    expect(probeWebscript).not.toHaveBeenCalled();
  });

  it('maps people errors to an unknown restricted profile', async () => {
    const result = await resolveCapabilityProfileWithDeps({
      getPerson: async () => {
        throw new Error('people failed');
      },
      listGroupMemberships: async () => groupsPayload([]),
    });

    expect(result.profile.status).toBe('unknown');
    expect(result.profile.isAdmin).toBe(false);
    expect(hasCapability(result.profile, 'admin')).toBe(false);
  });

  it('treats OOTBee probe 200/405 as installed and 401/403/404 as missing', async () => {
    const run = (status: number) =>
      resolveCapabilityProfileWithDeps(
        {
          getPerson: async () => personPayload(true),
          listGroupMemberships: async () => groupsPayload([]),
          probeWebscript: async () => status,
        },
        { jsconsoleEndpoint: 'ootbee/jsconsole' }
      );

    expect((await run(200)).profile.supportTools).toBe(true);
    expect((await run(405)).profile.jsConsole).toBe(true);
    expect((await run(401)).profile.supportTools).toBe(false);
    expect((await run(403)).profile.supportTools).toBe(false);
    expect((await run(404)).profile.supportTools).toBe(false);
  });

  it('probes a custom jsconsole path instead of reusing the OOTBee flag', async () => {
    const probeWebscript = vi.fn(async (path: string) => (path.includes('custom') ? 405 : 404));
    const result = await resolveCapabilityProfileWithDeps(
      {
        getPerson: async () => personPayload(true),
        listGroupMemberships: async () => groupsPayload([]),
        probeWebscript,
      },
      { jsconsoleEndpoint: 's/custom/jsconsole' }
    );

    expect(result.profile.supportTools).toBe(false);
    expect(result.profile.jsConsole).toBe(true);
    expect(probeWebscript).toHaveBeenCalledWith('custom/jsconsole');
  });
});

describe('feature predicates', () => {
  it('keeps search/agent/insights/repo/node browser available without admin rights', () => {
    const restricted = {
      isAdmin: false,
      jsConsole: false,
      supportTools: false,
      nodeBrowser: false,
      status: 'ok' as const,
      checkedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(isFeatureAvailable(restricted, Feature.Search)).toBe(true);
    expect(isFeatureAvailable(restricted, Feature.Agent)).toBe(true);
    expect(isFeatureAvailable(restricted, Feature.Insights)).toBe(true);
    expect(isFeatureAvailable(restricted, Feature.RepoBrowser)).toBe(true);
    expect(isFeatureAvailable(restricted, Feature.NodeBrowser)).toBe(true);
    expect(isFeatureAvailable(restricted, Feature.Logs)).toBe(false);
    expect(isFeatureAvailable(restricted, Feature.RepoAdmin)).toBe(false);
    expect(isFeatureAvailable(restricted, Feature.UsersGroups)).toBe(false);
    expect(isFeatureAvailable(restricted, Feature.ModelExplorer)).toBe(false);
    expect(isFeatureAvailable(restricted, Feature.JsConsole)).toBe(false);
    expect(isFeatureAvailable(restricted, Feature.SystemTree)).toBe(false);
  });

  it('treats null and unknown profiles as restrictive for required features', () => {
    expect(isFeatureAvailable(null, Feature.Logs)).toBe(false);
    expect(isFeatureAvailable({ status: 'unknown' } as never, Feature.JsConsole)).toBe(false);
    expect(isFeatureAvailable(null, Feature.Search)).toBe(true);
  });
});

describe('CapabilityResolverDeps typing smoke', () => {
  it('accepts a deps object', () => {
    const deps: CapabilityResolverDeps = {
      getPerson: async () => ({}),
      listGroupMemberships: async () => ({}),
    };
    expect(deps).toBeTruthy();
  });
});
