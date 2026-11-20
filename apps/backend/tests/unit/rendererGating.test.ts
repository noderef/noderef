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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rendererSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../renderer/src'
);

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

describe('renderer gating sources', () => {
  it('does not use server.isAdmin / result.isAdmin for renderer gating', () => {
    const files = walk(rendererSrc).filter(
      file =>
        /\.(ts|tsx)$/.test(file) &&
        !file.endsWith('.test.ts') &&
        !file.includes(`${path.sep}monaco${path.sep}`)
    );

    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (/\bserver\.isAdmin\b/.test(text) || /\bresult\.isAdmin\b/.test(text)) {
        offenders.push(path.relative(rendererSrc, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
