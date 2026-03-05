/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { SearchApi } from '@alfresco/js-api';
import type { AgentExecutionContext } from '../../types.js';
import { toNodeSummary } from '../helpers/nodeResultHelpers.js';
import { extractByPath, SEARCH_API_PATH } from '../helpers/searchHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { buildWriteApiTrace, writeTextToNode } from '../text/write_service.js';
const DEFAULT_QUERY = 'TYPE:"cm:content"';
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
const DEFAULT_MAX_TOTAL_ITEMS = 5000;
const MAX_MAX_TOTAL_ITEMS = 20000;
const DEFAULT_COLUMNS = ['id', 'name', 'modifiedAt', 'content.mimeType'];
type ExportFormat = 'csv' | 'tsv' | 'jsonl' | 'markdown' | 'xml' | 'plain' | 'custom';

const toDelimitedCell = (value: unknown, delimiter: string): string => {
  const normalized = typeof value === 'string' ? value : value == null ? '' : String(value);
  const pattern = delimiter === '\t' ? /["\t\n\r]/ : /[",\n\r]/;
  if (!pattern.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/g, '""')}"`;
};

const toDelimitedRow = (values: unknown[], delimiter: string): string =>
  values.map(value => toDelimitedCell(value, delimiter)).join(delimiter);

const toPlainValue = (value: unknown): string => {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const escapeXml = (value: unknown): string =>
  toPlainValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const sanitizeXmlTag = (value: string): string => {
  const normalized = value.replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (!normalized) {
    return 'field';
  }
  return /^[A-Za-z_]/.test(normalized) ? normalized : `f_${normalized}`;
};

const markdownEscape = (value: unknown): string =>
  toPlainValue(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const resolveCompanyHomeId = async (searchApi: SearchApi): Promise<string | null> => {
  const result = await searchApi.search({
    query: { query: '*', language: 'afts' },
    filterQueries: [{ query: 'PATH:"/app:company_home"' }],
    paging: { maxItems: 1, skipCount: 0 },
  } as any);
  const entry = result?.list?.entries?.[0]?.entry;
  const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
  return id || null;
};

const normalizeColumns = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_COLUMNS;
  }
  const columns = value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 40);
  return columns.length ? columns : DEFAULT_COLUMNS;
};

const normalizeFormat = (value: unknown): ExportFormat => {
  if (typeof value !== 'string') {
    return 'csv';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'md') return 'markdown';
  if (
    normalized === 'csv' ||
    normalized === 'tsv' ||
    normalized === 'jsonl' ||
    normalized === 'markdown' ||
    normalized === 'xml' ||
    normalized === 'plain' ||
    normalized === 'custom'
  ) {
    return normalized;
  }
  return 'csv';
};

const defaultFileNameForFormat = (format: ExportFormat): string => {
  switch (format) {
    case 'csv':
      return 'documents_report.csv';
    case 'tsv':
      return 'documents_report.tsv';
    case 'jsonl':
      return 'documents_report.jsonl';
    case 'markdown':
      return 'documents_report.md';
    case 'xml':
      return 'documents_report.xml';
    case 'plain':
      return 'documents_report.txt';
    case 'custom':
      return 'documents_report.txt';
    default:
      return 'documents_report.txt';
  }
};

const renderCustomRow = (template: string, entry: Record<string, unknown>): string =>
  template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawPath: string) => {
    const path = rawPath.trim();
    if (!path) {
      return '';
    }
    return toPlainValue(extractByPath(entry, path));
  });

