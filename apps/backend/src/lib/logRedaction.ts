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

/**
 * Deep redaction for logged values.
 *
 * HTTP client errors (superagent via @alfresco/js-api, axios) carry the request that failed,
 * including its body and Authorization header. Path-based redaction cannot cover those because
 * they sit at varying depths under varying keys, so every logged object is scrubbed by key name
 * and by credential-looking string content instead.
 */

export const REDACTED = '***REDACTED***';

const MAX_DEPTH = 8;

const SENSITIVE_KEY =
  /^(password|passwd|pwd|authorization|proxy-authorization|cookie|set-cookie|token|refresh_?token|access_?token|id_?token|secret|client_?secret|x-noderef-token|alf_ticket|ticket)$/i;

const AUTH_SCHEME_VALUE = /\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/g;
const SENSITIVE_QUERY_PARAM =
  /\b(alf_ticket|nr_token|access_token|refresh_token|password)=[^&\s"']+/gi;

function redactString(value: string): string {
  return value
    .replace(AUTH_SCHEME_VALUE, `$1 ${REDACTED}`)
    .replace(SENSITIVE_QUERY_PARAM, `$1=${REDACTED}`);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function redactEntries(source: object, depth: number, seen: WeakSet<object>) {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    out[key] = SENSITIVE_KEY.test(key) && child != null ? REDACTED : redact(child, depth + 1, seen);
  }
  return out;
}

function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return value;

  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1, seen));

  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
      ...redactEntries(value, depth, seen),
      ...(value.cause !== undefined ? { cause: redact(value.cause, depth + 1, seen) } : {}),
    };
  }

  // Dates, URLs, superagent responses, axios headers: log what they would serialize to.
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') return redact(toJSON.call(value), depth + 1, seen);

  // Sockets, agents, raw client requests: never useful in a log and full of raw headers.
  if (!isPlainObject(value)) return `[${value.constructor?.name ?? 'Object'}]`;

  return redactEntries(value, depth, seen);
}

/** Returns a copy of a log object that is safe to write out. */
export function redactLogObject(obj: Record<string, unknown>): Record<string, unknown> {
  return redactEntries(obj, 0, new WeakSet());
}
