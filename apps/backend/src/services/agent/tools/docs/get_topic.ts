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

import { hylandDocsService } from '../../../hyland-docs/index.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const hylandDocsGetTopicTool: ToolDefinition = {
  name: 'hyland_docs_get_topic',
  description:
    'Fetch Hyland documentation topic content as markdown using mapId and contentId from hyland_docs_search. Pass citation fields from the search hit when available.',
  skill: { kind: 'local_md', path: '../skills/hyland_docs_get_topic.md', version: 2 },

  inputSchema: {
    type: 'object',
    properties: {
      mapId: {
        type: 'string',
        description: 'Publication map ID from hyland_docs_search results.',
      },
      contentId: {
        type: 'string',
        description: 'Topic content ID from hyland_docs_search results.',
      },
      mapTitle: {
        type: 'string',
        description: 'Publication title from the search hit (for citations).',
      },
      title: {
        type: 'string',
        description: 'Topic title from the search hit (for citations).',
      },
      breadcrumb: {
        type: 'array',
        items: { type: 'string' },
        description: 'Breadcrumb path from the search hit.',
      },
      readerUrl: {
        type: 'string',
        description: 'Reader URL from the search hit.',
      },
      maxChars: {
        type: 'number',
        description: 'Maximum markdown characters to return (default 12000, max 24000).',
      },
    },
    required: ['mapId', 'contentId'],
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const mapId = typeof args.mapId === 'string' ? args.mapId.trim() : '';
      const contentId = typeof args.contentId === 'string' ? args.contentId.trim() : '';
      if (!mapId) {
        return { ok: false, error: 'mapId is required' };
      }
      if (!contentId) {
        return { ok: false, error: 'contentId is required' };
      }

      const maxChars =
        typeof args.maxChars === 'number' && Number.isFinite(args.maxChars)
          ? Math.floor(args.maxChars)
          : undefined;
      const mapTitle = typeof args.mapTitle === 'string' ? args.mapTitle.trim() : null;
      const title = typeof args.title === 'string' ? args.title.trim() : null;
      const readerUrl = typeof args.readerUrl === 'string' ? args.readerUrl.trim() : null;
      const breadcrumb = Array.isArray(args.breadcrumb)
        ? args.breadcrumb.filter((item): item is string => typeof item === 'string')
        : undefined;

      const topic = await hylandDocsService.getTopicContent({
        mapId,
        contentId,
        mapTitle,
        title,
        breadcrumb,
        readerUrl,
        maxChars,
      });

      return {
        ok: true,
        data: {
          source: 'docs.hyland.com',
          mapId: topic.mapId,
          contentId: topic.contentId,
          mapTitle: topic.mapTitle,
          title: topic.title,
          breadcrumb: topic.breadcrumb,
          readerUrl: topic.readerUrl,
          markdown: topic.markdown,
          truncated: topic.truncated,
          totalChars: topic.totalChars,
          returnedChars: topic.returnedChars,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
