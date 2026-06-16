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
import type { UpdateFlowStatus, UpdateManifest } from '@/core/updates/types';
import { isNewerVersion } from '@/utils/version';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

const memoryPersistStorage = new Map<string, string>();

const fallbackPersistStorage: StateStorage = {
  getItem: name => memoryPersistStorage.get(name) ?? null,
  setItem: (name, value) => {
    memoryPersistStorage.set(name, value);
  },
  removeItem: name => {
    memoryPersistStorage.delete(name);
  },
};

function resolvePersistStorage(): StateStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return fallbackPersistStorage;
}

const CURRENT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0';

/**
 * Get the download URL from a release, with fallback to GitHub releases page.
 */
export function getDownloadUrl(release: LatestRelease | null): string {
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
  errorMessage: string | null;
  lastChecked: number | null;
  lastNotifiedVersion: string | null;
}

interface UpdateActions {
  checkForUpdates: (options?: { force?: boolean }) => Promise<LatestRelease | null>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  clearError: () => void;
  markNotified: (version: string) => void;
}

let activeDownloadAbort: AbortController | null = null;

export const useUpdateStore = create<UpdateState & UpdateActions>()(
  persist(
    (set, get) => ({
      latestRelease: null,
      manifest: null,
      hasUpdate: false,
      requiresInstaller: false,
      status: 'idle',
      downloadProgress: null,
      errorMessage: null,
      lastChecked: null,
      lastNotifiedVersion: null,

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
          // GitHub release redirects break in the Neutralino webview (CORS). Proxy via
          // the local backend when it is ready; fall back to Neutralino updater otherwise.
          if (isNeutralinoMode() && !import.meta.env.DEV) {
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

        set({ status: 'downloading', downloadProgress: null, errorMessage: null });

        try {
          await downloadAndWriteResources(
            manifest,
            progress => {
              set({ downloadProgress: progress.percent });
            },
            activeDownloadAbort.signal
          );
          set({ status: 'downloaded', downloadProgress: 100, errorMessage: null });
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') {
            set({ status: 'available', downloadProgress: null });
            return;
          }
          const message = error instanceof Error ? error.message : 'Download failed';
          set({
            status: 'error',
            errorMessage: message,
            downloadProgress: null,
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
        });
      },

      markNotified: version => set({ lastNotifiedVersion: version }),
    }),
    {
      name: 'updates-store',
      storage: createJSONStorage(() => resolvePersistStorage()),
      partialize: state => ({
        lastNotifiedVersion: state.lastNotifiedVersion,
      }),
    }
  )
);

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

export function getAvailableUpdateVersion(
  state: Pick<UpdateState, 'manifest' | 'latestRelease'>
): string | null {
  return state.manifest?.version ?? state.latestRelease?.version ?? null;
}
