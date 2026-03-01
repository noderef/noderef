/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const buildNodeMetadataQuery = (): { fields: string[]; include: string[] } => ({
  fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'path', 'content', 'properties'],
  include: ['path', 'properties'],
});

export const normalizeNodePath = (pathName: string | undefined): string | null => {
  const trimmed = pathName?.trim();
  return trimmed?.length ? trimmed : null;
};

export const toNodeSummary = (
  entry: Record<string, unknown> | null | undefined
): NodeSummary => {
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
