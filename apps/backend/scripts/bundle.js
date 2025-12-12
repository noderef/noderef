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
 * Bundles the backend into a single file using esbuild.
 * This eliminates the need to copy node_modules, making builds faster and simpler.
 *
 * Prisma Client is handled separately as it requires runtime generation.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// __dirname is apps/backend/scripts, so we need to go up 3 levels to get to project root
const projectRoot = path.resolve(__dirname, '../../..');
const backendDir = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'resources', 'node-src', 'dist');
const entryPoint = path.join(backendDir, 'src', 'server.ts');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

console.log('→ Bundling backend with esbuild...');

esbuild
  .build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(outDir, 'server.bundle.js'),
    external: [
      // Prisma needs to be external (requires runtime generation)
      '@prisma/client',
      'prisma',
      // Native modules that can't be bundled
      'fsevents',
    ],
    // Bundle dotenv - it's imported at the top of server.ts
    // All other dependencies will be bundled automatically
    minify: process.env.NODE_ENV === 'production',
    sourcemap: false,
    logLevel: 'info',
    logOverride: {
      // Suppress warning about esbuild's internal use of require.resolve("esbuild")
      // We need to bundle esbuild for runtime use, so this warning is expected
      'require-resolve-not-external': 'silent',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
  })
  .then(() => {
    console.log('✓ Backend bundled successfully');

    // The bundle is ready - server.bundle.js contains everything except Prisma
    // Prisma Client will be copied separately by copy-node-binaries.js
    // Create server.js that just requires the bundle
    const wrapper = `#!/usr/bin/env node
// Backend entry point - loads the bundled server
// Prisma Client must be available in node_modules/@prisma/client
require('./server.bundle.js');
`;
    fs.writeFileSync(path.join(outDir, 'server.js'), wrapper);
    fs.chmodSync(path.join(outDir, 'server.js'), 0o755);

    console.log('✓ Created server.js entry point');
  })
  .catch(error => {
    console.error('❌ Bundling failed:', error);
    process.exit(1);
  });
