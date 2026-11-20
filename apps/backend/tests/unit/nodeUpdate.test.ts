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

import { describe, expect, it, vi } from 'vitest';
import {
  extractAlfrescoErrorMessage,
  mergeAspectNames,
  prepareNodeUpdateBody,
} from '../../src/rpc/backend/nodeUpdate.js';

describe('mergeAspectNames', () => {
  it('adds and removes aspects while preserving remaining order', () => {
    expect(
      mergeAspectNames(
        ['cm:titled', 'cm:auditable', 'cm:author'],
        ['cm:taggable'],
        ['cm:auditable']
      )
    ).toEqual(['cm:titled', 'cm:author', 'cm:taggable']);
  });

  it('does not add an aspect that is also being removed', () => {
    expect(mergeAspectNames(['cm:titled'], ['cm:taggable'], ['cm:taggable'])).toEqual([
      'cm:titled',
    ]);
  });
});

describe('prepareNodeUpdateBody', () => {
  it('passes properties and nodeType through without reading aspects', async () => {
    const getNode = vi.fn();
    const body = await prepareNodeUpdateBody({ getNode }, 'node-1', {
      properties: { 'cm:title': 'Hello', 'cm:description': null },
      nodeType: 'cm:content',
    });

    expect(getNode).not.toHaveBeenCalled();
    expect(body).toEqual({
      properties: { 'cm:title': 'Hello', 'cm:description': null },
      nodeType: 'cm:content',
    });
  });

  it('merges aspects from the current node before PUT', async () => {
    const getNode = vi.fn(async () => ({
      entry: { aspectNames: ['cm:titled', 'cm:auditable'] },
    }));

    const body = await prepareNodeUpdateBody({ getNode }, 'node-1', {
      properties: { 'cm:title': 'Hi' },
      nodeType: 'cm:content',
      addAspects: ['cm:taggable'],
      removeAspects: ['cm:auditable'],
    });

    expect(getNode).toHaveBeenCalledWith('node-1', { include: ['aspectNames'] });
    expect(body).toEqual({
      properties: { 'cm:title': 'Hi' },
      nodeType: 'cm:content',
      aspectNames: ['cm:titled', 'cm:taggable'],
    });
  });

  it('refuses to merge aspects when the current list is missing', async () => {
    const getNode = vi.fn(async () => ({ entry: {} }));
    await expect(
      prepareNodeUpdateBody({ getNode }, 'node-1', { addAspects: ['cm:taggable'] })
    ).rejects.toThrow('Could not read the current aspect list');
  });
});

describe('extractAlfrescoErrorMessage', () => {
  it('prefers the Alfresco briefSummary when present', () => {
    expect(
      extractAlfrescoErrorMessage({
        message: 'Request failed',
        response: {
          body: { error: { briefSummary: 'Property cm:name is protected', errorKey: 'protected' } },
        },
      })
    ).toBe('Property cm:name is protected');
  });
});
