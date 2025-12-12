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

import path from 'path';
import os from 'os';
import { binDir, configPath, readConfig } from '../lib/paths.mjs';
import { exists } from '../lib/fsx.mjs';
import { error, info } from '../lib/log.mjs';

const cfg = readConfig();

const need = new Set();

if (process.platform === 'darwin') {
  need.add('neutralino-mac_arm64');
  need.add('neutralino-mac_x64');
  need.add('node-mac_arm64');
  need.add('node-mac_x64');
} else if (process.platform === 'win32') {
  need.add('neutralino-win_x64.exe');
  need.add('node-win_x64.exe');
} else {
  need.add('neutralino-linux_x64');
  need.add('node-linux_x64');
  need.add('node-linux_arm64');
}

const missing = [...need].filter((n) => !exists(path.join(binDir(), n)));

if (!exists(configPath())) {
  error('neutralino.config.json missing');
  process.exit(1);
}

if (missing.length) {
  error('Missing binaries:', missing.join(', '));
  info('Fix: pnpm install:all  OR  node ./scripts/fetch-node-binaries.js');
  process.exit(1);
}

console.log('✓ preflight OK');
