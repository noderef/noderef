/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ToolSkillRef } from './types.js';

const TOOLS_DIR_URL = new URL('./', pathToFileURL(__filename));

const toBasePath = (baseUrl: URL | string): string => {
  if (baseUrl instanceof URL) {
    const fullPath = fileURLToPath(baseUrl);
    return fullPath.endsWith(path.sep) ? fullPath : path.dirname(fullPath);
  }

  if (baseUrl.startsWith('file://')) {
    const fullPath = fileURLToPath(new URL(baseUrl));
    return fullPath.endsWith(path.sep) ? fullPath : path.dirname(fullPath);
  }

  return path.dirname(baseUrl);
};

export function resolveToolSkillPath(ref: ToolSkillRef, baseUrl: URL | string): string {
  if (ref.kind !== 'local_md') {
    throw new Error(`Unsupported tool skill ref kind: ${String((ref as { kind?: unknown }).kind)}`);
  }
  if (!ref.path || typeof ref.path !== 'string') {
    throw new Error('Tool skill path must be a non-empty string');
  }

  if (path.isAbsolute(ref.path)) {
    return path.normalize(ref.path);
  }

  const basePath = toBasePath(baseUrl);
  return path.normalize(path.resolve(basePath, ref.path));
}

export async function loadToolSkill(ref: ToolSkillRef): Promise<string> {
  const resolvedPath = resolveToolSkillPath(ref, TOOLS_DIR_URL);
  return readFile(resolvedPath, 'utf8');
}
