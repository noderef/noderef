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

/**
 * Create or update a GitHub Release and upload assets with retries.
 * Splits release creation from asset uploads so a GitHub 503 cannot fail the
 * whole publish step after a long installer build.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DEFAULT_GLOBS = [
  'artifacts/mac/*.dmg',
  'artifacts/win/NodeRef-win-*.zip',
  'artifacts/win/NodeRef-win-*.msi',
  'artifacts/linux/NodeRef-linux-*.tar.gz',
  'artifacts/linux/NodeRef-linux-*.AppImage',
  'artifacts/linux/noderef_*.deb',
  'artifacts/updater/*',
];

const REQUIRED_GLOBS = [
  'artifacts/mac/*.dmg',
  'artifacts/win/NodeRef-win-*.zip',
  'artifacts/linux/NodeRef-linux-*.tar.gz',
];

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 15_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function globToRegExp(fileGlob) {
  const escaped = fileGlob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function expandGlob(pattern) {
  const directory = path.dirname(pattern);
  const fileGlob = path.basename(pattern);
  if (!fs.existsSync(directory)) {
    return [];
  }

  const matcher = globToRegExp(fileGlob);
  return fs
    .readdirSync(directory)
    .filter(name => matcher.test(name))
    .map(name => path.join(directory, name))
    .filter(filePath => {
      try {
        return fs.statSync(filePath).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function isRetryableGhError(message) {
  return /503|502|504|429|ECONNRESET|ETIMEDOUT|EAI_AGAIN|temporarily|No server is currently available|secondary rate limit|try again later/i.test(
    message
  );
}

function runGh(args, { silent = false } = {}) {
  try {
    const output = execFileSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (output && !silent) {
      process.stdout.write(output);
    }
    return output;
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    if (!silent) {
      if (stdout) {
        process.stdout.write(stdout);
      }
      if (stderr) {
        process.stderr.write(stderr);
      }
    }
    throw new Error(stderr.trim() || stdout.trim() || err.message);
  }
}

function releaseExists(tag) {
  try {
    runGh(['release', 'view', tag, '--json', 'tagName'], { silent: true });
    return true;
  } catch {
    return false;
  }
}

async function withRetry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!isRetryableGhError(message) || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const delayMs = BASE_DELAY_MS * attempt;
      console.warn(`${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`);
      console.warn(`Retrying in ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function ensureRelease(tag, notesFile) {
  if (releaseExists(tag)) {
    console.log(`Release ${tag} already exists; updating notes`);
    await withRetry(`Update release notes for ${tag}`, () => {
      runGh(['release', 'edit', tag, '--notes-file', notesFile]);
    });
    return;
  }

  try {
    await withRetry(`Create release ${tag}`, () => {
      runGh(['release', 'create', tag, '--title', tag, '--notes-file', notesFile]);
    });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (releaseExists(tag) || /already exists/i.test(message)) {
      console.warn(`Release ${tag} appeared while creating; continuing with upload`);
      return;
    }
    throw err;
  }
}

async function uploadAsset(tag, filePath) {
  const name = path.basename(filePath);
  await withRetry(`Upload ${name}`, () => {
    runGh(['release', 'upload', tag, filePath, '--clobber']);
  });
}

async function main() {
  const tag = process.env.GITHUB_REF_NAME;
  const notesFile = process.env.RELEASE_NOTES_FILE || 'FINAL_RELEASE_NOTES.md';

  if (!tag) {
    throw new Error('GITHUB_REF_NAME is required');
  }
  if (!fs.existsSync(notesFile)) {
    throw new Error(`Release notes file not found: ${notesFile}`);
  }

  const files = DEFAULT_GLOBS.flatMap(pattern => {
    const matches = expandGlob(pattern);
    if (matches.length === 0 && !REQUIRED_GLOBS.includes(pattern)) {
      console.log(`Skipping missing optional pattern: ${pattern}`);
    }
    return matches;
  });

  for (const required of REQUIRED_GLOBS) {
    if (expandGlob(required).length === 0) {
      throw new Error(`Required release artifact not found: ${required}`);
    }
  }

  console.log(`Publishing ${tag} with ${files.length} asset(s):`);
  files.forEach(filePath => console.log(`  - ${filePath}`));

  await ensureRelease(tag, notesFile);

  for (const filePath of files) {
    await uploadAsset(tag, filePath);
  }

  console.log(`✓ Published ${tag}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
