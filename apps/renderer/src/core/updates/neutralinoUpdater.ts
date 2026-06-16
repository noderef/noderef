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

import { ensureNeutralinoReady } from '@/core/ipc/neutralino';
import {
  getBackendManifestUrl,
  resolveResourcesDownloadUrl,
  shouldUseBackendUpdaterProxy,
} from './backendUpdaterProxy';
import { UPDATE_MANIFEST_URL } from './constants';
import { downloadResourcesWithProgress, type DownloadProgress } from './downloadResources';
import {
  getManifestReleaseUrl,
  manifestHasNewerVersion,
  manifestRequiresInstaller,
  parseUpdateManifest,
} from './manifest';
import type { UpdateManifest } from './types';

export function getResourcesNeuPath(): string {
  const nlPath = typeof window !== 'undefined' ? (window as Window).NL_PATH : undefined;
  if (!nlPath) {
    throw new Error('NL_PATH is not available');
  }
  const separator = nlPath.includes('\\') ? '\\' : '/';
  return `${nlPath}${separator}resources.neu`;
}

function getRuntimeVersion(): string | null {
  if (typeof window === 'undefined') return null;
  const version = (window as Window).NL_VERSION;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

async function fetchUpdateManifestFromNeutralino(
  manifestUrl: string = UPDATE_MANIFEST_URL
): Promise<UpdateManifest> {
  await ensureNeutralinoReady();
  const NL = (window as Window).Neutralino;
  if (!NL?.updater?.checkForUpdates) {
    throw new Error('Neutralino updater API is not available');
  }

  const raw = await NL.updater.checkForUpdates(manifestUrl);
  const parsed = parseUpdateManifest(raw);
  if (!parsed.ok) {
    throw new Error(`Invalid update manifest: ${parsed.error}`);
  }
  return parsed.manifest;
}

async function fetchUpdateManifestFromBackend(): Promise<UpdateManifest> {
  const response = await fetch(getBackendManifestUrl());
  if (!response.ok) {
    throw new Error(`Manifest fetch failed (${response.status})`);
  }

  const raw = await response.json();
  const parsed = parseUpdateManifest(raw);
  if (!parsed.ok) {
    throw new Error(`Invalid update manifest: ${parsed.error}`);
  }
  return parsed.manifest;
}

async function fetchUpdateManifest(
  manifestUrl: string = UPDATE_MANIFEST_URL
): Promise<UpdateManifest> {
  if (shouldUseBackendUpdaterProxy()) {
    return fetchUpdateManifestFromBackend();
  }
  return fetchUpdateManifestFromNeutralino(manifestUrl);
}

export interface UpdateCheckResult {
  manifest: UpdateManifest;
  hasUpdate: boolean;
  requiresInstaller: boolean;
  releaseUrl: string | null;
}

export async function checkDesktopUpdate(
  currentVersion: string,
  manifestUrl: string = UPDATE_MANIFEST_URL
): Promise<UpdateCheckResult> {
  const manifest = await fetchUpdateManifest(manifestUrl);
  const runtimeVersion = getRuntimeVersion();
  const requiresInstaller = manifestRequiresInstaller(manifest, runtimeVersion);
  const hasUpdate = manifestHasNewerVersion(manifest.version, currentVersion);

  return {
    manifest,
    hasUpdate,
    requiresInstaller,
    releaseUrl: getManifestReleaseUrl(manifest),
  };
}

export async function downloadAndWriteResources(
  manifest: UpdateManifest,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  await ensureNeutralinoReady();
  const NL = (window as Window).Neutralino;
  if (!NL?.filesystem?.writeBinaryFile) {
    throw new Error('Neutralino filesystem API is not available');
  }

  const buffer = await downloadResourcesWithProgress(
    resolveResourcesDownloadUrl(manifest.resourcesURL),
    onProgress,
    signal
  );
  const targetPath = getResourcesNeuPath();
  await NL.filesystem.writeBinaryFile(targetPath, buffer);
}

export async function restartAfterUpdate(): Promise<void> {
  await ensureNeutralinoReady();
  const NL = (window as Window).Neutralino;
  if (!NL?.app?.restartProcess) {
    throw new Error('Neutralino app restart API is not available');
  }
  await NL.app.restartProcess();
}
