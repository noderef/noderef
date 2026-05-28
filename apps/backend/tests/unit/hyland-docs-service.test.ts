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
  HylandDocsPublicationResolutionError,
  HylandDocsService,
} from '../../src/services/hyland-docs/service.js';
import type { HylandDocsClient } from '../../src/services/hyland-docs/client.js';

describe('HylandDocsService', () => {
  it('requires mapId or publication for search', async () => {
    const client = {
      searchTopics: vi.fn(),
      getTopicMarkdown: vi.fn(),
      listMaps: vi.fn(),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    await expect(service.search({ query: 'solr' })).rejects.toBeInstanceOf(
      HylandDocsPublicationResolutionError
    );
    expect(client.searchTopics).not.toHaveBeenCalled();
  });

  it('filters search results when mapId is set', async () => {
    const client = {
      searchTopics: vi.fn().mockResolvedValue({
        results: [
          {
            mapId: 'acs-map',
            mapTitle: 'Alfresco Content Services',
            contentId: 'topic-acs',
            occurrences: [
              {
                readerUrl:
                  'https://docs.hyland.com/r/Alfresco/Alfresco-Content-Services/26.1/Alfresco-Content-Services/Intro',
                breadcrumb: ['Introduction'],
              },
            ],
          },
          {
            mapId: 'search-map',
            mapTitle: 'Alfresco Search Services',
            contentId: 'topic-solr',
            occurrences: [
              {
                readerUrl:
                  'https://docs.hyland.com/r/Alfresco/Alfresco-Search-Services/1.3/Alfresco-Search-Services/Solr',
                breadcrumb: ['Solr configuration files'],
              },
            ],
          },
        ],
      }),
      getTopicMarkdown: vi.fn(),
      listMapTopics: vi.fn().mockResolvedValue([
        {
          id: 'topic-acs',
          title: 'Introduction',
          readerUrl:
            'https://docs.hyland.com/r/Alfresco/Alfresco-Content-Services/26.1/Alfresco-Content-Services/Intro',
          breadcrumb: ['Alfresco Content Services', 'Introduction'],
          metadata: [{ key: 'component', values: ['Alfresco Content Services'] }],
        },
      ]),
      listMaps: vi.fn(),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);

    const hits = await service.search({
      query: 'introduction',
      mapId: 'acs-map',
      version: '26.1',
      maxResults: 5,
    });

    expect(hits.results).toHaveLength(1);
    expect(hits.results[0]?.mapId).toBe('acs-map');
    expect(hits.mapId).toBe('acs-map');
    expect(client.searchTopics).not.toHaveBeenCalled();
  });

  it('auto-resolves publication with high confidence', async () => {
    const client = {
      searchTopics: vi.fn().mockResolvedValue({
        results: [
          {
            mapId: 'acs-map',
            mapTitle: 'Alfresco Content Services',
            contentId: 'topic-acs',
            occurrences: [{ breadcrumb: ['Intro'], readerUrl: 'https://docs.hyland.com/r/Alfresco/ACS/26.1/x' }],
          },
        ],
      }),
      getTopicMarkdown: vi.fn(),
      listMapTopics: vi.fn().mockResolvedValue([
        {
          id: 'topic-acs',
          title: 'Content model',
          readerUrl: 'https://docs.hyland.com/r/Alfresco/ACS/26.1/x',
          breadcrumb: ['Alfresco Content Services', 'Content model'],
          metadata: [{ key: 'component', values: ['Alfresco Content Services'] }],
        },
      ]),
      listMaps: vi.fn().mockResolvedValue([
        {
          id: 'acs-map',
          title: 'Alfresco Content Services',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Content-Services/26.1'] }],
        },
        {
          id: 'adw-map',
          title: 'Alfresco Digital Workspace',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Digital-Workspace/4.0'] }],
        },
      ]),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const hits = await service.search({
      query: 'content model',
      publication: 'Alfresco Content Services',
      version: '26.1',
      maxResults: 5,
    });

    expect(hits.mapId).toBe('acs-map');
    expect(hits.publicationResolveConfidence).toBe('high');
    expect(hits.resolvedPublicationTitle).toContain('Content Services');
    expect(client.searchTopics).not.toHaveBeenCalled();
  });

  it('auto-resolves repeated guide titles to the newest version', async () => {
    const client = {
      searchTopics: vi.fn(),
      getTopicMarkdown: vi.fn(),
      listMapTopics: vi.fn().mockResolvedValue([
        {
          id: 'solr-topic',
          title: 'Solr configuration',
          readerUrl:
            'https://docs.hyland.com/r/Alfresco/Alfresco-Search-Services/2.0/Configure/Solr-configuration',
          breadcrumb: ['Alfresco Search Services', 'Configure', 'Solr configuration'],
          metadata: [{ key: 'component', values: ['Alfresco Search Services'] }],
        },
      ]),
      listMaps: vi.fn().mockResolvedValue([
        {
          id: 'search-map-1',
          title: 'Alfresco Search Services',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Search-Services/1.0'] }],
        },
        {
          id: 'search-map-2',
          title: 'Alfresco Search Services',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Search-Services/2.0'] }],
        },
      ]),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const hits = await service.search({
      query: 'Solr configuration',
      publication: 'Alfresco Search Services',
      maxResults: 2,
    });

    expect(hits.mapId).toBe('search-map-2');
    expect(hits.publicationResolveConfidence).toBe('high');
    expect(client.listMapTopics).toHaveBeenCalledWith('search-map-2');
  });

  it('fetches additional search pages until enough hits', async () => {
    const noisePage = Array.from({ length: 50 }, (_, index) => ({
      mapId: 'other-map',
      mapTitle: 'Other Guide',
      contentId: `noise-${index}`,
      occurrences: [{ breadcrumb: ['Noise'] }],
    }));

    const client = {
      searchTopics: vi
        .fn()
        .mockResolvedValueOnce({ results: noisePage })
        .mockResolvedValueOnce({
          results: [
            {
              mapId: 'fallback-map',
              mapTitle: 'Alfresco Content Services',
              contentId: 'topic-2',
              occurrences: [{ breadcrumb: ['Page 2'] }],
            },
          ],
        }),
      getTopicMarkdown: vi.fn(),
      listMapTopics: vi.fn().mockResolvedValue([]),
      listMaps: vi.fn(),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const hits = await service.search({
      query: 'model',
      mapId: 'fallback-map',
      maxResults: 1,
    });

    expect(client.searchTopics).toHaveBeenCalledTimes(2);
    expect(hits.pagesFetched).toBe(2);
    expect(hits.results).toHaveLength(1);
  });

  it('lists publications ranked by product query', async () => {
    const client = {
      searchTopics: vi.fn(),
      getTopicMarkdown: vi.fn(),
      listMaps: vi.fn().mockResolvedValue([
        {
          id: 'acs-map',
          title: 'Alfresco Content Services',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Content-Services/26.1'] }],
        },
        {
          id: 'adw-map',
          title: 'Alfresco Digital Workspace',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Digital-Workspace/4.0'] }],
        },
        {
          id: 'other-map',
          title: 'Hyland Experience Cloud',
          metadata: [{ key: 'ft:prettyUrl', values: ['Experience/Cloud'] }],
        },
      ]),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const listed = await service.listPublications({
      query: 'Content Services',
      version: '26.1',
      maxResults: 5,
    });

    expect(listed.publications.length).toBeGreaterThan(0);
    expect(listed.publications[0]?.mapId).toBe('acs-map');
    expect(listed.totalInScope).toBe(1);
  });

  it('returns no publications on failed list query', async () => {
    const client = {
      searchTopics: vi.fn(),
      getTopicMarkdown: vi.fn(),
      listMaps: vi.fn().mockResolvedValue([
        {
          id: 'acs-map',
          title: 'Alfresco Content Services',
          metadata: [{ key: 'ft:prettyUrl', values: ['Alfresco/Alfresco-Content-Services/26.1'] }],
        },
      ]),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const listed = await service.listPublications({
      query: 'Nonexistent Product XYZ',
      maxResults: 5,
    });

    expect(listed.publications).toHaveLength(0);
    expect(listed.hint).toContain('No publication');
  });

  it('returns citation metadata from getTopicContent', async () => {
    const client = {
      searchTopics: vi.fn(),
      getTopicMarkdown: vi.fn().mockResolvedValue('# Hello'),
      listMaps: vi.fn(),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const topic = await service.getTopicContent({
      mapId: 'map-1',
      contentId: 'content-1',
      mapTitle: 'Alfresco Content Services',
      title: 'Introduction',
      breadcrumb: ['Guide', 'Introduction'],
      readerUrl: 'https://docs.hyland.com/r/Alfresco/ACS/26.1/Intro',
    });

    expect(topic.mapTitle).toBe('Alfresco Content Services');
    expect(topic.title).toBe('Introduction');
    expect(topic.readerUrl).toContain('docs.hyland.com');
    expect(topic.breadcrumb).toEqual(['Guide', 'Introduction']);
  });

  it('truncates topic markdown when over maxChars', async () => {
    const longText = 'x'.repeat(20_000);
    const client = {
      searchTopics: vi.fn(),
      getTopicMarkdown: vi.fn().mockResolvedValue(longText),
      listMaps: vi.fn(),
    } as unknown as HylandDocsClient;

    const service = new HylandDocsService(client);
    const topic = await service.getTopicContent({
      mapId: 'map-1',
      contentId: 'content-1',
      maxChars: 1000,
    });

    expect(topic.truncated).toBe(true);
    expect(topic.returnedChars).toBe(1000);
    expect(topic.totalChars).toBe(20_000);
  });
});
