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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restartApp } from '@/core/ipc/neutralino';
import {
  checkDesktopUpdate,
  downloadAndWriteResources,
  getResourcesNeuPath,
  restartAfterUpdate,
} from './neutralinoUpdater';

vi.mock('@/core/ipc/neutralino', () => ({
  ensureNeutralinoReady: vi.fn(async () => undefined),
  restartApp: vi.fn(async () => undefined),
}));

vi.mock('@/core/ipc/backendConnection', () => ({
  getBackendUrl: vi.fn(() => 'http://127.0.0.1:5111'),
  isBackendReady: vi.fn(() => true),
}));

const writeBinaryFile = vi.fn(async () => undefined);
const restartProcess = vi.fn(async () => undefined);

const GITHUB_RESOURCES_URL =
  'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu';

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map(line => `${JSON.stringify(line)}\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('neutralinoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { window?: Window }).window = {
      NL_PATH: '/apps/NodeRef',
      Neutralino: {
        filesystem: { writeBinaryFile },
        app: { restartProcess },
      },
    } as unknown as Window;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjsonResponse([
          { type: 'progress', loaded: 5, total: 10 },
          { type: 'progress', loaded: 10, total: 10 },
          { type: 'done', loaded: 10 },
        ])
      )
    );
  });

  it('downloads GitHub resources through the backend write endpoint', async () => {
    await downloadAndWriteResources({
      applicationId: 'nl.noderef.desktop',
      version: '1.0.0',
      resourcesURL: GITHUB_RESOURCES_URL,
    });

    expect(getResourcesNeuPath()).toBe('/apps/NodeRef/resources.neu');
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:5111/updates/download',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: GITHUB_RESOURCES_URL,
          targetPath: '/apps/NodeRef/resources.neu',
        }),
      })
    );
    // The renderer must never base64 the bundle through Neutralino on this path.
    expect(writeBinaryFile).not.toHaveBeenCalled();
  });

  it('reports backend download progress and completes', async () => {
    const events: Array<{ phase?: 'downloading' | 'writing'; percent: number | null }> = [];

    await downloadAndWriteResources(
      {
        applicationId: 'nl.noderef.desktop',
        version: '1.0.0',
        resourcesURL: GITHUB_RESOURCES_URL,
      },
      progress => {
        events.push({ phase: progress.phase, percent: progress.percent });
      }
    );

    expect(events.some(event => event.phase === 'downloading')).toBe(true);
    expect(events[events.length - 1]).toEqual({ phase: 'downloading', percent: 100 });
  });

  it('throws when the backend reports a download error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      ndjsonResponse([{ type: 'error', message: 'disk full' }])
    );

    await expect(
      downloadAndWriteResources({
        applicationId: 'nl.noderef.desktop',
        version: '1.0.0',
        resourcesURL: GITHUB_RESOURCES_URL,
      })
    ).rejects.toThrow('disk full');
  });

  it('falls back to a Neutralino write for non-GitHub resource URLs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    );

    await downloadAndWriteResources({
      applicationId: 'nl.noderef.desktop',
      version: '1.0.0',
      resourcesURL: 'https://example.com/noderef-resources.neu',
    });

    expect(writeBinaryFile).toHaveBeenCalledWith(
      '/apps/NodeRef/resources.neu',
      expect.any(ArrayBuffer)
    );
  });

  it('fetches the manifest from the local backend during desktop update checks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          applicationId: 'nl.noderef.desktop',
          version: '0.10.1',
          resourcesURL:
            'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu',
          data: {
            releaseUrl: 'https://github.com/noderef/noderef/releases/tag/v0.10.1',
            requiresInstaller: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await checkDesktopUpdate('0.10.0');

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:5111/updates/manifest');
    expect(result.hasUpdate).toBe(true);
    expect(result.manifest.version).toBe('0.10.1');
  });

  it('restarts the app after install', async () => {
    await restartAfterUpdate();
    expect(restartApp).toHaveBeenCalled();
  });
});
