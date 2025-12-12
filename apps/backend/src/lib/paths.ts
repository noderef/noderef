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

// apps/backend/src/lib/paths.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function getDataDirFromArgsOrEnv(): string {
  const arg = process.argv.find(a => a.startsWith('--dataDir='));
  const fromArg = arg ? arg.split('=')[1] : undefined;
  const fromEnv = process.env.DATA_DIR;

  // If --dataDir/DATA_DIR absent (browser dev), default to appId-based paths for consistency.
  // In Neutralino we pass the app's data dir (--dataDir=...), which will be nl.noderef.desktop.
  // For dev mode (browser), we use the same appId structure to keep paths predictable.
  const APP_ID = 'nl.noderef.desktop';
  const base =
    fromArg ||
    fromEnv ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', APP_ID)
      : process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming', APP_ID)
        : path.join(os.homedir(), '.local', 'share', APP_ID));

  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return base;
}

export function getDatabasePath(): string {
  // In development, use local dev.db in project root
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    // Find project root by looking for pnpm-workspace.yaml or package.json
    // Start from __dirname and walk up until we find the marker file
    let currentDir = __dirname;
    let projectRoot = currentDir;

    // From resources/node-src/dist/lib, we need to go up 4 levels to reach project root
    // But to be safe, search for a marker file
    for (let i = 0; i < 10; i++) {
      const workspaceFile = path.join(currentDir, 'pnpm-workspace.yaml');
      const packageFile = path.join(currentDir, 'package.json');
      if (fs.existsSync(workspaceFile) || fs.existsSync(packageFile)) {
        // Check if this directory also has an 'apps' subdirectory (confirm it's the monorepo root)
        const appsDir = path.join(currentDir, 'apps');
        if (fs.existsSync(appsDir)) {
          projectRoot = currentDir;
          break;
        }
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break; // Reached filesystem root
      currentDir = parent;
    }

    return path.join(projectRoot, 'dev.db');
  }
  // Production: use data directory
  return path.join(getDataDirFromArgsOrEnv(), 'noderef.db');
}
