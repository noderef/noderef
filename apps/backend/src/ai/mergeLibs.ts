/**
 * Copyright 2025-2026 NodeRef
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

import type { LoadedLibs, Manifest } from './types/manifest.js';

export function mergeStaticAndRepositoryLibs(
  staticLibs: LoadedLibs,
  repositoryLibs: LoadedLibs
): LoadedLibs {
  const manifest: Manifest = { ...staticLibs.manifest };
  const libs: LoadedLibs['libs'] = { ...staticLibs.libs };

  for (const [name, entry] of Object.entries(repositoryLibs.manifest)) {
    if (name in manifest) {
      continue;
    }
    manifest[name] = entry;
    libs[name] = repositoryLibs.libs[name]!;
  }

  return { manifest, libs };
}

export function repositoryLibsToLoadedLibs(
  entries: Array<{
    name: string;
    description: string;
    tags: string[];
    text: string;
  }>
): LoadedLibs {
  const manifest: Manifest = {};
  const libs: LoadedLibs['libs'] = {};

  for (const entry of entries) {
    manifest[entry.name] = {
      description: entry.description,
      tags: entry.tags,
    };
    libs[entry.name] = { text: entry.text };
  }

  return { manifest, libs };
}
