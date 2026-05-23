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
  downloadAndWriteResources,
  getResourcesNeuPath,
  restartAfterUpdate,
} from './neutralinoUpdater';

vi.mock('@/core/ipc/neutralino', () => ({
  ensureNeutralinoReady: vi.fn(async () => undefined),
}));

const writeBinaryFile = vi.fn(async () => undefined);
const restartProcess = vi.fn(async () => undefined);

describe('neutralinoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { window?: Window }).window = {
      NL_PATH: '/apps/NodeRef',
      Neutralino: {
        filesystem: { writeBinaryFile },
        app: { restartProcess },
      },
    } as unknown as Window;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );
  });

  it('writes downloaded resources to NL_PATH/resources.neu', async () => {
    await downloadAndWriteResources({
      applicationId: 'nl.noderef.desktop',
      version: '1.0.0',
      resourcesURL: 'https://example.com/noderef-resources.neu',
    });

    expect(getResourcesNeuPath()).toBe('/apps/NodeRef/resources.neu');
    expect(writeBinaryFile).toHaveBeenCalledWith(
      '/apps/NodeRef/resources.neu',
      expect.any(ArrayBuffer)
    );
  });

  it('restarts the app after install', async () => {
    await restartAfterUpdate();
    expect(restartProcess).toHaveBeenCalled();
  });
});
