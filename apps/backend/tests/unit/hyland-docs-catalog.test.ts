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
import {
  classifyProductFamily,
  extractVersionFromUrl,
  matchesAlfrescoPortalScope,
  matchesPublicationFilter,
  matchesProductFamily,
  matchesVersion,
  normalizeProductFamily,
  scorePublicationMatch,
  tokenizePublicationQuery,
} from '../../src/services/hyland-docs/catalog.js';

describe('hyland-docs catalog', () => {
  it('normalizes product family values', () => {
    expect(normalizeProductFamily('ALFRESCO')).toBe('alfresco');
    expect(normalizeProductFamily('unknown')).toBe('any');
  });

  it('extracts version from reader URLs', () => {
    expect(
      extractVersionFromUrl(
        'https://docs.hyland.com/r/Alfresco/Alfresco-Content-Services/26.1/Alfresco-Content-Services/Introduction'
      )
    ).toBe('26.1');
  });

  it('classifies Solr search services hits', () => {
    expect(
      classifyProductFamily({
        mapTitle: 'Alfresco Search Services',
        breadcrumb: ['Configure', 'Solr configuration files'],
        readerUrl: 'https://docs.hyland.com/r/Alfresco/Alfresco-Search-Services/1.3/Configure/Solr',
      })
    ).toBe('solr');
  });

  it('filters alfresco product family', () => {
    expect(
      matchesProductFamily('alfresco', {
        mapTitle: 'Alfresco Content Services',
        breadcrumb: ['Introduction'],
        readerUrl:
          'https://docs.hyland.com/r/Alfresco/Alfresco-Content-Services/26.1/Alfresco-Content-Services/Introduction',
      })
    ).toBe(true);

    expect(
      matchesProductFamily('alfresco', {
        mapTitle: 'Alfresco Search Services',
        breadcrumb: ['Solr configuration'],
        readerUrl: 'https://docs.hyland.com/r/Alfresco/Alfresco-Search-Services/1.3/Solr',
      })
    ).toBe(false);
  });

  it('matches version filters', () => {
    const url =
      'https://docs.hyland.com/r/Alfresco/Alfresco-Content-Services/26.1/Alfresco-Content-Services/Introduction';
    expect(matchesVersion('26.1', url)).toBe(true);
    expect(matchesVersion('7.4', url)).toBe(false);
  });

  it('detects Alfresco portal publications', () => {
    expect(
      matchesAlfrescoPortalScope({
        mapTitle: 'Alfresco Digital Workspace',
        prettyUrl: 'Alfresco/Alfresco-Digital-Workspace',
      })
    ).toBe(true);
    expect(matchesAlfrescoPortalScope({ mapTitle: 'Hyland Experience Cloud' })).toBe(false);
  });

  it('matches publication title filters by tokens', () => {
    expect(matchesPublicationFilter('Digital Workspace', 'Alfresco Digital Workspace')).toBe(true);
    expect(matchesPublicationFilter('Transform Service', 'Alfresco Content Services')).toBe(false);
  });

  it('scores publication lookup queries with ACS synonyms', () => {
    const tokens = tokenizePublicationQuery('ACS 26.1');
    expect(tokens).toContain('acs');
    expect(
      scorePublicationMatch('ACS', {
        title: 'Alfresco Content Services',
        version: '26.1',
      })
    ).toBeGreaterThan(0);
    expect(
      scorePublicationMatch('ACS', { title: 'Alfresco Digital Workspace', version: '4.0' })
    ).toBe(0);
  });
});
