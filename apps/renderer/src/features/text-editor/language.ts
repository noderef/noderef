/**
 * Copyright 2025 NodeRef
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

export const LANGUAGE_OPTIONS = [
  { value: 'plaintext', label: 'Plain text / CSV / text/plain' },
  { value: 'json', label: 'JSON' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
] as const;

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  txt: 'plaintext',
  text: 'plaintext',
  csv: 'plaintext',
  log: 'plaintext',
  ftl: 'html', // FTL (FreeMarker Template Language) files use HTML syntax
  json: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  css: 'css',
  scss: 'css',
  less: 'css',
  sql: 'sql',
};

const MIME_LANGUAGE_MAP: Record<string, string> = {
  'application/json': 'json',
  'application/javascript': 'javascript',
  'application/x-javascript': 'javascript',
  'application/ecmascript': 'javascript',
  'text/javascript': 'javascript',
  'text/x-javascript': 'javascript',
  'text/ecmascript': 'javascript',
  'text/typescript': 'typescript',
  'text/plain': 'plaintext',
  'text/csv': 'plaintext',
  'text/html': 'html',
  'text/xml': 'xml',
  'application/xml': 'xml',
  'text/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'text/markdown': 'markdown',
  'text/css': 'css',
};

export const TEXT_FILE_ACCEPT = [
  'text/*',
  '.txt',
  '.csv',
  '.ftl',
  '.json',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.md',
  '.markdown',
  '.css',
  '.scss',
  '.less',
  '.sql',
].join(',');

export function detectLanguageFromMetadata(
  fileName?: string | null,
  mimeType?: string | null
): string {
  // First, check file extension for known extensions (prioritize extension over generic mimetypes)
  const extension = fileName?.split('.').pop()?.toLowerCase();
  if (extension && EXTENSION_LANGUAGE_MAP[extension]) {
    return EXTENSION_LANGUAGE_MAP[extension];
  }

  // Then check mimetype, but only if it's a specific mimetype (not generic text/plain)
  const normalizedMime = mimeType?.toLowerCase();
  if (normalizedMime && MIME_LANGUAGE_MAP[normalizedMime]) {
    // Only use mimetype if it's not a generic text/plain (which would override extension-based detection)
    if (normalizedMime !== 'text/plain') {
      return MIME_LANGUAGE_MAP[normalizedMime];
    }
  }

  return 'plaintext';
}

export function isTextLikeFile(fileName?: string | null, mimeType?: string | null): boolean {
  // Prioritize mimeType over filename - mimeType is authoritative
  const normalizedMime = mimeType?.toLowerCase();

  // Check mimeType first - if it exists and indicates text, trust it
  if (normalizedMime) {
    // Any mimeType starting with 'text/' is text
    if (normalizedMime.startsWith('text/')) {
      return true;
    }
    // Check if it's a known text mimeType
    if (MIME_LANGUAGE_MAP[normalizedMime]) {
      return true;
    }
    // Common text-like application mimeTypes
    if (
      normalizedMime.startsWith('application/json') ||
      normalizedMime.startsWith('application/javascript') ||
      normalizedMime.startsWith('application/x-javascript') ||
      normalizedMime.startsWith('application/ecmascript') ||
      normalizedMime.startsWith('application/xml')
    ) {
      return true;
    }
  }

  // Fallback to filename extension only if mimeType is not available
  if (!normalizedMime && fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension && (EXTENSION_LANGUAGE_MAP[extension] || extension === 'log')) {
      return true;
    }
  }

  return false;
}
