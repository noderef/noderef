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

import { describe, expect, it, vi } from 'vitest';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    warn: warnMock,
  })),
}));

import {
  EMPTY_CLASS_NAMES,
  EMPTY_SEARCH_DICTIONARY,
  EMPTY_TERN_DEFINITIONS,
  withOptionalAlfrescoResponse,
} from '../../src/rpc/alfresco/fallbacks.js';

describe('alfresco fallbacks helpers', () => {
  it('returns the fallback payload when the optional request fails', async () => {
    await expect(
      withOptionalAlfrescoResponse(
        'Optional search dictionary lookup failed; returning empty response',
        EMPTY_SEARCH_DICTIONARY,
        async () => {
          throw Object.assign(new Error('<html><title>404 Not Found</title></html>'), {
            status: 404,
          });
        }
      )
    ).resolves.toEqual(EMPTY_SEARCH_DICTIONARY);

    await expect(
      withOptionalAlfrescoResponse(
        'Optional Tern definition lookup failed; returning empty response',
        EMPTY_TERN_DEFINITIONS,
        async () => {
          throw Object.assign(new Error('<html><title>500 Internal Server Error</title></html>'), {
            status: 500,
          });
        }
      )
    ).resolves.toEqual(EMPTY_TERN_DEFINITIONS);
  });

  it('returns the underlying result when the request succeeds', async () => {
    const task = vi.fn(async () => EMPTY_CLASS_NAMES);

    await expect(
      withOptionalAlfrescoResponse(
        'Optional class-prefix lookup failed; returning empty response',
        EMPTY_CLASS_NAMES,
        task
      )
    ).resolves.toEqual(EMPTY_CLASS_NAMES);

    expect(task).toHaveBeenCalledOnce();
  });
});
