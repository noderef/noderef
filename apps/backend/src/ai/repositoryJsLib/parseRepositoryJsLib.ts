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

import { log } from '../../lib/logger.js';

export interface ParseRepositoryJsLibInput {
  fileName: string;
  content: string;
  nodeId: string;
  modifiedAt?: string;
}

export interface ParsedRepositoryJsLib {
  name: string;
  description: string;
  tags: string[];
  text: string;
  nodeId: string;
  modifiedAt?: string;
  sourceName: string;
}

const JS_FILE_NAME = /^[a-zA-Z][a-zA-Z0-9._-]*\.js$/;
const SAFE_BASE_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MAX_REPOSITORY_LIB_FILE_CHARS = 100_000;
export const MAX_REPOSITORY_LIBS_TOTAL_CHARS = 500_000;

const TOP_JSDOC_RE = /^\s*\/\*\*([\s\S]*?)\*\//;

export function parseRepositoryJsLib(
  input: ParseRepositoryJsLibInput
): ParsedRepositoryJsLib | null {
  const { fileName, content, nodeId, modifiedAt } = input;

  if (!JS_FILE_NAME.test(fileName)) {
    log.debug({ fileName, nodeId }, 'Skipping repository JS lib: invalid file name');
    return null;
  }

  const baseName = fileName.replace(/\.js$/i, '');
  if (!SAFE_BASE_NAME.test(baseName)) {
    log.debug({ fileName, nodeId }, 'Skipping repository JS lib: unsafe base name');
    return null;
  }

  if (content.length > MAX_REPOSITORY_LIB_FILE_CHARS) {
    log.warn(
      { fileName, nodeId, size: content.length },
      'Skipping repository JS lib: file too large'
    );
    return null;
  }

  const docMatch = content.match(TOP_JSDOC_RE);
  if (!docMatch) {
    log.debug({ fileName, nodeId }, 'Skipping repository JS lib: missing top-level JSDoc');
    return null;
  }

  const docTags = parseJsDocTags(docMatch[1]);
  const description = docTags.description;
  if (!description) {
    log.debug({ fileName, nodeId }, 'Skipping repository JS lib: missing @description');
    return null;
  }

  const tags = parseTagsList(docTags.tags);
  const remainder = content.slice(docMatch[0].length);
  const text = compactLibText(remainder);

  return {
    name: `custom_${baseName}`,
    description,
    tags,
    text,
    nodeId,
    modifiedAt,
    sourceName: fileName,
  };
}

function parseJsDocTags(docBody: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const line of docBody.split('\n')) {
    const match = line.match(/^\s*\*?\s*@(\w+)\s+(.*)$/);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    tags[match[1].toLowerCase()] = match[2].trim();
  }
  return tags;
}

function parseTagsList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function compactLibText(raw: string): string {
  return raw
    .replace(/^\s+/, '')
    .replace(/\s+$/, '')
    .replace(/\n{3,}/g, '\n\n');
}
