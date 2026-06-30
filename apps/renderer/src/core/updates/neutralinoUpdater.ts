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

import { ensureNeutralinoReady, restartApp } from '@/core/ipc/neutralino';
import {
  getBackendArchiveDownloadUrl,
  getBackendManifestUrl,
  getBackendResourcesDownloadUrl,
  isGitHubBackendUrl,
  isGitHubResourcesUrl,
  resolveResourcesDownloadUrl,
  shouldUseBackendUpdaterProxy,
} from './backendUpdaterProxy';
import { UPDATE_MANIFEST_URL } from './constants';
import {
  computeDownloadPercent,
  downloadResourcesWithProgress,
  type DownloadProgress,
} from './downloadResources';
import {
  getManifestReleaseUrl,
  manifestHasNewerVersion,
  manifestRequiresInstaller,
  parseUpdateManifest,
} from './manifest';
import type { UpdateManifest } from './types';

/** App Resources root (holds resources.neu, node-src, node binary). */
function getResourcesRootPath(): string {
  const nlPath = typeof window !== 'undefined' ? (window as Window).NL_PATH : undefined;
  if (!nlPath) {
    throw new Error('NL_PATH is not available');
  }
  return nlPath;
}

export function getResourcesNeuPath(): string {
  const separator = getResourcesRootPath().includes('\\') ? '\\' : '/';
  return `${getResourcesRootPath()}${separator}resources.neu`;
}

function getRuntimeVersion(): string | null {
  if (typeof window === 'undefined') return null;
  const version = (window as Window).NL_VERSION;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

interface BackendDownloadEvent {
  type: 'progress' | 'done' | 'error';
  loaded?: number;
  total?: number | null;
  message?: string;
  phase?: 'downloading' | 'writing';
}

function scaleProgress(
  progress: DownloadProgress,
  rangeStart: number,
  rangeEnd: number
): DownloadProgress {
  const span = rangeEnd - rangeStart;
  const percent =
    progress.percent === null
      ? null
      : Math.min(rangeEnd, Math.round(rangeStart + (progress.percent * span) / 100));
  return { ...progress, percent };
}

function reportBackendProgress(
  event: BackendDownloadEvent,
  onProgress?: (progress: DownloadProgress) => void
): void {
  const loaded = typeof event.loaded === 'number' ? event.loaded : 0;
  const total = typeof event.total === 'number' && event.total > 0 ? event.total : null;
  const phase = event.phase === 'writing' ? 'writing' : 'downloading';
  onProgress?.({
    percent: phase === 'writing' ? null : computeDownloadPercent(loaded, total),
    loaded,
    total,
    phase,
  });
}

async function consumeNdjsonDownloadStream(
  response: Response,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Download failed: empty response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as BackendDownloadEvent;
    if (event.type === 'error') {
      throw new Error(event.message || 'Download failed');
    }
    if (event.type === 'done') {
      completed = true;
      return;
    }
    reportBackendProgress(event, onProgress);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
        newlineIndex = buffer.indexOf('\n');
      }
    }
    if (buffer) {
      handleLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (!completed) {
    throw new Error('Download did not complete');
  }
}

async function postNdjsonDownload(
  endpoint: string,
  body: Record<string, string>,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      // Response had no JSON body; keep the status-based message.
    }
    throw new Error(message);
  }

  await consumeNdjsonDownloadStream(response, onProgress);
}

/**
 * Asks the local Node backend to download the resources bundle and write it
 * straight to disk, consuming the NDJSON progress stream it returns.
 */
async function downloadResourcesViaBackend(
  resourcesUrl: string,
  targetPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  await postNdjsonDownload(
    getBackendResourcesDownloadUrl(),
    { url: resourcesUrl, targetPath },
    onProgress,
    signal
  );
}

/**
 * Downloads and overlays the platform-independent backend bundle (server code,
 * prisma schema, build-meta) into the app Resources directory.
 */
async function downloadBackendViaBackend(
  backendUrl: string,
  targetDir: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  await postNdjsonDownload(
    getBackendArchiveDownloadUrl(),
    { url: backendUrl, targetDir },
    onProgress,
    signal
  );
}

/**
 * Fallback path when the backend is unavailable: download into memory and write
 * the whole buffer through Neutralino in one call.
 */
async function downloadResourcesViaNeutralino(
  resourcesUrl: string,
  targetPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const NL = (window as Window).Neutralino;
  if (!NL?.filesystem?.writeBinaryFile) {
    throw new Error('Neutralino filesystem API is not available');
  }

  const buffer = await downloadResourcesWithProgress(
    resolveResourcesDownloadUrl(resourcesUrl),
    onProgress,
    signal
  );

  onProgress?.({
    percent: null,
    loaded: buffer.byteLength,
    total: buffer.byteLength,
    phase: 'writing',
  });
  await new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      setTimeout(resolve, 32);
    }
  });

  await NL.filesystem.writeBinaryFile(targetPath, buffer);
  onProgress?.({
    percent: 100,
    loaded: buffer.byteLength,
    total: buffer.byteLength,
    phase: 'writing',
  });
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
  const targetPath = getResourcesNeuPath();
  const targetDir = getResourcesRootPath();
  const resourcesUrl = manifest.resourcesURL;
  const backendUrl = manifest.backendURL;
  const useBackendProxy = shouldUseBackendUpdaterProxy();

  const hasBackendUpdate =
    Boolean(backendUrl) && useBackendProxy && isGitHubBackendUrl(backendUrl!);

  if (backendUrl && !useBackendProxy) {
    throw new Error('Backend update requires a running local backend');
  }

  const backendWeight = hasBackendUpdate ? 35 : 0;

  try {
    if (hasBackendUpdate) {
      await downloadBackendViaBackend(
        backendUrl!,
        targetDir,
        progress => onProgress?.(scaleProgress(progress, 0, backendWeight)),
        signal
      );
    }

    if (useBackendProxy && isGitHubResourcesUrl(resourcesUrl)) {
      await downloadResourcesViaBackend(
        resourcesUrl,
        targetPath,
        progress => onProgress?.(scaleProgress(progress, backendWeight, 100)),
        signal
      );
      return;
    }
    await downloadResourcesViaNeutralino(
      resourcesUrl,
      targetPath,
      progress => onProgress?.(scaleProgress(progress, backendWeight, 100)),
      signal
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error('[updater] Failed to apply desktop update', { targetPath, targetDir, error });
    throw error instanceof Error ? error : new Error(`Failed to write update to ${targetPath}`);
  }
}

export async function restartAfterUpdate(): Promise<void> {
  await restartApp();
}
