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

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupRuntimeFiles, publishPort } from '../../src/lib/port.js';

describe('port runtime files', () => {
  let prevDataDir: string | undefined;
  let tmpBase: string | null = null;

  afterEach(() => {
    if (prevDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = prevDataDir;
    }
    if (tmpBase && existsSync(tmpBase)) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
    tmpBase = null;
  });

  it('publishPort writes backend-port and backend-pid', () => {
    prevDataDir = process.env.DATA_DIR;
    tmpBase = mkdtempSync(path.join(os.tmpdir(), 'noderef-port-test-'));
    process.env.DATA_DIR = tmpBase;

    publishPort(4242);

    const runtimeDir = path.join(tmpBase, '.runtime');
    expect(readFileSync(path.join(runtimeDir, 'backend-port'), 'utf8').trim()).toBe('4242');
    expect(readFileSync(path.join(runtimeDir, 'backend-pid'), 'utf8').trim()).toBe(
      String(process.pid)
    );
  });

  it('cleanupRuntimeFiles removes backend-port and backend-pid', () => {
    prevDataDir = process.env.DATA_DIR;
    tmpBase = mkdtempSync(path.join(os.tmpdir(), 'noderef-port-test-'));
    process.env.DATA_DIR = tmpBase;

    publishPort(9999);
    const runtimeDir = path.join(tmpBase, '.runtime');
    expect(existsSync(path.join(runtimeDir, 'backend-port'))).toBe(true);
    expect(existsSync(path.join(runtimeDir, 'backend-pid'))).toBe(true);

    cleanupRuntimeFiles();
    expect(existsSync(path.join(runtimeDir, 'backend-port'))).toBe(false);
    expect(existsSync(path.join(runtimeDir, 'backend-pid'))).toBe(false);
  });
});
