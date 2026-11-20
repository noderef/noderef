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

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { REDACTED, redactLogObject } from '../../src/lib/logRedaction.js';

const PASSWORD = 's3cret-pw';
const BASIC = Buffer.from(`admin:${PASSWORD}`).toString('base64');

/** Shape of the rejection @alfresco/js-api produces for a failed ticket login. */
function failedLoginError() {
  class Response {
    toJSON() {
      return {
        req: {
          method: 'POST',
          url: 'https://alfresco.example/alfresco/api/-default-/public/authentication/versions/1/tickets',
          data: { userId: 'admin', password: PASSWORD },
          headers: { authorization: `Basic ${BASIC}`, accept: 'application/json' },
        },
        status: 403,
      };
    }
  }
  return { status: 403, response: new Response() };
}

/** Shape of an axios error: an Error carrying the request config and raw client request. */
function axiosError() {
  class ClientRequest {
    _header = `POST /execute HTTP/1.1\r\nAuthorization: Basic ${BASIC}\r\n\r\n`;
  }
  return Object.assign(new Error('Request failed with status code 401'), {
    config: {
      url: `https://alfresco.example/alfresco/service/x?alf_ticket=TICKET_abc123`,
      headers: { Authorization: `Basic ${BASIC}` },
      auth: { username: 'admin', password: PASSWORD },
    },
    request: new ClientRequest(),
  });
}

function logLine(obj: Record<string, unknown>): string {
  let line = '';
  const logger = pino(
    { formatters: { log: redactLogObject } },
    { write: (chunk: string) => (line += chunk) }
  );
  logger.error(obj, 'failed');
  return line;
}

describe('redactLogObject', () => {
  it('removes credentials from a failed Alfresco login error at any nesting level', () => {
    for (const obj of [{ error: failedLoginError() }, { reason: { error: failedLoginError() } }]) {
      const line = logLine(obj);
      expect(line).not.toContain(PASSWORD);
      expect(line).not.toContain(BASIC);
      expect(line).toContain('"status":403');
      expect(line).toContain('"userId":"admin"');
    }
  });

  it('removes credentials from an axios error while keeping what is needed to debug', () => {
    const line = logLine({ err: axiosError() });
    expect(line).not.toContain(PASSWORD);
    expect(line).not.toContain(BASIC);
    expect(line).not.toContain('TICKET_abc123');
    expect(line).toContain('Request failed with status code 401');
    expect(line).toContain('"stack"');
    expect(line).toContain('alfresco.example/alfresco/service/x');
  });

  it('leaves ordinary log fields untouched', () => {
    const when = new Date('2026-01-02T03:04:05.000Z');
    expect(
      redactLogObject({ serverId: 2, methods: ['a', 'b'], nested: { ok: true, n: null }, when })
    ).toEqual({
      serverId: 2,
      methods: ['a', 'b'],
      nested: { ok: true, n: null },
      when: '2026-01-02T03:04:05.000Z',
    });
  });

  it('survives circular references and redacts sensitive keys by name', () => {
    const obj: Record<string, unknown> = { token: 'abc', refreshToken: null };
    obj.self = obj;
    const out = redactLogObject({ obj }).obj as Record<string, unknown>;
    expect(out.token).toBe(REDACTED);
    expect(out.refreshToken).toBeNull();
    expect(out.self).toBe('[Circular]');
  });
});
