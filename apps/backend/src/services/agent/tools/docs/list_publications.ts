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
import { normalizeDocsScope } from '../../../hyland-docs/catalog.js';
import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const hylandDocsListPublicationsTool: ToolDefinition = {
  name: 'hyland_docs_list_publications',
  description:
    'Find which Hyland documentation guide (publication) to search before topic lookup. Returns mapId, title, and version for the Alfresco portal index or a filtered subset. Use when the user names a product (ACS, Digital Workspace, Search Services, connector, etc.).',
  skill: { kind: 'local_md', path: '../skills/hyland_docs_list_publications.md', version: 1 },

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Product or guide name tokens from the user question, e.g. "Alfresco Content Services", "Digital Workspace", "Transform Service", "Content Connector Azure". Not topic keywords.',
      },
      scope: {
        type: 'string',
        enum: ['alfresco_portal', 'all'],
        description:
          'alfresco_portal (default): guides on docs.hyland.com/p/alfresco. all: entire docs site (requires query).',
      },
      version: {
        type: 'string',
        description: 'Optional release filter, e.g. "26.1".',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum guides to return (1–25, default 12).',
      },
    },
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = typeof args.query === 'string' ? args.query.trim() : null;
      const scope = normalizeDocsScope(args.scope);
      const version = typeof args.version === 'string' ? args.version.trim() : null;
      const maxResults =
        typeof args.maxResults === 'number' && Number.isFinite(args.maxResults)
          ? Math.floor(args.maxResults)
          : undefined;

      const result = await hylandDocsService.listPublications({
        query: query || null,
        scope,
        version,
        maxResults,
      });

      return {
        ok: true,
        data: {
          source: 'docs.hyland.com',
          query: result.query,
          scope: result.scope,
          version: result.version,
          totalInScope: result.totalInScope,
          hint: result.hint,
          publications: result.publications,
          nextStep:
            'Call hyland_docs_search with mapId from the best publication and a topic-focused query (configuration steps, API name, error text, etc.).',
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
