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
import {
  getBackendManifestUrl,
  getBackendResourcesProxyUrl,
  isGitHubResourcesUrl,
  resolveResourcesDownloadUrl,
} from './backendUpdaterProxy';

vi.mock('@/core/ipc/backendConnection', () => ({
  getBackendUrl: vi.fn(() => 'http://127.0.0.1:5111'),
  isBackendReady: vi.fn(() => true),
}));

import { isBackendReady } from '@/core/ipc/backendConnection';

describe('backendUpdaterProxy', () => {
  beforeEach(() => {
    vi.mocked(isBackendReady).mockReturnValue(true);
  });

  it('detects GitHub resources URLs', () => {
    expect(
      isGitHubResourcesUrl(
        'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu'
      )
    ).toBe(true);
    expect(isGitHubResourcesUrl('https://example.com/noderef-resources.neu')).toBe(false);
  });

  it('routes manifest and resources through the local backend', () => {
    expect(getBackendManifestUrl()).toBe('http://127.0.0.1:5111/updates/manifest');
    expect(
      getBackendResourcesProxyUrl(
        'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu'
      )
    ).toBe(
      'http://127.0.0.1:5111/updates/resources?url=https%3A%2F%2Fgithub.com%2Fnoderef%2Fnoderef%2Freleases%2Fdownload%2Fv0.10.1%2Fnoderef-resources.neu'
    );
    expect(
      resolveResourcesDownloadUrl(
        'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu'
      )
    ).toContain('/updates/resources?url=');
  });

  it('keeps direct URLs when the backend is not ready', () => {
    vi.mocked(isBackendReady).mockReturnValue(false);
    const direct =
      'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu';
    expect(resolveResourcesDownloadUrl(direct)).toBe(direct);
  });
});
