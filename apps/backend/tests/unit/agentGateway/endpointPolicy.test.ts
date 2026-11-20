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
  assertGatewayEndpointAllowed,
  EndpointPolicyError,
  endpointsMatch,
  normalizeGatewayEndpointUrl,
} from '../../../src/services/agentGateway/endpointPolicy.js';

describe('endpointPolicy', () => {
  it('rejects userinfo, fragments, and non-http protocols', () => {
    expect(() => normalizeGatewayEndpointUrl('http://user:pass@localhost:3100/mcp')).toThrow(
      EndpointPolicyError
    );
    expect(() => normalizeGatewayEndpointUrl('http://localhost:3100/mcp#frag')).toThrow(
      EndpointPolicyError
    );
    expect(() => normalizeGatewayEndpointUrl('ftp://localhost/mcp')).toThrow(EndpointPolicyError);
  });

  it('allows http for loopback, docker internal, and single-label hosts', () => {
    expect(assertGatewayEndpointAllowed('http://localhost:3100/mcp').hostname).toBe('localhost');
    expect(assertGatewayEndpointAllowed('http://127.0.0.1:3100/mcp').hostname).toBe('127.0.0.1');
    expect(assertGatewayEndpointAllowed('http://host.docker.internal:3100/mcp').hostname).toBe(
      'host.docker.internal'
    );
    expect(assertGatewayEndpointAllowed('http://agentgateway:3000/mcp').hostname).toBe(
      'agentgateway'
    );
  });

  it('allows http on the same host as the Alfresco server', () => {
    const url = assertGatewayEndpointAllowed('http://alfresco.example.test:3100/mcp', {
      alfrescoBaseUrl: 'http://alfresco.example.test:8080',
    });
    expect(url.hostname).toBe('alfresco.example.test');
  });

  it('requires https for public hosts', () => {
    expect(() => assertGatewayEndpointAllowed('http://gateway.example.com/mcp')).toThrow(
      EndpointPolicyError
    );
    expect(assertGatewayEndpointAllowed('https://gateway.example.com/mcp').protocol).toBe('https:');
  });

  it('strips trailing slashes and matches origin plus pathname', () => {
    const configured = normalizeGatewayEndpointUrl('http://localhost:3100/mcp/');
    expect(configured.pathname).toBe('/mcp');
    expect(endpointsMatch(configured, new URL('http://localhost:3100/mcp'))).toBe(true);
    expect(endpointsMatch(configured, new URL('http://localhost:3100/mcp/other'))).toBe(false);
  });
});
