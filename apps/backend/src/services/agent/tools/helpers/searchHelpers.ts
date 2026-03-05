/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

export const SEARCH_API_PATH = '/alfresco/api/-default-/public/search/versions/1/search';

export const extractByPath = (source: unknown, path: string): unknown => {
  if (!path) {
    return undefined;
  }

  const segments = path.split('.').filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};
