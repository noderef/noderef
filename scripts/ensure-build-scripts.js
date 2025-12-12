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

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_SCRIPTS_DIR = path.resolve(__dirname, '../build-scripts');
const REPO_URL = 'https://github.com/hschneider/neutralino-build-scripts.git';
// Pin to a specific commit for reproducibility and security
const PINNED_COMMIT_SHA =
  process.env.BUILD_SCRIPTS_COMMIT_SHA || 'ececd00d5fcbc78b83947db8fbab4a4b628ffd13';
const configPath = path.resolve(__dirname, '../neutralino.config.json');

// Validate and fix buildScript config
function fixBuildScriptConfig() {
  if (!fs.existsSync(configPath)) return;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  let needsFix = false;

  if (config.buildScript?.mac) {
    const mac = config.buildScript.mac;
    if (mac.appName && mac.appBundleName && mac.appName !== mac.appBundleName) {
      console.warn(
        `⚠️  appName ("${mac.appName}") and appBundleName ("${mac.appBundleName}") must match. Fixing...`
      );
      mac.appBundleName = mac.appName;
      needsFix = true;
    }
  }

  if (needsFix) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('✓ Fixed neutralino.config.json');
  }
}

// Fix config before cloning
fixBuildScriptConfig();

// Helper function to create scaffold symlink
function createScaffoldSymlink() {
  const scaffoldLink = path.resolve(__dirname, '../_app_scaffolds');
  const scaffoldTarget = path.resolve(BUILD_SCRIPTS_DIR, '_app_scaffolds');

  if (fs.existsSync(BUILD_SCRIPTS_DIR) && fs.existsSync(scaffoldTarget)) {
    if (!fs.existsSync(scaffoldLink)) {
      try {
        fs.symlinkSync(scaffoldTarget, scaffoldLink, 'dir');
        console.log('✓ Created symlink: _app_scaffolds -> build-scripts/_app_scaffolds');
      } catch (err) {
        // Symlink might already exist or permission issue
        if (err.code !== 'EEXIST') {
          console.warn('⚠️  Could not create _app_scaffolds symlink:', err.message);
        }
      }
    }
  }
}

if (fs.existsSync(BUILD_SCRIPTS_DIR)) {
  // Check if it's a valid git repo
  try {
    execSync('git rev-parse --git-dir', { cwd: BUILD_SCRIPTS_DIR, stdio: 'ignore' });

    // If we have a pinned commit, verify it matches
    if (PINNED_COMMIT_SHA) {
      try {
        const currentSha = execSync('git rev-parse HEAD', {
          cwd: BUILD_SCRIPTS_DIR,
          encoding: 'utf8',
        }).trim();
        if (currentSha !== PINNED_COMMIT_SHA) {
          console.log(
            `⚠ build-scripts/ commit mismatch. Expected ${PINNED_COMMIT_SHA}, got ${currentSha}. Re-cloning...`
          );
          fs.rmSync(BUILD_SCRIPTS_DIR, { recursive: true, force: true });
        } else {
          console.log('✓ build-scripts/ already exists and matches pinned commit — skipping clone');
          createScaffoldSymlink();
          process.exit(0);
        }
      } catch (verifyError) {
        console.log('⚠ Failed to verify commit SHA, re-cloning...');
        fs.rmSync(BUILD_SCRIPTS_DIR, { recursive: true, force: true });
      }
    } else {
      console.log('✓ build-scripts/ already exists — skipping clone');
      console.log(
        '⚠ WARNING: No commit SHA pinned. Set BUILD_SCRIPTS_COMMIT_SHA env var for reproducibility.'
      );
      createScaffoldSymlink();
      process.exit(0);
    }
  } catch {
    // Invalid repo, remove and re-clone
    console.log('⚠ build-scripts/ exists but is invalid, removing...');
    fs.rmSync(BUILD_SCRIPTS_DIR, { recursive: true, force: true });
  }
}

console.log('Cloning neutralino-build-scripts into build-scripts/...');
console.log('This may take a moment...');

let retries = 3;
let lastError;

while (retries > 0) {
  try {
    // Use shallow clone when not pinned for speed; drop --depth 1 when pinning to allow checkout
    const cloneCmd = PINNED_COMMIT_SHA
      ? `git clone ${REPO_URL} ${BUILD_SCRIPTS_DIR}`
      : `git clone --depth 1 ${REPO_URL} ${BUILD_SCRIPTS_DIR}`;
    execSync(cloneCmd, { stdio: 'inherit' });
    console.log('✓ Cloned successfully');

    // Checkout pinned commit if specified
    if (PINNED_COMMIT_SHA) {
      try {
        execSync(`git checkout ${PINNED_COMMIT_SHA}`, { cwd: BUILD_SCRIPTS_DIR, stdio: 'inherit' });
        console.log(`✓ Checked out pinned commit: ${PINNED_COMMIT_SHA}`);

        // Verify the checkout was successful
        const actualSha = execSync('git rev-parse HEAD', {
          cwd: BUILD_SCRIPTS_DIR,
          encoding: 'utf8',
        }).trim();
        if (actualSha !== PINNED_COMMIT_SHA) {
          throw new Error(`Commit SHA mismatch: expected ${PINNED_COMMIT_SHA}, got ${actualSha}`);
        }
      } catch (checkoutError) {
        console.error(
          `✗ Failed to checkout pinned commit ${PINNED_COMMIT_SHA}:`,
          checkoutError.message
        );
        if (fs.existsSync(BUILD_SCRIPTS_DIR)) {
          fs.rmSync(BUILD_SCRIPTS_DIR, { recursive: true, force: true });
        }
        throw checkoutError;
      }
    } else {
      console.warn(
        '⚠ WARNING: No commit SHA pinned. Set BUILD_SCRIPTS_COMMIT_SHA env var for reproducibility.'
      );
    }

    // Re-check config after clone (in case it was updated)
    fixBuildScriptConfig();

    // Create scaffold symlink
    createScaffoldSymlink();

    process.exit(0);
  } catch (err) {
    lastError = err;
    retries--;

    if (retries > 0) {
      console.log(`\n⚠ Clone failed, retrying... (${retries} attempts remaining)`);
      // Clean up partial clone
      if (fs.existsSync(BUILD_SCRIPTS_DIR)) {
        fs.rmSync(BUILD_SCRIPTS_DIR, { recursive: true, force: true });
      }
    }
  }
}

console.error('\n✗ Failed to clone build-scripts after multiple attempts');
console.error('Error:', lastError.message);
console.error('\nPlease try manually:');
console.error(`  git clone ${REPO_URL} ${BUILD_SCRIPTS_DIR}`);
process.exit(1);
