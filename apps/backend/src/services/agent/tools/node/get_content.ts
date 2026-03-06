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

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodeContentPath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { normalizeNodePath } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  txt: 'text',
  text: 'text',
  log: 'text',
  csv: 'csv',
  tsv: 'tsv',
  ftl: 'freemarker',
  json: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  sh: 'bash',
  properties: 'properties',
  ini: 'ini',
};

const MIME_TO_LANGUAGE: Record<string, string> = {
  'text/plain': 'text',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/markdown': 'markdown',
  'text/html': 'html',
  'text/xml': 'xml',
  'text/javascript': 'javascript',
  'text/x-freemarker': 'freemarker',
  'application/json': 'json',
  'application/xml': 'xml',
  'application/javascript': 'javascript',
  'application/x-javascript': 'javascript',
  'application/ecmascript': 'javascript',
};

const isTextLikeMime = (mimeType: string | null): boolean => {
  if (!mimeType) {
    return false;
  }
  const normalized = mimeType.toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('text/')) {
    return true;
  }

  if (MIME_TO_LANGUAGE[normalized]) {
    return true;
  }

  return (
    normalized.startsWith('application/json') ||
    normalized.startsWith('application/javascript') ||
    normalized.startsWith('application/x-javascript') ||
    normalized.startsWith('application/ecmascript') ||
    normalized.startsWith('application/xml')
  );
};

const detectLanguage = (fileName?: string | null, mimeType?: string | null): string => {
  const extension = fileName?.split('.').pop()?.toLowerCase();
  if (extension && EXTENSION_TO_LANGUAGE[extension]) {
    return EXTENSION_TO_LANGUAGE[extension];
  }

  const normalizedMime = mimeType?.toLowerCase().trim();
  if (normalizedMime && MIME_TO_LANGUAGE[normalizedMime]) {
    return MIME_TO_LANGUAGE[normalizedMime];
  }

  if (normalizedMime?.startsWith('text/')) {
    return 'text';
  }

  return 'text';
};

const isTextLikeFile = (fileName?: string | null, mimeType?: string | null): boolean => {
  if (isTextLikeMime(mimeType ?? null)) {
    return true;
  }
  const extension = fileName?.split('.').pop()?.toLowerCase();
  return Boolean(extension && EXTENSION_TO_LANGUAGE[extension]);
};

const toBuffer = async (value: unknown): Promise<Buffer> => {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    return Buffer.from(value, 'utf8');
  }
  if (value && typeof Blob !== 'undefined' && value instanceof Blob) {
    const arr = await value.arrayBuffer();
    return Buffer.from(arr);
  }
  return Buffer.from(String(value ?? ''), 'utf8');
};

const looksBinary = (buffer: Buffer): boolean => {
  if (buffer.length === 0) {
    return false;
  }

  let suspicious = 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
    const isTab = byte === 9;
    const isLf = byte === 10;
    const isCr = byte === 13;
    const isPrintable = byte >= 32 && byte <= 126;
    if (!isTab && !isLf && !isCr && !isPrintable) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length > 0.2;
};

