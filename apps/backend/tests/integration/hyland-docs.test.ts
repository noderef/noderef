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
import { hylandDocsService } from '../../src/services/hyland-docs/index.js';

const liveEnabled = process.env.HYLAND_DOCS_LIVE_TEST === '1';

describe.runIf(liveEnabled)('hyland docs live API', () => {
  it('searches Solr documentation and fetches markdown for a hit', async () => {
    const search = await hylandDocsService.search({
      query: 'Solr configuration',
      publication: 'Alfresco Search Services',
      maxResults: 2,
    });

    expect(search.results.length).toBeGreaterThan(0);
    const first = search.results[0];
    expect(first.mapId).toBeTruthy();
    expect(first.contentId).toBeTruthy();

    const topic = await hylandDocsService.getTopicContent({
      mapId: first.mapId,
      contentId: first.contentId,
      mapTitle: first.mapTitle,
      title: first.title,
      breadcrumb: first.breadcrumb,
      readerUrl: first.readerUrl,
      maxChars: 4000,
    });

    expect(topic.markdown.length).toBeGreaterThan(50);
  }, 30_000);
});
