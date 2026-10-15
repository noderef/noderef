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
import { idleGatewayStatus } from './idleGatewayStatus';

describe('idleGatewayStatus', () => {
  it('treats a saved URL and key as configured before a connection test', () => {
    expect(
      idleGatewayStatus({
        enabled: true,
        endpointUrl: 'http://localhost:3100/mcp',
        hasStoredKey: true,
        apiKey: '',
        clearApiKey: false,
      })
    ).toBe('configured');
  });

  it('stays not configured without a URL or key', () => {
    expect(
      idleGatewayStatus({
        enabled: true,
        endpointUrl: '',
        hasStoredKey: false,
        apiKey: '',
        clearApiKey: false,
      })
    ).toBe('not_configured');
  });

  it('reports disabled when the gateway is turned off', () => {
    expect(
      idleGatewayStatus({
        enabled: false,
        endpointUrl: 'http://localhost:3100/mcp',
        hasStoredKey: true,
        apiKey: '',
        clearApiKey: false,
      })
    ).toBe('disabled');
  });
});
