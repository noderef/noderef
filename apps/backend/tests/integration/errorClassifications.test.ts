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

import { describe, expect, it } from 'vitest';
import {
  isExpectedAuthFailure,
  isExpectedUpstreamHttpFailure,
  isTransientNetworkFailure,
} from '../../src/lib/errorClassifications.js';

describe('errorClassifications', () => {
  it('treats transient network issues as non-fatal', () => {
    expect(isTransientNetworkFailure({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isTransientNetworkFailure({ message: 'connect ECONNREFUSED 127.0.0.1:8080' })).toBe(
      true
    );
  });

  it('treats expected auth errors as non-fatal', () => {
    expect(isExpectedAuthFailure({ status: 401 })).toBe(true);
    expect(isExpectedAuthFailure({ message: 'Authentication failed for user admin' })).toBe(true);
    expect(
      isExpectedAuthFailure({
        response: {
          body: {
            error: {
              statusCode: 403,
              errorKey: 'Login failed',
              briefSummary: '06100023 Login failed',
            },
          },
        },
      })
    ).toBe(true);
    expect(
      isExpectedAuthFailure({
        message:
          '{"error":{"statusCode":401,"errorKey":"Login failed","briefSummary":"06100023 Login failed"}}',
      })
    ).toBe(true);
  });

  it('treats upstream HTTP failures as non-fatal', () => {
    expect(isExpectedUpstreamHttpFailure({ status: 404 })).toBe(true);
    expect(
      isExpectedUpstreamHttpFailure({
        response: {
          body: {
            error: {
              statusCode: 500,
              briefSummary: '06200001 Something went wrong',
            },
          },
        },
      })
    ).toBe(true);
    expect(
      isExpectedUpstreamHttpFailure({
        message: '{"error":{"statusCode":"502","briefSummary":"Bad gateway"}}',
      })
    ).toBe(true);
    expect(
      isExpectedUpstreamHttpFailure({
        message:
          '<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>',
      })
    ).toBe(true);
    expect(isExpectedUpstreamHttpFailure({ message: 'Unexpected undefined access' })).toBe(false);
  });
});
