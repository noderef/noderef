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

/**
 * Tracks update information and exposes a shared check function.
 * All network errors are swallowed so offline users stay unaffected.
 */

import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { GITHUB_RELEASE_URL, UPDATE_CHECK_INTERVAL_MS } from '@/core/updates/constants';
import { fetchLatestRelease, type LatestRelease } from '@/core/updates/latestRelease';
import {
  checkDesktopUpdate,
  downloadAndWriteResources,
  restartAfterUpdate,
} from '@/core/updates/neutralinoUpdater';
import type { DownloadProgress } from '@/core/updates/downloadResources';
import type { UpdateFlowStatus, UpdateManifest } from '@/core/updates/types';
import { isNewerVersion } from '@/utils/version';
import { create } from 'zustand';

const CURRENT_VERSION =
  import.meta.env.VITE_UPDATE_CURRENT_VERSION?.trim() ||
  (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0');

/**
 * Get the download URL from a release, with fallback to GitHub releases page.
 */
function getDownloadUrl(release: LatestRelease | null): string {
  return release?.downloadUrl || release?.releaseUrl || GITHUB_RELEASE_URL;
}

export function getUpdateReleaseUrl(state: {
  manifest: UpdateManifest | null;
  latestRelease: LatestRelease | null;
}): string {
  return state.manifest?.data?.releaseUrl || getDownloadUrl(state.latestRelease);
}

interface UpdateState {
  latestRelease: LatestRelease | null;
  manifest: UpdateManifest | null;
  hasUpdate: boolean;
  requiresInstaller: boolean;
  status: UpdateFlowStatus;
  downloadProgress: number | null;
  downloadProgressDetails: DownloadProgress | null;
  errorMessage: string | null;
  lastChecked: number | null;
}

interface UpdateActions {
  checkForUpdates: (options?: { force?: boolean }) => Promise<LatestRelease | null>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  clearError: () => void;
}

let activeDownloadAbort: AbortController | null = null;

export const useUpdateStore = create<UpdateState & UpdateActions>()((set, get) => ({
  latestRelease: null,
  manifest: null,
  hasUpdate: false,
  requiresInstaller: false,
  status: 'idle',
  downloadProgress: null,
  downloadProgressDetails: null,
  errorMessage: null,
  lastChecked: null,

  async checkForUpdates({ force }: { force?: boolean } = {}) {
    const { status, lastChecked, latestRelease } = get();
    if (status === 'checking' || status === 'downloading' || status === 'installing') {
      return latestRelease;
    }

    const recentlyChecked =
      !force && lastChecked !== null && Date.now() - lastChecked < UPDATE_CHECK_INTERVAL_MS;
    if (recentlyChecked) {
      return latestRelease;
    }

    set({ status: 'checking', errorMessage: null });

    try {
      // Desktop uses the Neutralino manifest updater so the button can download
      // resources.neu and restart. Browser mode falls back to the GitHub release page.
      if (isNeutralinoMode()) {
        const desktop = await checkDesktopUpdate(CURRENT_VERSION);
        const hasUpdate = desktop.hasUpdate;

        set({
          manifest: desktop.manifest,
          latestRelease: {
            version: desktop.manifest.version,
            downloadUrl: desktop.releaseUrl,
            releaseUrl: desktop.releaseUrl,
          },
          hasUpdate,
          requiresInstaller: desktop.requiresInstaller,
          status: hasUpdate ? 'available' : 'idle',
          downloadProgress: null,
          downloadProgressDetails: null,
          errorMessage: null,
          lastChecked: Date.now(),
        });

        return get().latestRelease;
      }

      const release = await fetchLatestRelease();
      const nextRelease = release ?? latestRelease;
      const hasUpdate =
        nextRelease?.version && isNewerVersion(nextRelease.version, CURRENT_VERSION);

      set({
        manifest: null,
        latestRelease: nextRelease,
        hasUpdate: Boolean(hasUpdate),
        requiresInstaller: false,
        status: hasUpdate ? 'available' : 'idle',
        downloadProgress: null,
        downloadProgressDetails: null,
        errorMessage: null,
        lastChecked: Date.now(),
      });

      return nextRelease;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed';
      set({
        status: 'error',
        errorMessage: message,
        lastChecked: Date.now(),
      });
      return latestRelease;
    }
  },

  async downloadUpdate() {
    const { manifest, status, requiresInstaller } = get();
    if (!manifest || status === 'downloading' || status === 'installing') {
      return;
    }
    if (requiresInstaller) {
      return;
    }

    activeDownloadAbort?.abort();
    activeDownloadAbort = new AbortController();

    set({
      status: 'downloading',
      downloadProgress: null,
      downloadProgressDetails: null,
      errorMessage: null,
    });

    try {
      await downloadAndWriteResources(
        manifest,
        progress => {
          set({ downloadProgress: progress.percent, downloadProgressDetails: progress });
        },
        activeDownloadAbort.signal
      );
      const progressDetails = get().downloadProgressDetails;
      set({
        status: 'downloaded',
        downloadProgress: 100,
        downloadProgressDetails: progressDetails
          ? { ...progressDetails, percent: 100 }
          : { percent: 100, loaded: 0, total: null },
        errorMessage: null,
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        set({ status: 'available', downloadProgress: null, downloadProgressDetails: null });
        return;
      }
      const message = error instanceof Error ? error.message : 'Download failed';
      set({
        status: 'error',
        errorMessage: message,
        downloadProgress: null,
        downloadProgressDetails: null,
      });
      throw error;
    } finally {
      activeDownloadAbort = null;
    }
  },

  async installUpdate() {
    const { status } = get();
    if (status !== 'downloaded') {
      return;
    }

    set({ status: 'installing', errorMessage: null });
    try {
      await restartAfterUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restart failed';
      set({ status: 'error', errorMessage: message });
      throw error;
    }
  },

  clearError() {
    const { hasUpdate, manifest } = get();
    set({
      status: hasUpdate && manifest ? 'available' : 'idle',
      errorMessage: null,
      downloadProgress: null,
      downloadProgressDetails: null,
    });
  },
}));

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

export function getAvailableUpdateVersion(
  state: Pick<UpdateState, 'manifest' | 'latestRelease'>
): string | null {
  return state.manifest?.version ?? state.latestRelease?.version ?? null;
}
