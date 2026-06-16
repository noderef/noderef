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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/ipc/neutralino', () => ({
  isNeutralinoMode: vi.fn(() => true),
}));

vi.mock('@/core/updates/neutralinoUpdater', () => ({
  checkDesktopUpdate: vi.fn(),
  downloadAndWriteResources: vi.fn(),
  restartAfterUpdate: vi.fn(),
}));

vi.mock('@/core/updates/latestRelease', () => ({
  fetchLatestRelease: vi.fn(),
}));

import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { fetchLatestRelease } from '@/core/updates/latestRelease';
import {
  checkDesktopUpdate,
  downloadAndWriteResources,
  restartAfterUpdate,
} from '@/core/updates/neutralinoUpdater';
import { useUpdateStore } from './updates';

const manifest = {
  applicationId: 'nl.noderef.desktop',
  version: '9.9.9',
  resourcesURL: 'https://example.com/noderef-resources.neu',
  data: {
    releaseUrl: 'https://github.com/noderef/noderef/releases/tag/v9.9.9',
  },
};

async function resetStore() {
  await useUpdateStore.persist.clearStorage();
  useUpdateStore.setState({
    latestRelease: null,
    manifest: null,
    hasUpdate: false,
    requiresInstaller: false,
    status: 'idle',
    downloadProgress: null,
    errorMessage: null,
    lastChecked: null,
    lastNotifiedVersion: null,
  });
}

describe('useUpdateStore', () => {
  beforeEach(async () => {
    vi.stubEnv('DEV', false);
    await resetStore();
    vi.clearAllMocks();
    vi.mocked(isNeutralinoMode).mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('moves from available to downloaded after a successful download', async () => {
    vi.mocked(checkDesktopUpdate).mockResolvedValue({
      manifest,
      hasUpdate: true,
      requiresInstaller: false,
      releaseUrl: manifest.data!.releaseUrl!,
    });
    vi.mocked(downloadAndWriteResources).mockImplementation(async (_manifest, onProgress) => {
      onProgress?.({ percent: 50, loaded: 5, total: 10 });
      onProgress?.({ percent: 100, loaded: 10, total: 10 });
    });

    await useUpdateStore.getState().checkForUpdates({ force: true });
    expect(useUpdateStore.getState().status).toBe('available');

    await useUpdateStore.getState().downloadUpdate();
    expect(useUpdateStore.getState().status).toBe('downloaded');
    expect(downloadAndWriteResources).toHaveBeenCalled();
  });

  it('sets error when the update check fails', async () => {
    vi.mocked(checkDesktopUpdate).mockRejectedValue(new Error('offline'));

    await useUpdateStore.getState().checkForUpdates({ force: true });

    expect(useUpdateStore.getState().status).toBe('error');
    expect(useUpdateStore.getState().errorMessage).toBe('offline');
  });

  it('sets error when download fails', async () => {
    vi.mocked(checkDesktopUpdate).mockResolvedValue({
      manifest,
      hasUpdate: true,
      requiresInstaller: false,
      releaseUrl: manifest.data!.releaseUrl!,
    });
    vi.mocked(downloadAndWriteResources).mockRejectedValue(new Error('network'));

    await useUpdateStore.getState().checkForUpdates({ force: true });
    await expect(useUpdateStore.getState().downloadUpdate()).rejects.toThrow('network');
    expect(useUpdateStore.getState().status).toBe('error');
  });

  it('marks installer-required updates from manifest metadata', async () => {
    vi.mocked(checkDesktopUpdate).mockResolvedValue({
      manifest: { ...manifest, data: { ...manifest.data, requiresInstaller: true } },
      hasUpdate: true,
      requiresInstaller: true,
      releaseUrl: manifest.data!.releaseUrl!,
    });

    await useUpdateStore.getState().checkForUpdates({ force: true });

    expect(useUpdateStore.getState().requiresInstaller).toBe(true);
    expect(useUpdateStore.getState().hasUpdate).toBe(true);
  });

  it('uses GitHub release fallback in browser mode', async () => {
    vi.mocked(isNeutralinoMode).mockReturnValue(false);
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '9.9.9',
      downloadUrl: 'https://github.com/noderef/noderef/releases/latest',
      releaseUrl: 'https://github.com/noderef/noderef/releases/latest',
    });

    await useUpdateStore.getState().checkForUpdates({ force: true });

    expect(fetchLatestRelease).toHaveBeenCalled();
    expect(useUpdateStore.getState().manifest).toBeNull();
    expect(useUpdateStore.getState().hasUpdate).toBe(true);
  });

  it('uses GitHub release fallback in Vite dev even when Neutralino globals are set', async () => {
    vi.stubEnv('DEV', true);
    vi.mocked(isNeutralinoMode).mockReturnValue(true);
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: '9.9.9',
      downloadUrl: 'https://github.com/noderef/noderef/releases/latest',
      releaseUrl: 'https://github.com/noderef/noderef/releases/latest',
    });

    await useUpdateStore.getState().checkForUpdates({ force: true });

    expect(fetchLatestRelease).toHaveBeenCalled();
    expect(checkDesktopUpdate).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().manifest).toBeNull();
  });

  it('restarts after install when resources are downloaded', async () => {
    vi.mocked(checkDesktopUpdate).mockResolvedValue({
      manifest,
      hasUpdate: true,
      requiresInstaller: false,
      releaseUrl: manifest.data!.releaseUrl!,
    });
    vi.mocked(downloadAndWriteResources).mockResolvedValue(undefined);
    vi.mocked(restartAfterUpdate).mockResolvedValue(undefined);

    await useUpdateStore.getState().checkForUpdates({ force: true });
    await useUpdateStore.getState().downloadUpdate();
    await useUpdateStore.getState().installUpdate();

    expect(restartAfterUpdate).toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe('installing');
  });
});
