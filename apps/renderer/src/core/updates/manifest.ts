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

import { isNewerVersion, normalizeVersion } from '@/utils/version';
import type { UpdateManifest, UpdateManifestData } from './types';

export const EXPECTED_APPLICATION_ID = 'nl.noderef.desktop';

export type ManifestValidationError =
  | 'invalid-shape'
  | 'app-id-mismatch'
  | 'missing-resources-url'
  | 'invalid-version';

export type ManifestValidationResult =
  | { ok: true; manifest: UpdateManifest }
  | { ok: false; error: ManifestValidationError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUpdateManifest(raw: unknown): ManifestValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'invalid-shape' };
  }

  const applicationId = typeof raw.applicationId === 'string' ? raw.applicationId.trim() : '';
  const version = normalizeVersion(typeof raw.version === 'string' ? raw.version : '');
  const resourcesURL = typeof raw.resourcesURL === 'string' ? raw.resourcesURL.trim() : '';
  const backendURL =
    typeof raw.backendURL === 'string' && raw.backendURL.trim().length > 0
      ? raw.backendURL.trim()
      : undefined;

  if (!applicationId || !version || !resourcesURL) {
    return { ok: false, error: 'invalid-shape' };
  }

  if (applicationId !== EXPECTED_APPLICATION_ID) {
    return { ok: false, error: 'app-id-mismatch' };
  }

  if (!/^https?:\/\//i.test(resourcesURL)) {
    return { ok: false, error: 'missing-resources-url' };
  }

  if (backendURL && !/^https?:\/\//i.test(backendURL)) {
    return { ok: false, error: 'invalid-shape' };
  }

  let data: UpdateManifestData | undefined;
  if (raw.data !== undefined) {
    if (!isRecord(raw.data)) {
      return { ok: false, error: 'invalid-shape' };
    }
    data = {
      releaseUrl: typeof raw.data.releaseUrl === 'string' ? raw.data.releaseUrl : undefined,
      requiresInstaller: raw.data.requiresInstaller === true,
      neutralinoBinaryVersion:
        typeof raw.data.neutralinoBinaryVersion === 'string'
          ? raw.data.neutralinoBinaryVersion
          : null,
      neutralinoClientVersion:
        typeof raw.data.neutralinoClientVersion === 'string'
          ? raw.data.neutralinoClientVersion
          : null,
      minimumNeutralinoVersion:
        typeof raw.data.minimumNeutralinoVersion === 'string'
          ? raw.data.minimumNeutralinoVersion
          : null,
    };
  }

  return {
    ok: true,
    manifest: {
      applicationId,
      version,
      resourcesURL,
      backendURL,
      data,
    },
  };
}

export function manifestHasNewerVersion(manifestVersion: string, currentVersion: string): boolean {
  const latest = normalizeVersion(manifestVersion);
  const current = normalizeVersion(currentVersion);
  if (!latest || latest === '0.0.0') {
    return false;
  }
  return isNewerVersion(latest, current);
}

export function manifestRequiresInstaller(
  manifest: UpdateManifest,
  runtimeVersion?: string | null
): boolean {
  if (manifest.data?.requiresInstaller) {
    return true;
  }

  const minimum = manifest.data?.minimumNeutralinoVersion;
  if (minimum && runtimeVersion) {
    return isNewerVersion(minimum, normalizeVersion(runtimeVersion));
  }

  return false;
}

export function getManifestReleaseUrl(manifest: UpdateManifest): string | null {
  const url = manifest.data?.releaseUrl;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