const renderDocument = ({
  format,
  columns,
  entries,
  includeHeader,
  rowTemplate,
  prefix,
  suffix,
}: {
  format: ExportFormat;
  columns: string[];
  entries: Array<Record<string, unknown>>;
  includeHeader: boolean;
  rowTemplate: string | null;
  prefix: string | null;
  suffix: string | null;
}): string => {
  const lines: string[] = [];
  if (prefix) {
    lines.push(prefix);
  }

  if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'csv' ? ',' : '\t';
    if (includeHeader) {
      lines.push(toDelimitedRow(columns, delimiter));
    }
    for (const entry of entries) {
      lines.push(
        toDelimitedRow(
          columns.map(column => extractByPath(entry, column)),
          delimiter
        )
      );
    }
  } else if (format === 'jsonl') {
    for (const entry of entries) {
      const record: Record<string, unknown> = {};
      for (const column of columns) {
        record[column] = extractByPath(entry, column);
      }
      lines.push(JSON.stringify(record));
    }
  } else if (format === 'markdown') {
    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    lines.push(header);
    lines.push(separator);
    for (const entry of entries) {
      lines.push(
        `| ${columns.map(column => markdownEscape(extractByPath(entry, column))).join(' | ')} |`
      );
    }
  } else if (format === 'xml') {
    lines.push('<items>');
    for (const entry of entries) {
      lines.push('  <item>');
      for (const column of columns) {
        const tag = sanitizeXmlTag(column);
        lines.push(`    <${tag}>${escapeXml(extractByPath(entry, column))}</${tag}>`);
      }
      lines.push('  </item>');
    }
    lines.push('</items>');
  } else if (format === 'plain') {
    if (includeHeader) {
      lines.push(columns.join('\t'));
    }
    for (const entry of entries) {
      lines.push(columns.map(column => toPlainValue(extractByPath(entry, column))).join('\t'));
    }
  } else if (format === 'custom') {
    const template = rowTemplate ?? columns.map(column => `{{${column}}}`).join(',');
    for (const entry of entries) {
      lines.push(renderCustomRow(template, entry));
    }
  }

  if (suffix) {
    lines.push(suffix);
  }
  return `${lines.join('\n')}\n`;
};

