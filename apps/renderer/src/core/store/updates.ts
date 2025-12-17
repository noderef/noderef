/**
 * Copyright 2025 NodeRef
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

import { GITHUB_RELEASE_URL, UPDATE_CHECK_INTERVAL_MS } from '@/core/updates/constants';
import { fetchLatestRelease, type LatestRelease } from '@/core/updates/latestRelease';
import { isNewerVersion } from '@/utils/version';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UpdateStatus = 'idle' | 'checking';

const CURRENT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0';
//const CURRENT_VERSION = '0.0.1';

/**
 * Get the download URL from a release, with fallback to GitHub releases page.
 */
export function getDownloadUrl(release: LatestRelease | null): string {
  return release?.downloadUrl || release?.releaseUrl || GITHUB_RELEASE_URL;
}

interface UpdateState {
  latestRelease: LatestRelease | null;
  hasUpdate: boolean;
  status: UpdateStatus;
  lastChecked: number | null;
  lastNotifiedVersion: string | null;
}

interface UpdateActions {
  checkForUpdates: (options?: { force?: boolean }) => Promise<LatestRelease | null>;
  markNotified: (version: string) => void;
}

export const useUpdateStore = create<UpdateState & UpdateActions>()(
  persist(
    (set, get) => ({
      latestRelease: null,
      hasUpdate: false,
      status: 'idle',
      lastChecked: null,
      lastNotifiedVersion: null,
      async checkForUpdates({ force }: { force?: boolean } = {}) {
        const { status, lastChecked, latestRelease } = get();
        if (status === 'checking') return latestRelease;

        const recentlyChecked =
          !force && lastChecked !== null && Date.now() - lastChecked < UPDATE_CHECK_INTERVAL_MS;
        if (recentlyChecked) {
          return latestRelease;
        }

        set({ status: 'checking' });

        try {
          const release = await fetchLatestRelease();
          const nextRelease = release ?? latestRelease;
          const hasUpdate =
            nextRelease?.version && isNewerVersion(nextRelease.version, CURRENT_VERSION);

          set({
            latestRelease: nextRelease,
            hasUpdate: Boolean(hasUpdate),
            status: 'idle',
            lastChecked: Date.now(),
          });

          return nextRelease;
        } catch {
          // Silently fall back to previous state
          set({ status: 'idle', lastChecked: Date.now() });
          return latestRelease;
        }
      },
      markNotified: version => set({ lastNotifiedVersion: version }),
    }),
    {
      name: 'updates-store',
      partialize: state => ({
        lastNotifiedVersion: state.lastNotifiedVersion,
      }),
    }
  )
);

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
