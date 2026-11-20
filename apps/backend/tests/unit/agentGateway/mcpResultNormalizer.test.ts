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
  normalizeMcpToolResult,
  promptMessagesToText,
} from '../../../src/services/agentGateway/mcpResultNormalizer.js';

describe('mcpResultNormalizer', () => {
  it('maps isError to a truncated error result', () => {
    const result = normalizeMcpToolResult('echo', {
      isError: true,
      content: [{ type: 'text', text: 'boom' }],
    } as never);
    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('prefers structuredContent and marks gateway data untrusted', () => {
    const result = normalizeMcpToolResult('echo', {
      structuredContent: { hello: 'world' },
      content: [{ type: 'text', text: 'ignored' }],
    } as never);
    expect(result).toEqual({
      ok: true,
      data: { source: 'agent_gateway', tool: 'echo', untrusted: true, hello: 'world' },
    });
  });

  it('parses a single JSON text block', () => {
    const result = normalizeMcpToolResult('echo', {
      content: [{ type: 'text', text: '{"echo":"hi"}' }],
    } as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.echo).toBe('hi');
      expect(result.data.untrusted).toBe(true);
    }
  });

  it('omits image payloads without base64', () => {
    const result = normalizeMcpToolResult('image_tool', {
      content: [{ type: 'image', data: 'YWJj', mimeType: 'image/png' }],
    } as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = result.data.content as Array<Record<string, unknown>>;
      expect(content[0]).toMatchObject({ type: 'image', omitted: true, mimeType: 'image/png' });
      expect(content[0].data).toBeUndefined();
    }
  });

  it('flattens prompt messages and resource text', () => {
    const prompt = promptMessagesToText([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'image', mimeType: 'image/png' }] },
    ]);
    expect(prompt.text).toContain('user:');
    expect(prompt.text).toContain('[image omitted]');
  });
});
