/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { SearchApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../types.js';
import type { ToolDefinition, ToolResult } from './types.js';

const normalizeNodePath = (pathName: string | undefined): string | null => {
  const trimmed = pathName?.trim();
  return trimmed?.length ? trimmed : null;
};

const tokenize = (value: string): string[] => value.toLowerCase().split(/\s+/g).filter(Boolean);

export const searchTool: ToolDefinition = {
  name: 'search',
  description: `Search the Alfresco repository using AFTS (Alfresco Full Text Search) syntax.

RESULT READING RULES (critical):
- result.pagination.totalCount = TRUE total in the repository (use this for any count answer)
- result.sample[] = preview only — NEVER count sample[] to answer totals

COMMON AFTS PATTERNS:
- All folders:                 TYPE:"cm:folder"
- All files:                   TYPE:"cm:content"
- By name:                     @cm:name:"budget*"
- Full-text keyword:           TEXT:"invoice"
- By path:                     PATH:"/app:company_home/cm:Shared//*"
- By mimetype:                 @cm:content.mimetype:"application/pdf"
- By date range:               @cm:created:[2024-01-01 TO NOW]
- Sites:                       TYPE:"st:site"

For "how many folders": use  TYPE:"cm:folder"  with maxItems:1 — read totalCount.
For "how many files":   use  TYPE:"cm:content"  with maxItems:1 — read totalCount.`,

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'AFTS query string, e.g. TYPE:"cm:folder", TEXT:"report", @cm:name:"budget*"',
      },
      language: {
        type: 'string',
        enum: ['afts', 'text'],
        description: '"afts" for precise AFTS syntax (preferred). "text" for plain keyword search.',
      },
      maxItems: {
        type: 'number',
        description: 'Max results to return in sample[] (1–200). Use 1 for pure count queries.',
      },
    },
    required: ['query'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const searchApi = new SearchApi(ctx.api);
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      const language = typeof args.language === 'string' ? args.language.trim() : 'text';
      const maxItems =
        typeof args.maxItems === 'number' && Number.isFinite(args.maxItems)
          ? Math.max(1, Math.min(Math.floor(args.maxItems), 200))
          : 20;

      if (ctx.signal.aborted) throw new Error('Run was cancelled');

      let aftsQuery: string;
      if (language === 'afts' && query) {
        aftsQuery = query;
      } else {
        const terms = tokenize(query);
        const escaped = terms.map(t => t.replace(/"/g, '\\"')).filter(Boolean);
        aftsQuery = escaped.length
          ? escaped.map(t => `TEXT:"${t}*"`).join(' AND ')
          : 'TYPE:"cm:content" OR TYPE:"cm:folder"';
      }

      const result = await searchApi.search({
        query: { query: '*', language: 'afts' },
        filterQueries: [{ query: aftsQuery }],
        include: ['path'],
        paging: { maxItems, skipCount: 0 },
      } as any);

      const entries = (result.list?.entries ?? []).map((e: any) => e.entry);
      // TRUE total — from Alfresco pagination metadata, not limited by maxItems
      const totalCount = result.list?.pagination?.totalItems ?? entries.length;

      return {
        ok: true,
        data: {
          aftsQuery,
          pagination: {
            totalCount, // ← Always use this for counts / totals
            returned: entries.length,
            maxItems,
          },
          breakdown: {
            files: entries.filter((e: any) => e?.isFile).length,
            folders: entries.filter((e: any) => e?.isFolder).length,
          },
          sample: entries.slice(0, 20).map((e: any) => ({
            id: e.id,
            name: e.name,
            nodeType: e.nodeType,
            isFolder: e.isFolder,
            isFile: e.isFile,
            path: normalizeNodePath(e.path?.name),
            mimeType: e.content?.mimeType ?? null,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
