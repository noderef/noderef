#!/usr/bin/env node

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

// scripts/bin/copy-backend.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const backendDist = path.join(root, 'apps', 'backend', 'dist');
const target = path.join(root, 'resources', 'node-src', 'dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// Check if backend bundle already exists in target (from bundle.js)
// If so, we don't need to copy from apps/backend/dist
if (fs.existsSync(path.join(target, 'server.js'))) {
  console.log(
    '[copy-backend] Backend bundle already exists at resources/node-src/dist (from bundle.js)'
  );
  // Still check if apps/backend/dist has additional files we need
  if (fs.existsSync(backendDist)) {
    // Copy any additional files from dist that aren't in the bundle
    // (e.g., type definitions, source maps from tsc)
    try {
      const files = fs.readdirSync(backendDist, { recursive: true, withFileTypes: true });
      for (const file of files) {
        if (file.isFile()) {
          const srcFile = path.join(backendDist, file.name);
          const destFile = path.join(target, file.name);
          // Only copy if it doesn't exist or is a .d.ts/.map file
          if (
            !fs.existsSync(destFile) ||
            file.name.endsWith('.d.ts') ||
            file.name.endsWith('.map')
          ) {
            const destDir = path.dirname(destFile);
            fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(srcFile, destFile);
          }
        }
      }
      console.log('[copy-backend] Copied additional files from apps/backend/dist');
    } catch (err) {
      // Ignore errors - bundle.js output is sufficient
    }
  }
  return;
}

if (!fs.existsSync(backendDist)) {
  console.error('[copy-backend] apps/backend/dist not found. Did you build @app/backend?');
  console.error('  Run: pnpm --filter @app/backend build');
  process.exit(1);
}

copyDir(backendDist, target);
console.log('[copy-backend] copied apps/backend/dist -> resources/node-src/dist');
