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

import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

const rootPkgPath = path.join(root, 'package.json');
const rootPkg = readJson(rootPkgPath);
const version = rootPkg.version;
const APP_ID = 'nl.noderef.desktop';

const files = [
  // Neutralino config
  path.join(root, 'neutralino.config.json'),
  // Workspace package.json files that carry a version
  path.join(root, 'apps', 'renderer', 'package.json'),
  path.join(root, 'apps', 'backend', 'package.json'),
  path.join(root, 'packages', 'contracts', 'package.json'),
];

for (const file of files) {
  const json = readJson(file);

  // neutralino.config.json: sync app id + version
  if (file.endsWith('neutralino.config.json')) {
    json.applicationId = APP_ID;
    if (!json.buildScript) json.buildScript = {};
    if (!json.buildScript.mac) json.buildScript.mac = {};
    json.buildScript.mac.appIdentifier = APP_ID;
    json.version = version;
  } else {
    // package.json: sync version only
    json.version = version;
  }

  writeJson(file, json);
  console.log(`✓ synced ${path.relative(root, file)}`);
}

// Optional: write a build-meta file for other consumers (backend/renderer)
const metaPath = path.join(root, 'resources', 'build-meta.json');
fs.mkdirSync(path.dirname(metaPath), { recursive: true });
writeJson(metaPath, {
  version,
  applicationId: APP_ID,
  generatedAt: new Date().toISOString(),
});
console.log(`✓ wrote resources/build-meta.json`);
