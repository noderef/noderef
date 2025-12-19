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

/**
 * Time divisions for relative time formatting
 */
const RELATIVE_TIME_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

/**
 * Format a date as relative time (e.g., "2 hours ago", "in 3 days")
 * Uses Intl.RelativeTimeFormat for proper internationalization
 *
 * @param date The date to format (Date object or ISO string)
 * @param locale Optional locale string (defaults to user's locale)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(date: Date | string, locale?: string): string {
  const targetDate = date instanceof Date ? date : new Date(date);

  // Duration in seconds (negative if in the past)
  let duration = (targetDate.getTime() - Date.now()) / 1000;

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  // Fallback (should not happen with POSITIVE_INFINITY)
  return formatter.format(Math.round(duration), 'year');
}
