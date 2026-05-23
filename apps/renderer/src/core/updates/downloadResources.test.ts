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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadResourcesWithProgress } from './downloadResources';

function makeStreamedResponse(chunks: Uint8Array[], contentLength?: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: contentLength ? { 'Content-Length': contentLength } : undefined,
  });
}

describe('downloadResourcesWithProgress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports percent progress when Content-Length is present', async () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeStreamedResponse([body.slice(0, 2), body.slice(2)], '4'))
    );

    const progress: number[] = [];
    const buffer = await downloadResourcesWithProgress('https://example.com/file.neu', p => {
      if (p.percent !== null) {
        progress.push(p.percent);
      }
    });

    expect(new Uint8Array(buffer)).toEqual(body);
    expect(progress[progress.length - 1]).toBe(100);
    expect(progress.some(value => value > 0 && value < 100)).toBe(true);
  });

  it('reports indeterminate progress when Content-Length is missing', async () => {
    const body = new Uint8Array([9, 8, 7]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeStreamedResponse([body]))
    );

    const percents: Array<number | null> = [];
    await downloadResourcesWithProgress('https://example.com/file.neu', p => {
      percents.push(p.percent);
    });

    expect(percents.some(value => value === null)).toBe(true);
    expect(percents[percents.length - 1]).toBe(100);
  });
});
