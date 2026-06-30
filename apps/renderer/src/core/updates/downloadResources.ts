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

export interface DownloadProgress {
  /** 0–100 when Content-Length is known; null for indeterminate progress */
  percent: number | null;
  loaded: number;
  total: number | null;
  /**
   * Current step in the update pipeline. `downloading` while bytes are arriving,
   * `writing` while the buffer is being persisted to disk. Defaults to `downloading`.
   */
  phase?: 'downloading' | 'writing';
}

/**
 * Percentage of bytes downloaded, or `null` when the total size is unknown.
 */
export function computeDownloadPercent(loaded: number, total: number | null): number | null {
  if (!total || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return Math.min(100, Math.round((loaded / total) * 100));
}

export async function downloadResourcesWithProgress(
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.({
      percent: 100,
      loaded: buffer.byteLength,
      total: buffer.byteLength,
    });
    return buffer;
  }

  const totalHeader = response.headers.get('Content-Length');
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : null;
  const hasTotal = typeof total === 'number' && Number.isFinite(total) && total > 0;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({
      percent: computeDownloadPercent(loaded, hasTotal ? total : null),
      loaded,
      total: hasTotal ? total : null,
    });
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  onProgress?.({
    percent: 100,
    loaded,
    total: hasTotal ? total : loaded,
  });

  return merged.buffer;
}
