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

// scripts/bin/prepare-resources.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const resourcesDir = path.join(root, 'resources');
const destClient = path.join(resourcesDir, 'neutralino.js');

// Try multiple possible sources
const possibleSources = [
  path.join(root, 'apps', 'renderer', 'public', 'neutralino.js'),
  path.join(root, 'resources', 'resources', 'neutralino.js'), // from vite closeBundle
];

// Also try to resolve from @neutralinojs/lib as fallback
let srcClient = null;
for (const src of possibleSources) {
  if (fs.existsSync(src)) {
    srcClient = src;
    break;
  }
}

// Fallback: try to resolve from node_modules
if (!srcClient) {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const neutralinoLibPath = require.resolve('@neutralinojs/lib/dist/neutralino.js');
    if (fs.existsSync(neutralinoLibPath)) {
      srcClient = neutralinoLibPath;
    }
  } catch (e) {
    // ignore - will error below if still not found
  }
}

// ensure resources dir exists
fs.mkdirSync(resourcesDir, { recursive: true });

if (!srcClient || !fs.existsSync(srcClient)) {
  console.error('[prepare-resources] Missing neutralino.js source');
  console.error('  Tried:', possibleSources);
  process.exit(1);
}

fs.copyFileSync(srcClient, destClient);
console.log(`[prepare-resources] copied ${srcClient} -> resources/neutralino.js`);
