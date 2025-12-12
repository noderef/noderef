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
import { cp, exists, rm } from '../lib/fsx.mjs';
import { error, info, warn } from '../lib/log.mjs';
import { appName, backendDir, binDir, distDir, resources } from '../lib/paths.mjs';
import { copyPrismaCliTo, copyPrismaTo } from '../lib/prisma.mjs';

function copyNodeBinary(srcName, destPath) {
  const src = path.join(binDir(), srcName);
  if (!exists(src)) {
    warn(`missing ${srcName}`);
    return false;
  }
  cp(src, destPath);
  try {
    if (process.platform !== 'win32') fs.chmodSync(destPath, 0o755);
  } catch {}
  return true;
}

function platformTargets() {
  return [
    {
      plat: 'mac',
      arch: 'arm64',
      bin: 'node-mac_arm64',
      app: path.join(distDir(), 'mac_arm64', `${appName()}.app`, 'Contents', 'Resources'),
      prismaTargets: ['darwin-arm64'],
    },
    {
      plat: 'mac',
      arch: 'x64',
      bin: 'node-mac_x64',
      app: path.join(distDir(), 'mac_x64', `${appName()}.app`, 'Contents', 'Resources'),
      prismaTargets: ['darwin'],
    },
    {
      plat: 'mac',
      arch: 'universal',
      bin: 'node-mac_arm64',
      app: path.join(distDir(), 'mac_universal', `${appName()}.app`, 'Contents', 'Resources'),
      prismaTargets: ['darwin', 'darwin-arm64'],
    },
    {
      plat: 'win',
      arch: 'x64',
      bin: 'node-win_x64.exe',
      app: path.join(distDir(), 'win_x64'),
      prismaTargets: ['windows'],
    },
    {
      plat: 'linux',
      arch: 'x64',
      bin: 'node-linux_x64',
      app: path.join(distDir(), 'linux_x64', appName()),
      prismaTargets: ['debian-openssl-3.0.x'],
    },
    {
      plat: 'linux',
      arch: 'arm64',
      bin: 'node-linux_arm64',
      app: path.join(distDir(), 'linux_arm64', appName()),
      prismaTargets: ['linux-arm64-openssl-3.0.x'],
    },
    {
      plat: 'linux',
      arch: 'armhf',
      bin: 'node-linux_arm64',
      app: path.join(distDir(), 'linux_armhf', appName()),
      prismaTargets: ['linux-arm64-openssl-3.0.x'],
    },
  ];
}

info('Copying Node binary, node-src, and Prisma into app bundles...');

const nodeSrc = path.join(resources(), 'node-src');
if (!exists(nodeSrc)) {
  error(`node-src not found at ${nodeSrc} (build backend first)`);
  process.exit(1);
}

let failed = false;

for (const t of platformTargets()) {
  if (!exists(t.app)) {
    warn(`skip: ${t.app} not found`);
    continue;
  }

  const nodeDest = path.join(t.app, t.plat === 'win' ? 'node.exe' : 'node');
  copyNodeBinary(t.bin, nodeDest);

  const nodeSrcDest = path.join(t.app, 'node-src');
  if (exists(nodeSrcDest)) rm(nodeSrcDest);
  cp(nodeSrc, nodeSrcDest);

  const prismaSources = path.join(backendDir(), 'prisma');
  if (exists(prismaSources)) {
    cp(prismaSources, path.join(nodeSrcDest, 'prisma'));
  } else {
    warn(`prisma schema not found at ${prismaSources}`);
  }

  const nm = path.join(nodeSrcDest, 'node_modules');
  if (exists(nm)) rm(nm);
  fs.mkdirSync(nm, { recursive: true });

  const copied = copyPrismaTo(nm, t.prismaTargets);
  // We no longer bundle Prisma CLI to keep runtime slim; migrations are handled at build or via embedded schema.
  if (!copied) {
    failed = true;
    error(`Prisma client binaries missing for ${t.plat}/${t.arch} (${t.prismaTargets.join(', ')})`);
  }

  info(`✓ ${t.plat}/${t.arch} → OK`);
}

if (failed) {
  error('Prisma packaging failed; see errors above');
  process.exit(1);
}

console.log('\n✓ Runtime copied');
