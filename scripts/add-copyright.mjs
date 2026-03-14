import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const START_YEAR = 2025;
const currentYear = new Date().getFullYear();
const copyrightYears = currentYear > START_YEAR ? `${START_YEAR}-${currentYear}` : `${START_YEAR}`;
const EXPECTED_COPYRIGHT_LINE = ` * Copyright ${copyrightYears} NodeRef`;

const COPYRIGHT_HEADER = `/**
${EXPECTED_COPYRIGHT_LINE}
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

`;

const MINIMAL_HEADER_FRAGMENT = 'Licensed under the Apache License, Version 2.0';
const COPYRIGHT_LINE_REGEX = /^ \* Copyright \d{4}(?:-\d{4})? NodeRef$/m;

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const IGNORE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.vscode',
  '.generated',
  '.turbo',
  'coverage',
  'public', // often contains static assets not suitable for headers
  'resources', // often contains binaries or external assets
];

// Folders to specifically target for source code
const TARGET_ROOT_DIRS = ['apps', 'packages', 'scripts'];

const AI_LIBS_SEGMENT = path.sep + path.join('ai', 'libs') + path.sep;

function shouldIgnore(filePath) {
  if (filePath.includes(AI_LIBS_SEGMENT)) return true;
  return IGNORE_DIRS.some(dir => filePath.includes(`${path.sep}${dir}${path.sep}`));
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // If an Apache header exists, update only the copyright year line when stale.
    if (content.includes(MINIMAL_HEADER_FRAGMENT)) {
      if (content.includes(EXPECTED_COPYRIGHT_LINE)) {
        return;
      }

      if (COPYRIGHT_LINE_REGEX.test(content)) {
        const updated = content.replace(COPYRIGHT_LINE_REGEX, EXPECTED_COPYRIGHT_LINE);
        if (updated !== content) {
          fs.writeFileSync(filePath, updated);
          console.log(`Updated: ${filePath}`);
        }
      }
      return;
    }

    // Handle shebang specifically
    if (content.startsWith('#!')) {
      const firstLineEnd = content.indexOf('\n');
      if (firstLineEnd !== -1) {
        const shebang = content.slice(0, firstLineEnd + 1);
        const rest = content.slice(firstLineEnd + 1);
        fs.writeFileSync(filePath, shebang + '\n' + COPYRIGHT_HEADER + rest);
        console.log(`Updated: ${filePath}`);
        return;
      }
    }

    fs.writeFileSync(filePath, COPYRIGHT_HEADER + content);
    console.log(`Updated: ${filePath}`);
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(file)) {
        walkDir(fullPath);
      }
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS.includes(ext) && !shouldIgnore(fullPath)) {
        processFile(fullPath);
      }
    }
  }
}

console.log('Adding copyright headers...');

TARGET_ROOT_DIRS.forEach(dirName => {
  const fullPath = path.join(rootDir, dirName);
  if (fs.existsSync(fullPath)) {
    walkDir(fullPath);
  }
});

// Also handle files in root if necessary, but usually we stick to src dirs.
// Intentionally skipping root level files to avoid messing with config files indiscriminately unless requested.

console.log('Done.');
