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

import { sh } from '../lib/exec.mjs';
import { info } from '../lib/log.mjs';

info('Preparing…');
sh('node ./scripts/bin/preflight.mjs');
sh('pnpm sync:meta');
sh('node ./scripts/ensure-build-scripts.js'); // still CJS? fine

const prismaTargets =
  process.env.PRISMA_CLI_BINARY_TARGETS ||
  'darwin,darwin-arm64,windows,debian-openssl-3.0.x,linux-arm64-openssl-3.0.x';

info('Generating Prisma client…');
sh('pnpm --filter @app/backend prisma:generate', {
  env: { ...process.env, PRISMA_CLI_BINARY_TARGETS: prismaTargets },
});

info('Building workspaces…');
sh('pnpm --filter @app/contracts build');
sh('pnpm --filter @app/renderer build');
sh('pnpm --filter @app/backend build'); // tsc (optional if bundling only)
sh('pnpm --filter @app/backend build:bundle'); // esbuild

info('Copying icons…');
sh('node ./scripts/copy-icons.js');

info('Packaging installers…');
sh('./build-scripts/build-mac.sh');
sh('./build-scripts/build-win.sh');
sh('./build-scripts/build-linux.sh');

info('Injecting runtime…');
sh('node ./scripts/bin/copy-runtime.mjs');

console.log('✓ installers ready');
