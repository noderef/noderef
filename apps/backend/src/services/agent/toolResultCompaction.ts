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

/**
 * Tool-result compaction helpers — shrink large tool output payloads
 * before feeding them back to the model as context.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_TOOL_RESULT_JSON_CHARS_FOR_MODEL = 60_000;
export const MAX_API_TRACE_ENTRIES_PREVIEW = 10;
export const MAX_API_TRACE_RESPONSE_CHARS_FOR_MODEL = 4_000;
export const MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL = 40;
export const MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL = 80;
export const MAX_SEARCH_NAMES_FOR_MODEL = 120;

// ── Functions ────────────────────────────────────────────────────────────────

export const compactApiTraceResponseBodyForModel = (body: unknown): unknown => {
  if (isRecord(body) && isRecord(body.list)) {
    const list = body.list as Record<string, unknown>;
    const entries = Array.isArray(list.entries) ? list.entries : [];
    const entriesPreview = entries.slice(0, MAX_API_TRACE_ENTRIES_PREVIEW).map(item => {
      if (isRecord(item) && isRecord(item.entry)) {
        const e = item.entry as Record<string, unknown>;
        return {
          id: e.id ?? null,
          name: e.name ?? null,
          nodeType: e.nodeType ?? null,
          isFolder: e.isFolder ?? null,
          isFile: e.isFile ?? null,
        };
      }
      return item;
    });

    return {
      list: {
        pagination: list.pagination ?? null,
        returned: entries.length,
        entriesPreview,
      },
    };
  }

  try {
    const serialized = JSON.stringify(body);
    if (serialized.length <= MAX_API_TRACE_RESPONSE_CHARS_FOR_MODEL) {
      return body;
    }
    return {
      omitted: true,
      reason: 'responseBody too large for model context',
      originalSizeChars: serialized.length,
    };
  } catch {
    return {
      omitted: true,
      reason: 'responseBody could not be serialized for model context',
    };
  }
};

const compactSearchSampleEntryForModel = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return value;
  }

  return {
    id: value.id ?? null,
    name: value.name ?? null,
    nodeType: value.nodeType ?? null,
    isFolder: value.isFolder ?? null,
    isFile: value.isFile ?? null,
    path: value.path ?? null,
    mimeType: value.mimeType ?? null,
    modifiedAt: value.modifiedAt ?? null,
  };
};

export const compactToolDataForModel = (data: Record<string, unknown>): Record<string, unknown> => {
  let cloned: Record<string, unknown>;
  try {
    cloned = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return data;
  }

  if (
    isRecord(cloned.apiTrace) &&
    Object.prototype.hasOwnProperty.call(cloned.apiTrace, 'responseBody')
  ) {
    cloned.apiTrace.responseBody = compactApiTraceResponseBodyForModel(
      cloned.apiTrace.responseBody
    );
  }
  if (
    isRecord(cloned.alfrescoSearchApi) &&
    Object.prototype.hasOwnProperty.call(cloned.alfrescoSearchApi, 'responseBody')
  ) {
    cloned.alfrescoSearchApi.responseBody = compactApiTraceResponseBodyForModel(
      cloned.alfrescoSearchApi.responseBody
    );
  }

  if (Array.isArray(cloned.sample) && cloned.sample.length > MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL) {
    const originalLength = cloned.sample.length;
    cloned.sample = cloned.sample
      .slice(0, MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL)
      .map(compactSearchSampleEntryForModel);
    cloned.sampleTruncated = originalLength - MAX_SEARCH_SAMPLE_ITEMS_FOR_MODEL;
  } else if (Array.isArray(cloned.sample)) {
    cloned.sample = cloned.sample.map(compactSearchSampleEntryForModel);
  }

  if (
    Array.isArray(cloned.projectedItems) &&
    cloned.projectedItems.length > MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL
  ) {
    const originalLength = cloned.projectedItems.length;
    cloned.projectedItems = cloned.projectedItems.slice(0, MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL);
    cloned.projectedItemsTruncated = originalLength - MAX_SEARCH_PROJECTED_ITEMS_FOR_MODEL;
  }

  if (
    Array.isArray(cloned.verifiedNames) &&
    cloned.verifiedNames.length > MAX_SEARCH_NAMES_FOR_MODEL
  ) {
    const originalLength = cloned.verifiedNames.length;
    cloned.verifiedNames = cloned.verifiedNames.slice(0, MAX_SEARCH_NAMES_FOR_MODEL);
    cloned.verifiedNamesTruncated = originalLength - MAX_SEARCH_NAMES_FOR_MODEL;
  }

  if (
    Array.isArray(cloned.uniqueVerifiedNames) &&
    cloned.uniqueVerifiedNames.length > MAX_SEARCH_NAMES_FOR_MODEL
  ) {
    const originalLength = cloned.uniqueVerifiedNames.length;
    cloned.uniqueVerifiedNames = cloned.uniqueVerifiedNames.slice(0, MAX_SEARCH_NAMES_FOR_MODEL);
    cloned.uniqueVerifiedNamesTruncated = originalLength - MAX_SEARCH_NAMES_FOR_MODEL;
  }

  return cloned;
};
