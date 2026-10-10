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

import { afterEach, describe, expect, it } from 'vitest';

import {
  appendLaunchTokenToUrl,
  headersWithLaunchToken,
  isBackendRequestUrl,
  isLaunchTokenShape,
  LAUNCH_TOKEN_HEADER,
  LAUNCH_TOKEN_QUERY,
  resetLaunchTokenCacheForTests,
} from './launchToken';

describe('launchToken helpers', () => {
  afterEach(() => {
    resetLaunchTokenCacheForTests();
  });

  it('appends nr_token without dropping existing query params', () => {
    const url = appendLaunchTokenToUrl(
      'http://127.0.0.1:59001/rpc/agent/runs/9/stream?afterId=3',
      'abc_token_value_aaaaaaaaaaaaaaaaaaaa'
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('afterId')).toBe('3');
    expect(parsed.searchParams.get(LAUNCH_TOKEN_QUERY)).toBe(
      'abc_token_value_aaaaaaaaaaaaaaaaaaaa'
    );
  });

  it('does not modify URLs when no token is available', () => {
    const url = 'http://127.0.0.1:5111/rpc-stream?method=nodes.getContent';
    expect(appendLaunchTokenToUrl(url, null)).toBe(url);
  });

  it('attaches the launch token header only for the local backend', () => {
    const token = 'abc_token_value_aaaaaaaaaaaaaaaaaaaa';
    const backend = 'http://127.0.0.1:5111';
    const local = headersWithLaunchToken(undefined, token, `${backend}/rpc`, backend);
    expect(local.get(LAUNCH_TOKEN_HEADER)).toBe(token);

    const remote = headersWithLaunchToken(
      undefined,
      token,
      'https://github.com/noderef/noderef/releases/download/v1/file.neu',
      backend
    );
    expect(remote.get(LAUNCH_TOKEN_HEADER)).toBeNull();
  });

  it('recognizes backend URLs and token shape', () => {
    expect(isBackendRequestUrl('http://127.0.0.1:5111/rpc', 'http://127.0.0.1:5111')).toBe(true);
    expect(isBackendRequestUrl('https://example.com/rpc', 'http://127.0.0.1:5111')).toBe(false);
    expect(isLaunchTokenShape('short')).toBe(false);
    expect(isLaunchTokenShape('a'.repeat(32))).toBe(true);
  });
});
