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

import type { HylandMapPreview, HylandMapTopicPreview, TopicsSearchApiResponse } from './types.js';

export interface HylandDocsClientOptions {
  baseUrl?: string;
  callingApp?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://docs.hyland.com';
const DEFAULT_CALLING_APP = 'NodeRef';

export class HylandDocsClient {
  private readonly baseUrl: string;
  private readonly callingApp: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HylandDocsClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.HYLAND_DOCS_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      ''
    );
    this.callingApp =
      options.callingApp ?? process.env.HYLAND_DOCS_CALLING_APP ?? DEFAULT_CALLING_APP;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'Ft-Calling-App': this.callingApp,
      Accept: 'application/json, text/plain, */*',
      ...extra,
    };
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(
        init?.body ? { 'Content-Type': 'application/json', ...(init.headers as object) } : undefined
      ),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Hyland docs API ${path} failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`
      );
    }
    return (await response.json()) as T;
  }

  private async requestText(path: string): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Hyland docs API ${path} failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`
      );
    }
    return response.text();
  }

  async listMaps(): Promise<HylandMapPreview[]> {
    const maps = await this.requestJson<HylandMapPreview[]>('/api/khub/maps');
    return Array.isArray(maps) ? maps : [];
  }

  async searchTopics(params: {
    query: string;
    page?: number;
    perPage?: number;
  }): Promise<TopicsSearchApiResponse> {
    const page = params.page ?? 1;
    const perPage = Math.max(1, Math.min(params.perPage ?? 20, 50));
    return this.requestJson<TopicsSearchApiResponse>('/api/khub/topics/search', {
      method: 'POST',
      body: JSON.stringify({
        query: params.query,
        page,
        per_page: perPage,
      }),
    });
  }

  async listMapTopics(mapId: string): Promise<HylandMapTopicPreview[]> {
    const encodedMapId = encodeURIComponent(mapId);
    const topics = await this.requestJson<HylandMapTopicPreview[]>(
      `/api/khub/maps/${encodedMapId}/topics`
    );
    return Array.isArray(topics) ? topics : [];
  }

  async getTopicMarkdown(mapId: string, contentId: string): Promise<string> {
    const encodedMapId = encodeURIComponent(mapId);
    const encodedContentId = encodeURIComponent(contentId);
    return this.requestText(
      `/api/khub/maps/${encodedMapId}/topics/${encodedContentId}/content?format=markdown`
    );
  }
}
