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

import { describe, expect, it } from 'vitest';
import { loadStaticLibs } from '../../src/ai/loadLibs.js';
import {
  mergeStaticAndRepositoryLibs,
  repositoryLibsToLoadedLibs,
} from '../../src/ai/repositoryJsLib/mergeLibs.js';
import { parseRepositoryJsLib } from '../../src/ai/repositoryJsLib/parseRepositoryJsLib.js';

describe('parseRepositoryJsLib', () => {
  it('creates manifest metadata and lib text from valid file', () => {
    const content = `/**
 * @description Invoice metadata helpers.
 * @tags invoice, finance
 */

for each (var n in nodes) {
  logger.log(n);
}
`;

    const parsed = parseRepositoryJsLib({
      fileName: 'invoice-samples.js',
      content,
      nodeId: 'workspace://SpacesStore/abc',
    });

    expect(parsed).toMatchObject({
      name: 'custom_invoice-samples',
      description: 'Invoice metadata helpers.',
      tags: ['invoice', 'finance'],
      sourceName: 'invoice-samples.js',
    });
    expect(parsed?.text).toContain('for each');
    expect(parsed?.text).not.toContain('@description');
  });

  it('ignores files without @description', () => {
    const parsed = parseRepositoryJsLib({
      fileName: 'missing-desc.js',
      content: '/** @tags foo */\nlogger.log("x");',
      nodeId: 'id-1',
    });
    expect(parsed).toBeNull();
  });

  it('trims tags and removes metadata header from prompt text', () => {
    const content = `/**
 * @description Tagged sample.
 * @tags  alpha , beta ,  gamma
 */

  logger.log(1);
`;

    const parsed = parseRepositoryJsLib({
      fileName: 'tagged.js',
      content,
      nodeId: 'id-2',
    });

    expect(parsed?.tags).toEqual(['alpha', 'beta', 'gamma']);
    expect(parsed?.text.trim()).toBe('logger.log(1);');
  });
});

describe('mergeStaticAndRepositoryLibs', () => {
  it('keeps static libs and adds custom_ prefixed dynamic libs', () => {
    const staticLibs = loadStaticLibs();
    const repoLibs = repositoryLibsToLoadedLibs([
      {
        name: 'custom_invoice-samples',
        description: 'Invoice helpers',
        tags: ['invoice'],
        text: 'logger.log("invoice");',
      },
    ]);

    const merged = mergeStaticAndRepositoryLibs(staticLibs, repoLibs);
    expect(merged.manifest.node).toBeDefined();
    expect(merged.manifest['custom_invoice-samples']).toEqual({
      description: 'Invoice helpers',
      tags: ['invoice'],
    });
    expect(merged.libs['custom_invoice-samples']?.text).toContain('invoice');
  });

  it('does not let dynamic libs overwrite built-in manifest keys', () => {
    const staticLibs = loadStaticLibs();
    const repoLibs = repositoryLibsToLoadedLibs([
      {
        name: 'node',
        description: 'Should be ignored',
        tags: [],
        text: 'override',
      },
      {
        name: 'custom_extra',
        description: 'Extra',
        tags: [],
        text: 'extra',
      },
    ]);

    const merged = mergeStaticAndRepositoryLibs(staticLibs, repoLibs);
    expect(merged.manifest.node.description).toBe(staticLibs.manifest.node.description);
    expect(merged.manifest.custom_extra).toBeDefined();
    expect(merged.libs.custom_extra?.text).toBe('extra');
  });
});
