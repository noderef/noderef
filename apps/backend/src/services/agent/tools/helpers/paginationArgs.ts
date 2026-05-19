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

export interface PaginationBounds {
  /** Default when maxItems omitted */
  defaultMax: number;
  /** Hard cap for maxItems */
  maxCap: number;
}

/**
 * Parse skipCount / maxItems from tool args (Alfresco paging conventions).
 */
export function parseSkipMax(
  args: Record<string, unknown>,
  bounds: PaginationBounds
): { skipCount: number; maxItems: number } {
  const maxItemsRaw =
    typeof args.maxItems === 'number' && Number.isFinite(args.maxItems)
      ? Math.floor(args.maxItems)
      : bounds.defaultMax;
  const maxItems = Math.max(1, Math.min(maxItemsRaw, bounds.maxCap));
  const skipCount =
    typeof args.skipCount === 'number' && Number.isFinite(args.skipCount)
      ? Math.max(0, Math.floor(args.skipCount))
      : 0;
  return { skipCount, maxItems };
}
