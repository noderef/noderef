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

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');

function run(command, options = {}) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit', cwd: projectRoot, ...options });
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return pkg.version;
}

function updateVersion(newVersion) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ Updated version to ${newVersion}`);
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close();
      resolve(ans);
    })
  );
}

function validateVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function getNextVersion(currentVersion) {
  const parts = currentVersion.split('.');
  if (parts.length === 3) {
    const [major, minor, patch] = parts;
    return `${major}.${minor}.${parseInt(patch) + 1}`;
  }
  return currentVersion;
}

async function main() {
  const currentVersion = getCurrentVersion();
  const suggestedVersion = getNextVersion(currentVersion);

  console.log(`Current version: ${currentVersion}`);

  const versionInput = await askQuestion(`Enter new version [${suggestedVersion}]: `);
  const newVersion = versionInput.trim() || suggestedVersion;

  if (!validateVersion(newVersion)) {
    console.error('Error: Invalid version format. Use semantic versioning (e.g., 0.1.4)');
    process.exit(1);
  }

  console.log(`\nReleasing version ${newVersion}...`);

  // 1. Update package.json
  updateVersion(newVersion);

  // 2. Sync metadata
  console.log('\nSyncing metadata...');
  run('pnpm sync:meta');

  // 3. Stage changes
  console.log('\nStaging changes...');
  run('git add package.json neutralino.config.json apps/*/package.json packages/*/package.json');

  // 4. Commit
  console.log('\nCommitting changes...');
  run(`git commit -m "Release v${newVersion}"`);

  // 5. Create tag
  console.log('\nCreating tag...');
  run(`git tag v${newVersion}`);

  // 6. Push to origin
  console.log('\nPushing to origin...');
  run('git push origin main');
  run(`git push origin v${newVersion}`);

  console.log(`\n✓ Successfully released v${newVersion}!`);
  console.log(`\nGitHub Actions will now build and publish the release.`);
  console.log(`View release: https://github.com/noderef/noderef/releases/tag/v${newVersion}`);
}

main().catch(err => {
  console.error('Release failed:', err.message);
  process.exit(1);
});