const buildFence = (text: string): string => {
  const matches = text.match(/`+/g);
  const maxTicks = matches?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  return '`'.repeat(Math.max(3, maxTicks + 1));
};

export const nodeGetContentTool: ToolDefinition = {
  name: 'node_get_content',
  description:
    'Read file content by node ID and return text when the file is text-based. Supports chunked reads with startChar/maxChars for large files.',
  skill: { kind: 'local_md', path: '../skills/node_get_content.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'File node ID (UUID)' },
      maxChars: {
        type: 'number',
        description:
          'Maximum number of characters to return from file content (default 20000, max 100000)',
      },
      startChar: {
        type: 'number',
        description:
          'Optional character offset to start reading from (default 0). Use with nextStartChar to paginate large text files.',
      },
      forceText: {
        type: 'boolean',
        description:
          'If true, attempt UTF-8 decoding even when mimetype/bytes suggest binary content.',
      },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: false,

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }

      const maxChars =
        typeof args.maxChars === 'number' && Number.isFinite(args.maxChars)
          ? Math.max(200, Math.min(Math.floor(args.maxChars), 100_000))
          : 20_000;
      const startChar =
        typeof args.startChar === 'number' && Number.isFinite(args.startChar)
          ? Math.max(0, Math.floor(args.startChar))
          : 0;
      const forceText = Boolean(args.forceText);

      const nodesApi = new NodesApi(ctx.api);
      const metadataQuery = {
        fields: ['id', 'name', 'isFile', 'isFolder', 'nodeType', 'path', 'content', 'modifiedAt'],
        include: ['path'],
      };
      const metadataResult = await nodesApi.getNode(nodeId, metadataQuery);
      const entry = (metadataResult as any)?.entry ?? metadataResult;

      const fileName = typeof entry?.name === 'string' ? entry.name : null;
      const mimeType =
        typeof entry?.content?.mimeType === 'string' ? String(entry.content.mimeType) : null;
      const isTextBased = isTextLikeFile(fileName, mimeType);
      const detectedLanguage = detectLanguage(fileName, mimeType);

      if (entry?.isFolder) {
        return {
          ok: false,
          error: `Node ${nodeId} is a folder. Use node_list_children to inspect folder contents.`,
        };
      }

      const rawContent = await nodesApi.getNodeContent(nodeId);
      const contentBuffer = await toBuffer(rawContent);
      const binaryByBytes = looksBinary(contentBuffer);
      const shouldDecode = forceText || (isTextBased && !binaryByBytes);

      if (!shouldDecode) {
        return {
          ok: true,
          data: {
            apiTrace: {
              method: 'GET',
              path: getAlfrescoNodeContentPath(nodeId),
              request: { query: { attachment: false } },
              responseBody: {
                skippedTextExtraction: true,
                reason: 'Content is not text-based',
                contentBytes: contentBuffer.length,
                mimeType,
              },
            },
            node: {
              id: entry?.id,
              name: fileName,
              path: normalizeNodePath(entry?.path?.name),
              nodeType: entry?.nodeType,
              mimeType,
              isFile: Boolean(entry?.isFile),
              isFolder: Boolean(entry?.isFolder),
            },
            isTextBased: false,
            contentLanguage: detectedLanguage,
            contentBytes: contentBuffer.length,
            content: null,
            markdownCodeBlock: null,
            message:
              'File content appears to be binary or non-text. Ask for metadata or download instead.',
          },
        };
      }

      const decodedText = new TextDecoder('utf-8', { fatal: false }).decode(contentBuffer);
      const totalChars = decodedText.length;
      const safeStartChar = Math.min(startChar, totalChars);
      const endCharExclusive = Math.min(safeStartChar + maxChars, totalChars);
      const text = decodedText.slice(safeStartChar, endCharExclusive);
      const hasMoreContent = endCharExclusive < totalChars;
      const nextStartChar = hasMoreContent ? endCharExclusive : null;
      const truncated = safeStartChar > 0 || hasMoreContent;

      const fence = buildFence(text);
      const markdownCodeBlock = `${fence}${detectedLanguage}\n${text}\n${fence}`;

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'GET',
            path: getAlfrescoNodeContentPath(nodeId),
            request: { query: { attachment: false } },
            responseBody: {
              extractedText: true,
              contentBytes: contentBuffer.length,
              totalChars,
              startChar: safeStartChar,
              endCharExclusive,
              returnedChars: text.length,
              truncated,
              hasMoreContent,
              nextStartChar,
              mimeType,
              detectedLanguage,
            },
          },
          node: {
            id: entry?.id,
            name: fileName,
            path: normalizeNodePath(entry?.path?.name),
            nodeType: entry?.nodeType,
            mimeType,
            isFile: Boolean(entry?.isFile),
            isFolder: Boolean(entry?.isFolder),
          },
          isTextBased: true,
          contentLanguage: detectedLanguage,
          contentBytes: contentBuffer.length,
          totalChars,
          startChar: safeStartChar,
          endCharExclusive,
          returnedChars: text.length,
          truncated,
          hasMoreContent,
          nextStartChar,
          content: text,
          markdownCodeBlock,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
