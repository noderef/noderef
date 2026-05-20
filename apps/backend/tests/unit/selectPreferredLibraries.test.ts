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
import type { Manifest } from '../../src/ai/types/manifest.js';
import {
  resolveRouterLibrarySelection,
  scoreCustomLibrary,
  suggestedLibrariesForRouter,
} from '../../src/ai/selectPreferredLibraries.js';

const ZTC_QUESTION = '/ai ik wil alle zaaktypen ophalen van open zaak met ztc, geef script';

const ztcManifest: Manifest = {
  custom_ztc: {
    description:
      'Work with Zaaktypecatalogus (ZTC) from Alfresco scripts: list zaaktypen and catalogi.',
    tags: ['ztc', 'zaaktypecatalogus', 'zaaktypen', 'alfresco'],
  },
  search: {
    description: 'Search helpers.',
    tags: ['search'],
  },
};

describe('scoreCustomLibrary', () => {
  it('scores strongly when the question mentions the lib basename', () => {
    const score = scoreCustomLibrary(
      'custom_ztc',
      ztcManifest.custom_ztc!,
      ZTC_QUESTION.toLowerCase()
    );
    expect(score).toBeGreaterThanOrEqual(8);
  });

  it('returns 0 for non-custom libs', () => {
    expect(scoreCustomLibrary('search', ztcManifest.search!, ZTC_QUESTION.toLowerCase())).toBe(0);
  });
});

describe('suggestedLibrariesForRouter', () => {
  it('surfaces custom_ztc for ZTC / zaaktypen questions', () => {
    expect(suggestedLibrariesForRouter(ZTC_QUESTION, ztcManifest)).toContain('custom_ztc');
  });
});

describe('resolveRouterLibrarySelection', () => {
  it('keeps the model selection when it already includes the strong custom match', () => {
    const result = resolveRouterLibrarySelection(ZTC_QUESTION, ztcManifest, '["custom_ztc"]');
    expect(result.selected).toEqual(['custom_ztc']);
    expect(result.parsedBeforeFallback).toEqual(['custom_ztc']);
  });

  it('prepends a strongly matching custom lib when the model picked unrelated libs', () => {
    const result = resolveRouterLibrarySelection(ZTC_QUESTION, ztcManifest, '["search"]');
    expect(result.selected).toEqual(['custom_ztc', 'search']);
  });

  it('injects custom_ztc when the model returns an empty array', () => {
    const result = resolveRouterLibrarySelection(ZTC_QUESTION, ztcManifest, '[]');
    expect(result.selected).toEqual(['custom_ztc']);
    expect(result.parsedBeforeFallback).toEqual([]);
  });

  it('returns an empty selection when nothing matches strongly', () => {
    const manifest: Manifest = {
      custom_other: { description: 'Something unrelated.', tags: ['other'] },
    };
    const result = resolveRouterLibrarySelection('hello world', manifest, '[]');
    expect(result.selected).toEqual([]);
  });

  it('orders ranked custom libs by score descending', () => {
    const manifest: Manifest = {
      custom_ztc: ztcManifest.custom_ztc!,
      custom_alpha: { description: 'Alpha', tags: ['alpha'] },
    };
    const result = resolveRouterLibrarySelection('use ztc for zaaktypen', manifest, '[]');
    expect(result.rankedCustom[0]?.name).toBe('custom_ztc');
    expect(result.rankedCustom[0]!.score).toBeGreaterThan(result.rankedCustom[1]?.score ?? 0);
  });
});
