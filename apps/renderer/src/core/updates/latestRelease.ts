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
 * Fetches the latest NodeRef release from GitHub.
 * Links directly to the release page where users can choose their installer.
 * All failures are swallowed so the UI stays quiet when offline or if GitHub is unreachable.
 */

import { normalizeVersion } from '@/utils/version';
import { GITHUB_RELEASE_URL } from './constants';

export interface LatestRelease {
  version: string;
  downloadUrl: string | null;
  releaseUrl: string | null;
}

const GITHUB_API_RELEASE = 'https://api.github.com/repos/noderef/noderef/releases/latest';

function isProbablyOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  if (navigator.onLine === false) return false;
  return true;
}

export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  if (!isProbablyOnline() || typeof fetch === 'undefined') {
    return null;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timeoutId: ReturnType<typeof setTimeout> | null =
    controller && typeof setTimeout !== 'undefined'
      ? setTimeout(() => controller.abort(), 4500)
      : null;

  try {
    const response = await fetch(GITHUB_API_RELEASE, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const version = normalizeVersion(data?.tag_name || data?.name || '');
    const releaseUrl = typeof data?.html_url === 'string' ? data.html_url : GITHUB_RELEASE_URL;

    return {
      version: version || '0.0.0',
      downloadUrl: releaseUrl,
      releaseUrl,
    };
  } catch (error) {
    if ((error as any)?.name !== 'AbortError') {
      console.warn('[updates] latest release check failed:', error);
    }
    return null;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
