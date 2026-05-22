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

import { isRecord } from './nodeResultHelpers.js';

/** Normalized slice of an Alfresco `...Paging` / `list` JSON envelope. */
export type AlfrescoPagedListSlice = {
  entries: unknown[];
  pagination: {
    totalCount: number;
    skipCount: number;
    maxItems: number;
    hasMoreItems: boolean;
  };
};

/**
 * Parse `payload.list.entries` and `payload.list.pagination` from a typical
 * Alfresco core REST list response.
 */
export function sliceAlfrescoPagedList(
  payload: unknown,
  skipCount: number,
  maxItems: number
): AlfrescoPagedListSlice {
  const list = isRecord((payload as { list?: unknown })?.list)
    ? ((payload as { list: Record<string, unknown> }).list as Record<string, unknown>)
    : {};
  const pagination = isRecord(list.pagination) ? list.pagination : {};
  const entries = Array.isArray(list.entries) ? list.entries : [];
  const totalCount =
    typeof pagination.totalItems === 'number' && Number.isFinite(pagination.totalItems)
      ? pagination.totalItems
      : entries.length;
  const hasMoreItems = Boolean(pagination.hasMoreItems);
  return {
    entries,
    pagination: { totalCount, skipCount, maxItems, hasMoreItems },
  };
}
