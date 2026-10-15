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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, init, setIcon } = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  init: vi.fn(),
  setIcon: vi.fn(),
}));

vi.mock('@neutralinojs/lib', () => ({
  app: {},
  events: {
    on: vi.fn(async (event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
  },
  init,
  os: {},
  window: { setIcon },
}));

async function initialize(platform?: string) {
  vi.stubGlobal('window', { NL_OS: platform, NL_VERSION: '6.7.0' });
  const { ensureNeutralinoReady } = await import('./neutralino');
  await Promise.all([ensureNeutralinoReady(), ensureNeutralinoReady()]);
  await ensureNeutralinoReady();
}

describe('Neutralino window icon initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    handlers.clear();
    setIcon.mockResolvedValue(undefined);
    init.mockImplementation(() => {
      queueMicrotask(() => handlers.get('ready')?.());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves the macOS bundle icon after startup', async () => {
    await initialize('Darwin');

    expect(init).toHaveBeenCalledOnce();
    expect(setIcon).not.toHaveBeenCalled();
  });

  it.each(['Windows', 'Linux', 'FreeBSD'])('sets the PNG icon once on %s', async platform => {
    await initialize(platform);

    expect(init).toHaveBeenCalledOnce();
    expect(setIcon).toHaveBeenCalledExactlyOnceWith('/resources/icons/appIcon.png');
  });

  it('preserves the macOS icon when an external dev URL has no NL_OS', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });

    await initialize();

    expect(setIcon).not.toHaveBeenCalled();
  });

  it.each(['Win32', 'Linux x86_64'])(
    'sets the dev window icon on %s without NL_OS',
    async platform => {
      vi.stubGlobal('navigator', { platform });

      await initialize();

      expect(setIcon).toHaveBeenCalledExactlyOnceWith('/resources/icons/appIcon.png');
    }
  );

  it('finishes initialization if setting the window icon fails', async () => {
    const error = new Error('Icon unavailable');
    setIcon.mockRejectedValueOnce(error);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await initialize('Windows');

    expect(warn).toHaveBeenCalledWith('[Neutralino] Failed to set window icon:', error);
  });
});
