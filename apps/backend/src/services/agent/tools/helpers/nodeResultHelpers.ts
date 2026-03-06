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

export interface NodeSummary {
  id: unknown;
  name: unknown;
  nodeType: unknown;
  isFolder: unknown;
  isFile: unknown;
  path: string | null;
  mimeType: unknown;
  properties: unknown;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const buildNodeMetadataQuery = (): { fields: string[]; include: string[] } => ({
  fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
  include: ['path', 'properties'],
});

export const normalizeNodePath = (pathName: string | undefined): string | null => {
  const trimmed = pathName?.trim();
  return trimmed?.length ? trimmed : null;
};

export const toNodeSummary = (entry: Record<string, unknown> | null | undefined): NodeSummary => {
  const pathValue = isRecord(entry?.path) ? entry.path.name : undefined;
  const mimeValue = isRecord(entry?.content) ? entry.content.mimeType : null;

  return {
    id: entry?.id,
    name: entry?.name,
    nodeType: entry?.nodeType,
    isFolder: entry?.isFolder,
    isFile: entry?.isFile,
    path: normalizeNodePath(typeof pathValue === 'string' ? pathValue : undefined),
    mimeType: mimeValue ?? null,
    properties: entry?.properties ?? null,
  };
};
