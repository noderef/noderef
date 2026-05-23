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

import { describe, expect, it } from 'vitest';
import {
  EXPECTED_APPLICATION_ID,
  manifestHasNewerVersion,
  manifestRequiresInstaller,
  parseUpdateManifest,
} from './manifest';

const baseManifest = {
  applicationId: EXPECTED_APPLICATION_ID,
  version: '1.0.0',
  resourcesURL: 'https://example.com/noderef-resources.neu',
};

describe('parseUpdateManifest', () => {
  it('accepts a valid manifest', () => {
    const result = parseUpdateManifest({
      ...baseManifest,
      data: {
        releaseUrl: 'https://github.com/noderef/noderef/releases/tag/v1.0.0',
        minimumNeutralinoVersion: '6.7.0',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.version).toBe('1.0.0');
      expect(result.manifest.data?.minimumNeutralinoVersion).toBe('6.7.0');
    }
  });

  it('rejects invalid shape', () => {
    expect(parseUpdateManifest(null).ok).toBe(false);
    expect(parseUpdateManifest({ version: '1.0.0' }).ok).toBe(false);
  });

  it('rejects app id mismatch', () => {
    const result = parseUpdateManifest({
      ...baseManifest,
      applicationId: 'other.app',
    });
    expect(result).toEqual({ ok: false, error: 'app-id-mismatch' });
  });

  it('rejects non-http resources URL', () => {
    const result = parseUpdateManifest({
      ...baseManifest,
      resourcesURL: 'ftp://example.com/file.neu',
    });
    expect(result.ok).toBe(false);
  });
});

describe('manifestHasNewerVersion', () => {
  it('detects newer, equal, and older versions', () => {
    expect(manifestHasNewerVersion('1.2.0', '1.1.0')).toBe(true);
    expect(manifestHasNewerVersion('1.1.0', '1.1.0')).toBe(false);
    expect(manifestHasNewerVersion('1.0.0', '1.2.0')).toBe(false);
    expect(manifestHasNewerVersion('v2.0.0', '1.9.9')).toBe(true);
  });
});

describe('manifestRequiresInstaller', () => {
  it('returns true when manifest flag is set', () => {
    const manifest = {
      ...baseManifest,
      data: { requiresInstaller: true },
    };
    expect(manifestRequiresInstaller(manifest, '6.7.0')).toBe(true);
  });

  it('returns true when runtime is below minimum Neutralino version', () => {
    const manifest = {
      ...baseManifest,
      data: { minimumNeutralinoVersion: '7.0.0' },
    };
    expect(manifestRequiresInstaller(manifest, '6.7.0')).toBe(true);
    expect(manifestRequiresInstaller(manifest, '7.0.0')).toBe(false);
  });
});