export const searchExportTextTool: ToolDefinition = {
  name: 'search_export_text',
  description:
    'Export search results directly to a repository text file. Use this for large result sets or structured exports (csv, tsv, jsonl, markdown, xml, plain, custom).',
  skill: { kind: 'local_md', path: '../skills/search_export_text.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional AFTS query. Default: TYPE:"cm:content".',
      },
      format: {
        type: 'string',
        enum: ['csv', 'tsv', 'jsonl', 'markdown', 'md', 'xml', 'plain', 'custom'],
        description: 'Output text format. Default csv.',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field paths to export, e.g. ["id","name","modifiedAt","content.mimeType"].',
      },
      includeHeader: {
        type: 'boolean',
        description: 'Include a header row for csv/tsv/plain formats. Default true.',
      },
      rowTemplate: {
        type: 'string',
        description:
          'For format=custom: one line template with placeholders like {{id}}, {{name}}, {{properties.cm:title}}.',
      },
      prefix: {
        type: 'string',
        description: 'Optional text prepended before generated rows.',
      },
      suffix: {
        type: 'string',
        description: 'Optional text appended after generated rows.',
      },
      nodeId: {
        type: 'string',
        description:
          'Optional existing target file node ID to update instead of creating a new file.',
      },
      parentId: {
        type: 'string',
        description:
          'Optional destination folder node ID. If omitted, the tool resolves and uses /Company Home.',
      },
      fileName: {
        type: 'string',
        description:
          'Optional target filename when creating a new file. Default depends on format.',
      },
      includeFolders: {
        type: 'boolean',
        description: 'If true, include folders. Default false (content/files only).',
      },
      pageSize: {
        type: 'number',
        description: `Page size per search request (1-${MAX_PAGE_SIZE}). Default ${DEFAULT_PAGE_SIZE}.`,
      },
      maxTotalItems: {
        type: 'number',
        description: `Safety cap for exported rows (1-${MAX_MAX_TOTAL_ITEMS}). Default ${DEFAULT_MAX_TOTAL_ITEMS}.`,
      },
      autoRename: {
        type: 'boolean',
        description:
          'If true, Alfresco auto-renames when the filename already exists in the destination folder. Default true.',
      },
      majorVersion: {
        type: 'boolean',
        description: 'If true, store uploaded text content as a major version.',
      },
      comment: {
        type: 'string',
        description: 'Optional version comment when writing text content.',
      },
    },
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const searchApi = new SearchApi(ctx.api);
      const rawQuery = typeof args.query === 'string' ? args.query.trim() : '';
      const aftsQuery = rawQuery || DEFAULT_QUERY;
      const format = normalizeFormat(args.format);
      const columns = normalizeColumns(args.columns);
      const includeHeader = typeof args.includeHeader === 'boolean' ? args.includeHeader : true;
      const rowTemplate = typeof args.rowTemplate === 'string' ? args.rowTemplate : null;
      const prefix = typeof args.prefix === 'string' ? args.prefix : null;
      const suffix = typeof args.suffix === 'string' ? args.suffix : null;
      const includeFolders = Boolean(args.includeFolders);
      const pageSize =
        typeof args.pageSize === 'number' && Number.isFinite(args.pageSize)
          ? Math.max(1, Math.min(Math.floor(args.pageSize), MAX_PAGE_SIZE))
          : DEFAULT_PAGE_SIZE;
      const maxTotalItems =
        typeof args.maxTotalItems === 'number' && Number.isFinite(args.maxTotalItems)
          ? Math.max(1, Math.min(Math.floor(args.maxTotalItems), MAX_MAX_TOTAL_ITEMS))
          : DEFAULT_MAX_TOTAL_ITEMS;
      const autoRename = typeof args.autoRename === 'boolean' ? args.autoRename : true;
      const fileNameRaw = typeof args.fileName === 'string' ? args.fileName.trim() : '';
      const fileName = fileNameRaw || defaultFileNameForFormat(format);
      const targetNodeId =
        typeof args.nodeId === 'string' && args.nodeId.trim().length ? args.nodeId.trim() : null;

      let destinationParentId: string | null =
        typeof args.parentId === 'string' && args.parentId.trim().length
          ? args.parentId.trim()
          : null;
      if (!targetNodeId && !destinationParentId) {
        destinationParentId = await resolveCompanyHomeId(searchApi);
      }
      if (!targetNodeId && !destinationParentId) {
        return { ok: false, error: 'Could not resolve destination folder (Company Home).' };
      }

      const collectedEntries: Array<Record<string, unknown>> = [];
      let currentSkipCount = 0;
      let pagesFetched = 0;
      let exportedRows = 0;
      let repositoryTotal = 0;
      let hasMoreItems = false;
      let hitLimit = false;

      while (true) {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }

        const filterQueries: Array<{ query: string }> = [{ query: aftsQuery }];
        if (!includeFolders) {
          filterQueries.push({ query: 'TYPE:"cm:content"' });
        }

        const requestBody = {
          query: { query: '*', language: 'afts' },
          filterQueries,
          include: ['path'],
          paging: { maxItems: pageSize, skipCount: currentSkipCount },
        };

        const result = await searchApi.search(requestBody as any);
        pagesFetched += 1;

        const entries = (result?.list?.entries ?? [])
          .map((item: any) => item?.entry)
          .filter(Boolean);
        const totalItems = result?.list?.pagination?.totalItems;
        if (typeof totalItems === 'number' && Number.isFinite(totalItems)) {
          repositoryTotal = totalItems;
        }

        for (const entry of entries) {
          if (exportedRows >= maxTotalItems) {
            hitLimit = true;
            break;
          }
          collectedEntries.push(entry as Record<string, unknown>);
          exportedRows += 1;
        }

        const returned = entries.length;
        hasMoreItems = currentSkipCount + returned < repositoryTotal;
        if (hitLimit || returned === 0 || !hasMoreItems) {
          break;
        }
        currentSkipCount += returned;
      }

      const renderedContent = renderDocument({
        format,
        columns,
        entries: collectedEntries,
        includeHeader,
        rowTemplate,
        prefix,
        suffix,
      });

      const writeResult = await writeTextToNode({
        ctx,
        nodeId: targetNodeId,
        parentId: destinationParentId,
        fileName: targetNodeId ? null : fileName,
        content: renderedContent,
        autoRename,
        majorVersion: typeof args.majorVersion === 'boolean' ? args.majorVersion : null,
        comment: typeof args.comment === 'string' ? args.comment : null,
        renameOnCommit: targetNodeId && fileNameRaw ? fileNameRaw : null,
      });
      const finalEntry = writeResult.finalEntry;
      const writeTrace = buildWriteApiTrace({ writeResult });

      return {
        ok: true,
        data: {
          apiTrace: {
            ...writeTrace,
            path: [SEARCH_API_PATH, ...writeTrace.path],
            request: {
              search: {
                query: aftsQuery,
                includeFolders,
                pageSize,
                maxTotalItems,
              },
              write: {
                format,
                columns,
                chars: renderedContent.length,
              },
            },
          },
          created: toNodeSummary(finalEntry),
          export: {
            format,
            columns,
            totalRows: exportedRows,
            repositoryTotal,
            pagesFetched,
            pageSize,
            maxTotalItems,
            hitLimit,
            hasMoreItems,
            contentChars: renderedContent.length,
          },
          destinationParentId: writeResult.destinationParentId,
          destinationNodeId: writeResult.destinationNodeId,
          aftsQuery,
          includeFolders,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
