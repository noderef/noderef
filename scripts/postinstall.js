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
 * Postinstall script that ensures @prisma/client is built before running prisma generate
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running postinstall scripts...');

try {
  // Step 1: Build contracts package
  console.log('Building @app/contracts...');
  execSync('pnpm --filter @app/contracts build', { stdio: 'inherit' });

  // Step 2: Try to run prisma generate
  // If @prisma/client isn't built yet, we'll get a helpful error
  console.log('Running prisma generate...');
  try {
    execSync('pnpm --filter @app/backend prisma:generate', { stdio: 'inherit' });
  } catch (error) {
    // If it fails, try rebuilding @prisma/client
    console.warn('prisma generate failed. Attempting to rebuild @prisma/client...');
    try {
      // Rebuild @prisma/client to trigger its postinstall script
      execSync('pnpm rebuild @prisma/client', { stdio: 'inherit' });
      // Now try prisma generate again
      execSync('pnpm --filter @app/backend prisma:generate', { stdio: 'inherit' });
    } catch (retryError) {
      console.error('\n⚠️  Failed to build @prisma/client automatically.');
      console.error('This usually happens when pnpm blocks build scripts.');
      console.error('\nTo fix this, run:');
      console.error('  pnpm rebuild @prisma/client');
      console.error('  pnpm --filter @app/backend prisma:generate');
      console.error('\nOr approve build scripts for @prisma/client:');
      console.error('  pnpm approve-builds @prisma/client');
      // Don't exit with error - let the user fix it manually
      process.exit(0);
    }
  }

  console.log('✓ Postinstall completed successfully');
} catch (error) {
  console.error('Postinstall failed:', error.message);
  // Don't exit with error for postinstall - it's not critical
  process.exit(0);
}
