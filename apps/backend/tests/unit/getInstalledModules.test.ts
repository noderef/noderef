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

import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentExecutionContext } from '../../src/services/agent/types.js';
import { compactToolDataForModel } from '../../src/services/agent/toolResultCompaction.js';
import {
  DISCOVERY_UNAVAILABLE,
  getInstalledModulesTool,
  mapDiscoveryError,
  mapDiscoveryPayload,
  mapInstalledModule,
  NO_MODULE_INFORMATION,
} from '../../src/services/agent/tools/discovery/get_installed_modules.js';
import { mockGetRepositoryInformation } from '../mocks/alfresco-js-api.js';

const makeCtx = (): AgentExecutionContext => ({
  api: {} as AgentExecutionContext['api'],
  serverId: 9,
  serverBaseUrl: 'https://alfresco.example.com',
  jsconsoleEndpoint: null,
  authType: 'basic',
  username: 'admin',
  token: 'ticket',
  signal: new AbortController().signal,
});

const fullPayload = {
  entry: {
    repository: {
      edition: 'Enterprise',
      version: {
        major: '23',
        minor: '2',
        patch: '1',
        display: '23.2.1',
      },
      modules: [
        {
          id: 'alfresco-aos-module',
          title: 'Alfresco Office Services Module',
          description: 'SharePoint protocol support',
          version: '1.6.2',
          installState: 'INSTALLED',
          installDate: '2019-02-19T09:03:46.731+0000',
        },
        {
          id: 'alfresco-share-services',
          title: 'Alfresco Share Services AMP',
          description: 'Share repository APIs',
          version: '23.2.1',
          installState: 'INSTALLED',
          installDate: new Date('2024-03-01T12:00:00.000Z'),
        },
      ],
    },
  },
};

