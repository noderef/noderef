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

import { redactLaunchTokenInUrl } from '../../src/lib/launchToken.js';
import {
  isAllowedWebOrigin,
  isHostAllowed,
  isLoopbackHostname,
  isLoopbackOrigin,
  isNullOrigin,
  isSameOriginAsHost,
  parseHostHeader,
} from '../../src/lib/requestGate.js';

describe('requestGate helpers', () => {
  const prevServeStatic = process.env.SERVE_STATIC;

  afterEach(() => {
    if (prevServeStatic === undefined) {
      delete process.env.SERVE_STATIC;
    } else {
      process.env.SERVE_STATIC = prevServeStatic;
    }
  });

  it('parses loopback Host headers and rejects garbage', () => {
    expect(parseHostHeader('127.0.0.1')).toEqual({ hostname: '127.0.0.1', host: '127.0.0.1' });
    expect(parseHostHeader('127.0.0.1:59001')).toEqual({
      hostname: '127.0.0.1',
      host: '127.0.0.1:59001',
    });
    expect(parseHostHeader('[::1]:5111')?.hostname).toBe('::1');
    expect(parseHostHeader('evil.example')).toEqual({
      hostname: 'evil.example',
      host: 'evil.example',
    });
    expect(parseHostHeader('127.0.0.1:5111\r\nX-Injected: 1')).toBeNull();
    expect(parseHostHeader('')).toBeNull();
    expect(parseHostHeader(undefined)).toBeNull();
  });

  it('treats only loopback hostnames as loopback', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1.evil.example')).toBe(false);
    expect(isLoopbackHostname('evil.example')).toBe(false);
  });

  it('allows only loopback Host headers in desktop mode', () => {
    delete process.env.SERVE_STATIC;
    expect(isHostAllowed('127.0.0.1:5111')).toBe(true);
    expect(isHostAllowed('localhost')).toBe(true);
    expect(isHostAllowed('evil.example')).toBe(false);
    expect(isHostAllowed('evil.example:59001')).toBe(false);
  });

  it('allows public Host headers in Docker/SERVE_STATIC mode', () => {
    process.env.SERVE_STATIC = '1';
    expect(isHostAllowed('noderef.example:5001')).toBe(true);
    expect(isHostAllowed('127.0.0.1:5001')).toBe(true);
  });

  it('rejects Origin: null and foreign origins on desktop', () => {
    delete process.env.SERVE_STATIC;
    expect(isNullOrigin('null')).toBe(true);
    expect(isNullOrigin('NULL')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isLoopbackOrigin('http://localhost:3000')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1.evil.example')).toBe(false);
    expect(isAllowedWebOrigin('null', '127.0.0.1:5111')).toBe(false);
    expect(isAllowedWebOrigin('https://evil.example', '127.0.0.1:5111')).toBe(false);
    expect(isAllowedWebOrigin('http://127.0.0.1:3000', '127.0.0.1:5111')).toBe(true);
  });

  it('requires Docker origins to match the Host header', () => {
    process.env.SERVE_STATIC = '1';
    expect(isSameOriginAsHost('http://noderef.example:5001', 'noderef.example:5001')).toBe(true);
    expect(isAllowedWebOrigin('http://noderef.example:5001', 'noderef.example:5001')).toBe(true);
    expect(isAllowedWebOrigin('https://evil.example', 'noderef.example:5001')).toBe(false);
    expect(isAllowedWebOrigin('null', 'noderef.example:5001')).toBe(false);
  });

  it('redacts the launch token query parameter in URLs', () => {
    expect(redactLaunchTokenInUrl('/rpc-stream?method=x&nr_token=secret-value&n=1')).toBe(
      '/rpc-stream?method=x&nr_token=***REDACTED***&n=1'
    );
  });
});
