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

import { context, build, type Loader } from 'esbuild';
import { mkdirSync, readdirSync } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const outArgIndex = args.findIndex(a => a === '--outDir');
const outLabel =
  outArgIndex >= 0 && args[outArgIndex + 1] && !args[outArgIndex + 1].startsWith('--')
    ? args[outArgIndex + 1]
    : 'src';

const aiDir = path.resolve(__dirname, '..');
const libsDir = path.join(aiDir, 'libs');
const repoRoot = path.resolve(aiDir, '../../../..');
const outDir = resolveOutDir(outLabel);

function resolveOutDir(label: string) {
  if (!label || label === 'src') {
    return path.join(aiDir, '.generated');
  }
  return path.join(repoRoot, 'resources/node-src/dist/.generated');
  if (path.isAbsolute(label)) {
    return label;
  }
  return path.resolve(process.cwd(), label);
}

const entryPoints = readdirSync(libsDir)
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(libsDir, file));

if (!entryPoints.length) {
  console.warn('[ai-libs] No libraries found in', libsDir);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const buildOptions = {
  entryPoints,
  outdir: outDir,
  bundle: false,
  minify: true,
  target: 'es2019',
  loader: { '.js': 'js' as Loader },
  outExtension: { '.js': '.min.js' },
  logLevel: 'info' as const,
};

async function run() {
  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log(`[ai-libs] Watching ${libsDir} -> ${outDir}`);
    return;
  }

  await build(buildOptions);
  console.log(`[ai-libs] Built ${entryPoints.length} libraries -> ${outDir}`);
}

run().catch(err => {
  console.error('[ai-libs] Failed to build helper libraries:', err);
  process.exit(1);
});
