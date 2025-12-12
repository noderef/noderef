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

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { buildSync } from 'esbuild';
import manifestData from './manifest.js';

export interface ManifestEntry {
  description: string;
  tags: string[];
}

export type Manifest = Record<string, ManifestEntry>;

export interface LoadedLibs {
  manifest: Manifest;
  libs: Record<string, { text: string }>;
}

let cachedLibs: LoadedLibs | null = null;
const shouldCache = process.env.NODE_ENV === 'production';

const LIBS_DIR = path.join(__dirname, 'libs');
const GENERATED_DIRS = [
  path.join(__dirname, '.generated'),
  path.resolve(process.cwd(), 'apps/backend/src/ai/.generated'),
];

export function loadLibs(): LoadedLibs {
  if (shouldCache && cachedLibs) {
    return cachedLibs;
  }

  const libs: LoadedLibs['libs'] = {};
  for (const libName of Object.keys(manifestData)) {
    libs[libName] = {
      text: loadLibText(libName),
    };
  }

  const payload: LoadedLibs = { manifest: manifestData, libs };
  if (shouldCache) {
    cachedLibs = payload;
  }
  return payload;
}

function loadLibText(libName: string): string {
  const generatedText = readFromGenerated(libName);
  if (generatedText) {
    return generatedText;
  }

  const sourcePath = path.join(LIBS_DIR, `${libName}.js`);
  if (!existsSync(sourcePath)) {
    throw new Error(`AI helper library not found: ${libName}`);
  }

  const result = buildSync({
    entryPoints: [sourcePath],
    bundle: false,
    write: false,
    minify: true,
    format: 'esm',
    loader: { '.js': 'js' },
    platform: 'browser',
    target: 'es2019',
  });

  return result.outputFiles?.[0]?.text ?? readFileSync(sourcePath, 'utf-8');
}

function readFromGenerated(libName: string): string | null {
  for (const dir of GENERATED_DIRS) {
    const candidate = path.join(dir, `${libName}.min.js`);
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf-8');
    }
  }
  return null;
}
