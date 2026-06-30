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

import { getBackendUrl, isBackendReady } from '@/core/ipc/backendConnection';

const GITHUB_RELEASE_DOWNLOAD_PREFIX = 'https://github.com/noderef/noderef/releases/download/';
const RESOURCES_ASSET_SUFFIX = '/noderef-resources.neu';

export function isGitHubResourcesUrl(url: string): boolean {
  return url.startsWith(GITHUB_RELEASE_DOWNLOAD_PREFIX) && url.endsWith(RESOURCES_ASSET_SUFFIX);
}

export function shouldUseBackendUpdaterProxy(): boolean {
  return isBackendReady();
}

export function getBackendManifestUrl(): string {
  return `${getBackendUrl()}/updates/manifest`;
}

export function getBackendResourcesProxyUrl(resourcesUrl: string): string {
  return `${getBackendUrl()}/updates/resources?url=${encodeURIComponent(resourcesUrl)}`;
}

export function getBackendResourcesDownloadUrl(): string {
  return `${getBackendUrl()}/updates/download`;
}

export function resolveResourcesDownloadUrl(url: string): string {
  if (shouldUseBackendUpdaterProxy() && isGitHubResourcesUrl(url)) {
    return getBackendResourcesProxyUrl(url);
  }
  return url;
}
