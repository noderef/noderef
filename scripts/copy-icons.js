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
 * Copies icon files from assets/icons/ to resources/icons/
 * This ensures icons are available in the build output directory
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../assets/icons');
const DEST = path.resolve(__dirname, '../resources/icons');

if (!fs.existsSync(SRC)) {
  console.error('❌ assets/icons/ not found — add your icons there');
  process.exit(1);
}

// Create destination directory
fs.mkdirSync(DEST, { recursive: true });

// Copy all icon files
const files = fs.readdirSync(SRC);
if (files.length === 0) {
  console.warn('⚠️  assets/icons/ is empty — no icons to copy');
  process.exit(0);
}

let copied = 0;
files.forEach(file => {
  // Skip README, shell scripts, and hidden files
  if (file === 'README.md' || file.startsWith('.') || file.endsWith('.sh')) {
    return;
  }

  const srcPath = path.join(SRC, file);
  const destPath = path.join(DEST, file);

  // Only copy if it's a file (not a directory)
  if (fs.statSync(srcPath).isFile()) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copied: ${file}`);
    copied++;
  }
});

if (copied === 0) {
  console.warn('⚠️  No icon files found to copy');
} else {
  console.log(`\n✓ Copied ${copied} icon file(s) to resources/icons/`);
}
