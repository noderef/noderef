/**
 * Copyright 2025 NodeRef
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

import fs from 'fs';
import path from 'path';

export const exists = p => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

export const ensureDir = p => fs.mkdirSync(p, { recursive: true });

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJson(p, o) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}

export function cp(src, dest, opts = {}) {
  ensureDir(path.dirname(dest));

  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);

  // Fast path: identical strings
  if (resolvedSrc === resolvedDest) {
    return;
  }

  // Better check: if both exist and resolve to the same real path (symlinks),
  // skip the copy to avoid ERR_FS_CP_EINVAL.
  try {
    const realSrc = fs.realpathSync(resolvedSrc);
    const realDest = fs.realpathSync(resolvedDest);
    if (realSrc === realDest) {
      // Same underlying location, nothing to do
      return;
    }
  } catch {
    // realpathSync can fail if dest doesn't exist yet; that's fine,
    // we just fall back to the normal copy.
  }

  fs.cpSync(resolvedSrc, resolvedDest, {
    recursive: true,
    force: true,
    errorOnExist: false,
    ...opts,
  });
}

export function rm(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  // On Windows, chmod stubborn paths then retry
  if (exists(p)) {
    try {
      fs.chmodSync(p, 0o700);
      fs.rmSync(p, { recursive: true, force: true });
    } catch {}
  }
}