describe('getInstalledModules', () => {
  beforeEach(() => {
    mockGetRepositoryInformation.mockReset();
  });

  it('is a read-only tool without confirmation', () => {
    expect(getInstalledModulesTool.name).toBe('get_installed_modules');
    expect(getInstalledModulesTool.requiresConfirmation).toBe(false);
    expect(getInstalledModulesTool.description).toMatch(/which modules are installed/i);
    expect(getInstalledModulesTool.description).toMatch(/which version of module/i);
  });

  it('maps a full discovery payload', () => {
    expect(mapDiscoveryPayload(fullPayload)).toEqual({
      edition: 'Enterprise',
      version: '23.2.1',
      modules: [
        {
          id: 'alfresco-aos-module',
          title: 'Alfresco Office Services Module',
          description: 'SharePoint protocol support',
          version: '1.6.2',
          installState: 'INSTALLED',
          installDate: '2019-02-19T09:03:46.731Z',
        },
        {
          id: 'alfresco-share-services',
          title: 'Alfresco Share Services AMP',
          description: 'Share repository APIs',
          version: '23.2.1',
          installState: 'INSTALLED',
          installDate: '2024-03-01T12:00:00.000Z',
        },
      ],
    });
  });

  it('returns a clear result when modules is an empty array', () => {
    expect(
      mapDiscoveryPayload({
        entry: {
          repository: {
            edition: 'Community',
            version: { display: '23.2.0' },
            modules: [],
          },
        },
      })
    ).toEqual({
      edition: 'Community',
      version: '23.2.0',
      message: NO_MODULE_INFORMATION,
    });
  });

  it('returns a clear result when the payload is missing or null', () => {
    expect(mapDiscoveryPayload(null)).toEqual({ message: NO_MODULE_INFORMATION });
    expect(mapDiscoveryPayload(undefined)).toEqual({ message: NO_MODULE_INFORMATION });
    expect(mapDiscoveryPayload({})).toEqual({ message: NO_MODULE_INFORMATION });
  });

  it('returns a clear result when modules is missing', () => {
    expect(
      mapDiscoveryPayload({
        entry: {
          repository: {
            edition: 'Enterprise',
            version: { display: '7.3.0' },
          },
        },
      })
    ).toEqual({
      edition: 'Enterprise',
      version: '7.3.0',
      message: NO_MODULE_INFORMATION,
    });
  });

  it('omits null, empty, and missing module fields and drops modules without id', () => {
    expect(
      mapDiscoveryPayload({
        entry: {
          repository: {
            edition: null,
            version: { display: null },
            modules: [
              {
                id: 'keep-me',
                title: null,
                description: '',
                version: '  ',
                installState: undefined,
                installDate: null,
              },
              { title: 'No id', version: '1.0' },
              { id: '', title: 'Blank id' },
              null,
              { entry: { id: 'wrapped', title: 'Wrapped module' } },
            ],
          },
        },
      })
    ).toEqual({
      modules: [{ id: 'keep-me' }, { id: 'wrapped', title: 'Wrapped module' }],
    });
  });

  it('converts Date installDate values to ISO strings', () => {
    const installDate = new Date('2020-06-15T08:30:00.000Z');
    expect(
      mapInstalledModule({
        id: 'mod',
        installDate,
      })
    ).toEqual({
      id: 'mod',
      installDate: '2020-06-15T08:30:00.000Z',
    });
  });

  it('maps 401 to the existing authentication error path', () => {
    expect(mapDiscoveryError({ status: 401, message: 'Unauthorized' })).toEqual({
      ok: false,
      error: 'Authentication failed',
    });
  });

  it('maps 403/404/501 and discovery-disabled errors to a graceful result', () => {
    expect(mapDiscoveryError({ status: 403, message: 'Forbidden' })).toEqual({
      ok: true,
      data: { message: DISCOVERY_UNAVAILABLE },
    });
    expect(mapDiscoveryError({ status: 404, message: 'Not Found' })).toEqual({
      ok: true,
      data: { message: DISCOVERY_UNAVAILABLE },
    });
    expect(mapDiscoveryError({ status: 501, message: 'Not Implemented' })).toEqual({
      ok: true,
      data: { message: DISCOVERY_UNAVAILABLE },
    });
    expect(mapDiscoveryError(new Error('Discovery is disabled on this server'))).toEqual({
      ok: true,
      data: { message: DISCOVERY_UNAVAILABLE },
    });
    expect(mapDiscoveryError(new Error('This operation is not implemented'))).toEqual({
      ok: true,
      data: { message: DISCOVERY_UNAVAILABLE },
    });
  });

  it('does not treat unrelated errors as discovery-unavailable', () => {
    expect(mapDiscoveryError(new Error('Connection refused'))).toEqual({
      ok: false,
      error: 'Connection refused',
    });
    expect(mapDiscoveryError({ status: 500, message: 'Internal Server Error' })).toEqual({
      ok: false,
      error: 'Internal Server Error',
    });
  });

  it('executes against the selected server and returns mapped modules', async () => {
    mockGetRepositoryInformation.mockResolvedValue(fullPayload);
    const result = await getInstalledModulesTool.execute(makeCtx(), {});
    expect(mockGetRepositoryInformation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      data: {
        edition: 'Enterprise',
        version: '23.2.1',
        apiTrace: {
          method: 'GET',
          path: '/alfresco/api/discovery',
        },
      },
    });
    if (!result.ok) {
      throw new Error('expected success');
    }
    expect(result.data.modules).toHaveLength(2);
  });

  it('keeps the complete module list for the model regardless of install state', async () => {
    const modules = Array.from({ length: 30 }, (_, index) => ({
      id: `module-${index + 1}`,
      title: `Module ${index + 1}`,
      version: '1.0.0',
      ...(index < 4
        ? { installState: 'INSTALLED' }
        : index === 29
          ? {}
          : { installState: 'UNKNOWN' }),
    }));
    mockGetRepositoryInformation.mockResolvedValue({
      entry: { repository: { modules } },
    });

    const result = await getInstalledModulesTool.execute(makeCtx(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected success');
    }

    expect(result.data.modules).toEqual(modules);
    expect(compactToolDataForModel(result.data).modules).toEqual(modules);
  });

  it('executes empty-module payloads as a clear result', async () => {
    mockGetRepositoryInformation.mockResolvedValue({
      entry: { repository: { edition: 'Community', version: { display: '23.1.0' }, modules: [] } },
    });
    await expect(getInstalledModulesTool.execute(makeCtx(), {})).resolves.toMatchObject({
      ok: true,
      data: {
        edition: 'Community',
        version: '23.1.0',
        message: NO_MODULE_INFORMATION,
      },
    });
  });

  it('executes 404 from old ACS without crashing', async () => {
    mockGetRepositoryInformation.mockRejectedValue({ status: 404, message: 'Not Found' });
    await expect(getInstalledModulesTool.execute(makeCtx(), {})).resolves.toEqual({
      ok: true,
      data: { message: DISCOVERY_UNAVAILABLE },
    });
  });

  it('executes 401 using the existing auth error path', async () => {
    mockGetRepositoryInformation.mockRejectedValue({ status: 401, message: 'Unauthorized' });
    await expect(getInstalledModulesTool.execute(makeCtx(), {})).resolves.toEqual({
      ok: false,
      error: 'Authentication failed',
    });
  });
});
