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
  DslParseError,
  parseDslResponse,
  parseDslResponseWithRepair,
} from '../../src/ai/dslResponse.js';

describe('parseDslResponse', () => {
  it('parses the canonical <changes>/JSON form', () => {
    const raw = `<changes>
{"type":"replace_selection","code":"var x = 1;"}
</changes>`;
    expect(parseDslResponse(raw)).toEqual({ type: 'replace_selection', code: 'var x = 1;' });
  });

  it('accepts JSON without the <changes> wrapper', () => {
    const raw = '{"type":"replace_file","code":"console.log(1);"}';
    expect(parseDslResponse(raw)).toEqual({ type: 'replace_file', code: 'console.log(1);' });
  });

  it('falls back to fenced code blocks when the wrapper is missing', () => {
    const raw = ['Here is your script:', '', '```javascript', 'var x = 1;', '```'].join('\n');
    expect(parseDslResponse(raw)).toEqual({ type: 'replace_selection', code: 'var x = 1;' });
  });

  it('accepts inline JavaScript when no wrapper or fences are present', () => {
    const raw = [
      'Hier is hoe je dat doet:',
      '',
      'var zaakUuid = "12345";',
      'var result = zrc.getZaak(zaakUuid);',
      'logger.log(result);',
    ].join('\n');
    const parsed = parseDslResponse(raw);
    expect(parsed.type).toBe('replace_selection');
    expect(parsed.code).toContain('var zaakUuid');
    expect(parsed.code).toContain('logger.log(result);');
  });

  it('throws AI_DSL_MISSING when the response is mostly prose', () => {
    const raw = 'I cannot help with that without more details about your environment.';
    expect(() => parseDslResponse(raw)).toThrow(DslParseError);
    try {
      parseDslResponse(raw);
    } catch (err) {
      expect((err as DslParseError).code).toBe('AI_DSL_MISSING');
    }
  });

  it('recovers partial DSL-like text via regex', () => {
    const raw = 'random "type": "replace_selection", "code": "var y = 2;\\nlogger.log(y);", end';
    const parsed = parseDslResponse(raw);
    expect(parsed.type).toBe('replace_selection');
    expect(parsed.code).toBe('var y = 2;\nlogger.log(y);');
  });

  it('respects escaped quotes inside the code string', () => {
    const raw = '{"type":"replace_selection","code":"logger.log(\\"hi\\");"}';
    const parsed = parseDslResponse(raw);
    expect(parsed.code).toBe('logger.log("hi");');
  });

  it('salvages truncated <changes> responses (max_tokens cut off mid-string)', () => {
    const raw = [
      '<changes>',
      '{',
      '  "type": "replace_selection",',
      '  "code": "// header\\nvar zaakUuid = \\"123\\";\\nvar result = zrc.getZaak(zaakUuid);\\nlogger.log(result',
    ].join('\n');
    const parsed = parseDslResponse(raw);
    expect(parsed.type).toBe('replace_selection');
    expect(parsed.code).toContain('var zaakUuid = "123";');
    expect(parsed.code).toContain('zrc.getZaak(zaakUuid);');
    expect(parsed.code).toContain('logger.log(result');
  });
});

describe('parseDslResponseWithRepair', () => {
  it('invokes the repair callback only when parsing fails', async () => {
    let called = 0;
    const result = await parseDslResponseWithRepair(
      '<changes>{"type":"replace_selection","code":"1"}</changes>',
      async () => {
        called += 1;
        return '';
      }
    );
    expect(result.code).toBe('1');
    expect(called).toBe(0);
  });

  it('parses the repaired output after a recoverable failure', async () => {
    const repaired = '<changes>{"type":"replace_selection","code":"repaired();"}</changes>';
    const result = await parseDslResponseWithRepair(
      'I refuse to follow the format.',
      async () => repaired
    );
    expect(result).toEqual({ type: 'replace_selection', code: 'repaired();' });
  });

  it('does not call repair when the first parse already succeeded via inline JS fallback', async () => {
    let called = 0;
    const raw = ['Voorbeeld:', 'var x = 1;', 'var y = 2;', 'logger.log(x + y);'].join('\n');
    const result = await parseDslResponseWithRepair(raw, async () => {
      called += 1;
      return '';
    });
    expect(called).toBe(0);
    expect(result.type).toBe('replace_selection');
    expect(result.code).toContain('logger.log');
  });
});
