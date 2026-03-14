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
 * Insight Count Service
 * Single-purpose helper for lightweight Alfresco AFTS count queries.
 * Uses maxItems: 1 and reads only pagination.totalItems.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('insight.count');

/** Search function signature — decoupled from @alfresco/js-api for testability */
export type SearchFn = (request: unknown) => Promise<any>;

/**
 * Build a day-bounded AFTS query and return the totalItems count.
 *
 * Final query: (<filterQuery>) AND <dateField>:[<dayStart> TO <dayEnd>]
 *
 * @param searchFn    Bound search function (e.g. searchApi.search.bind(searchApi))
 * @param filterQuery AFTS predicate without date range
 * @param dateField   Date/datetime property for bucketing (e.g. cm:created)
 * @param dayStart    ISO datetime string for day start
 * @param dayEnd      ISO datetime string for day end
 * @returns           totalItems count
 */
export async function executeCountQuery(
  searchFn: SearchFn,
  filterQuery: string,
  dateField: string,
  dayStart: string,
  dayEnd: string
): Promise<number> {
  const aftsQuery = `(${filterQuery}) AND ${dateField}:["${dayStart}" TO "${dayEnd}"]`;

  const searchRequest = {
    query: {
      query: aftsQuery,
      language: 'afts',
    },
    fields: ['id'],
    paging: {
      maxItems: 1,
      skipCount: 0,
    },
  };

  try {
    const result = await searchFn(searchRequest);
    const totalItems = result.list?.pagination?.totalItems;
    if (totalItems !== undefined && totalItems !== null) {
      return totalItems;
    }

    // Fallback: count from entries if totalItems not provided
    return result.list?.pagination?.count ?? 0;
  } catch (error) {
    log.error({ filterQuery, dateField, dayStart, dayEnd, error }, 'Count query failed');
    throw error;
  }
}

/**
 * Build ISO datetime strings for a day bucket
 * @param bucketDate YYYY-MM-DD string
 * @returns { start, end } ISO datetime strings
 */
export function getDayBounds(bucketDate: string): { start: string; end: string } {
  return {
    start: `${bucketDate}T00:00:00.000Z`,
    end: `${bucketDate}T23:59:59.999Z`,
  };
}
