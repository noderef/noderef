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

/**
 * Fixes @prisma/client/index.js to properly re-export from .prisma/client
 * This is needed because Prisma generates the client to .prisma/client but
 * @prisma/client/index.js is often empty and needs to re-export it.
 *
 * This script is safe to run in both dev and production environments.
 * It only modifies the file if it's empty or exports an empty object.
 */

const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(backendDir, 'node_modules');
const clientIndexJs = path.join(nodeModulesDir, '@prisma', 'client', 'index.js');
const standardPrismaClient = path.join(nodeModulesDir, '.prisma', 'client');
const pkgPrismaClient = path.join(nodeModulesDir, '@prisma', 'client', '.prisma', 'client');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function fixPrismaClientIndex() {
  if (!exists(clientIndexJs)) {
    console.warn('[fix-prisma-client] @prisma/client/index.js not found, skipping fix');
    return false;
  }

  const currentContent = fs.readFileSync(clientIndexJs, 'utf8').trim();

  // Only fix if the file is empty or exports an empty object
  if (currentContent !== 'module.exports = {}' && currentContent !== '') {
    // File already has content, don't modify it
    return true;
  }

  // Determine which location exists and use the appropriate require path
  let requirePath = '.prisma/client'; // default to relative path from @prisma/client
  if (exists(pkgPrismaClient)) {
    requirePath = '.prisma/client';
  } else if (exists(standardPrismaClient)) {
    // Use relative path from @prisma/client to node_modules/.prisma/client
    requirePath = '../../.prisma/client';
  } else {
    console.warn('[fix-prisma-client] .prisma/client not found, cannot fix index.js');
    return false;
  }

  const reExportContent = `try {
  module.exports = require('${requirePath}');
} catch (e) {
  // Fallback if .prisma/client is not found
  console.error('Failed to load Prisma client:', e.message);
  module.exports = {};
}
`;

  fs.writeFileSync(clientIndexJs, reExportContent, 'utf8');
  console.log('[fix-prisma-client] Fixed @prisma/client/index.js to re-export from .prisma/client');
  return true;
}

if (require.main === module) {
  fixPrismaClientIndex();
}

module.exports = { fixPrismaClientIndex };
