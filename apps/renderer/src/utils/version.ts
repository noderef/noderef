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
 * Lightweight helpers for semantic-ish version comparison.
 * Handles versions like v1.2.3, 1.2.3-beta, etc. by stripping prefixes and
 * comparing numeric segments.
 */

/**
 * Remove common prefixes (like "v") and whitespace.
 */
export function normalizeVersion(input: string | undefined | null): string {
  if (!input) return '0.0.0';
  return String(input).trim().replace(/^v/i, '');
}

/**
 * Compare two versions.
 * Returns:
 *  1 if a > b
 *  -1 if a < b
 *  0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a).split(/[.-]/);
  const bParts = normalizeVersion(b).split(/[.-]/);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const aNum = parseInt(aParts[i] ?? '0', 10);
    const bNum = parseInt(bParts[i] ?? '0', 10);

    if (Number.isNaN(aNum) && Number.isNaN(bNum)) continue;
    if (Number.isNaN(aNum)) return -1;
    if (Number.isNaN(bNum)) return 1;

    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }

  return 0;
}

/**
 * Convenience helper for "is newer than".
 */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
