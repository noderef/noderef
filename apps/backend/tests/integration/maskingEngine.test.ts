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
  getDefaultMaskingConfig,
  maskPayload,
  maskString,
  validateMaskingConfig,
  type LlmMaskingConfig,
} from '../../src/services/ai/maskingEngine.js';

describe('masking engine', () => {
  const baseConfig: LlmMaskingConfig = {
    ...getDefaultMaskingConfig(),
    enabled: true,
    mode: 'tokenize',
  };

  describe('getDefaultMaskingConfig', () => {
    it('returns expected default shape', () => {
      const defaults = getDefaultMaskingConfig();
      expect(defaults.enabled).toBe(false);
      expect(defaults.mode).toBe('tokenize');
      expect(defaults.propertyRules.exact).toContain('cm:creator');
      expect(defaults.propertyRules.exact).toContain('cm:modifier');
      expect(defaults.propertyRules.exact).toContain('cm:email');
      expect(defaults.preserveKeys).toContain('id');
      expect(defaults.preserveKeys).toContain('name');
      expect(defaults.textRegexRules).toEqual([]);
    });
  });

  describe('disabled config', () => {
    it('returns data unchanged when disabled', () => {
      const data = { 'cm:creator': 'admin', name: 'test' };
      const config = { ...baseConfig, enabled: false };
      const { masked, stats } = maskPayload(data, config);
      expect(masked).toEqual(data);
      expect(stats.maskedFields).toBe(0);
      expect(stats.regexHits).toBe(0);
    });
  });

  describe('exact key matching', () => {
    it('masks value for exact matching key', () => {
      const data = { 'cm:creator': 'admin', name: 'test.txt' };
      const { masked, stats } = maskPayload(data, baseConfig);
      const result = masked as Record<string, unknown>;
      expect(result['cm:creator']).not.toBe('admin');
      expect(result['cm:creator']).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(stats.maskedFields).toBe(1);
    });

    it('does not mask non-matching key', () => {
      const data = { title: 'My Document' };
      const { masked, stats } = maskPayload(data, baseConfig);
      const result = masked as Record<string, unknown>;
      expect(result.title).toBe('My Document');
      expect(stats.maskedFields).toBe(0);
    });

    it('is case-insensitive', () => {
      const data = { 'CM:Creator': 'admin' };
      const { masked } = maskPayload(data, baseConfig);
      const result = masked as Record<string, unknown>;
      expect(result['CM:Creator']).toMatch(/^<MASKED_[a-f0-9]+>$/);
    });
  });

  describe('prefix matching', () => {
    it('masks key matching prefix', () => {
      const config: LlmMaskingConfig = {
        ...baseConfig,
        propertyRules: { ...baseConfig.propertyRules, prefixes: ['myhr:'] },
      };
      const data = { 'myhr:salary': '100000', name: 'test' };
      const { masked, stats } = maskPayload(data, config);
      const result = masked as Record<string, unknown>;
      expect(result['myhr:salary']).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(result.name).toBe('test');
      expect(stats.maskedFields).toBe(1);
    });
  });

  describe('regex key matching', () => {
    it('masks keys matching regex pattern', () => {
      const config: LlmMaskingConfig = {
        ...baseConfig,
        propertyRules: { ...baseConfig.propertyRules, regex: ['secret.*'] },
      };
      const data = { secretKey: 'abc123', name: 'test' };
      const { masked, stats } = maskPayload(data, config);
      const result = masked as Record<string, unknown>;
      expect(result.secretKey).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(result.name).toBe('test');
      expect(stats.maskedFields).toBe(1);
    });
  });

  describe('preserveKeys', () => {
    it('preserveKeys override exact match', () => {
      const config: LlmMaskingConfig = {
        ...baseConfig,
        propertyRules: { ...baseConfig.propertyRules, exact: ['id', 'name', 'cm:creator'] },
        preserveKeys: ['id', 'name'],
      };
      const data = { id: '12345', name: 'test', 'cm:creator': 'admin' };
      const { masked } = maskPayload(data, config);
      const result = masked as Record<string, unknown>;
      expect(result.id).toBe('12345');
      expect(result.name).toBe('test');
      expect(result['cm:creator']).toMatch(/^<MASKED_[a-f0-9]+>$/);
    });
  });

  describe('tokenize mode', () => {
    it('produces deterministic tokens (same value → same token)', () => {
      const data = { 'cm:creator': 'admin' };
      const { masked: masked1 } = maskPayload(data, baseConfig);
      const { masked: masked2 } = maskPayload(data, baseConfig);
      const result1 = (masked1 as Record<string, unknown>)['cm:creator'];
      const result2 = (masked2 as Record<string, unknown>)['cm:creator'];
      expect(result1).toBe(result2);
    });

    it('produces different tokens for different values', () => {
      const data1 = { 'cm:creator': 'admin' };
      const data2 = { 'cm:creator': 'other_user' };
      const { masked: masked1 } = maskPayload(data1, baseConfig);
      const { masked: masked2 } = maskPayload(data2, baseConfig);
      expect((masked1 as Record<string, unknown>)['cm:creator']).not.toBe(
        (masked2 as Record<string, unknown>)['cm:creator']
      );
    });
  });

  describe('redact mode', () => {
    it('uses static [REDACTED] replacement', () => {
      const config: LlmMaskingConfig = { ...baseConfig, mode: 'redact' };
      const data = { 'cm:creator': 'admin', 'cm:email': 'a@b.com' };
      const { masked } = maskPayload(data, config);
      const result = masked as Record<string, unknown>;
      expect(result['cm:creator']).toBe('[REDACTED]');
      expect(result['cm:email']).toBe('[REDACTED]');
    });
  });

  describe('text regex rules', () => {
    it('replaces email patterns in string values', () => {
      const config: LlmMaskingConfig = {
        ...baseConfig,
        textRegexRules: [
          {
            id: 'email',
            pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
            flags: 'g',
            replacement: '[EMAIL]',
          },
        ],
      };
      const data = { description: 'Contact admin@example.com for help' };
      const { masked, stats } = maskPayload(data, config);
      const result = masked as Record<string, unknown>;
      expect(result.description).toBe('Contact [EMAIL] for help');
      expect(stats.regexHits).toBe(1);
    });
  });

  describe('nested objects and arrays', () => {
    it('masks values in nested objects', () => {
      const data = {
        entry: {
          properties: {
            'cm:creator': 'admin',
            name: 'test',
          },
        },
      };
      const { masked, stats } = maskPayload(data, baseConfig);
      const result = masked as any;
      expect(result.entry.properties['cm:creator']).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(result.entry.properties.name).toBe('test');
      expect(stats.maskedFields).toBe(1);
    });

    it('masks values in arrays', () => {
      const data = {
        entries: [{ 'cm:creator': 'admin' }, { 'cm:creator': 'john' }],
      };
      const { masked, stats } = maskPayload(data, baseConfig);
      const result = masked as any;
      expect(result.entries[0]['cm:creator']).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(result.entries[1]['cm:creator']).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(stats.maskedFields).toBe(2);
    });

    it('masks array values when parent key matches a sensitive property', () => {
      const data = {
        'cm:email': ['a@example.com', 'b@example.com'],
      };
      const { masked, stats } = maskPayload(data, baseConfig);
      const result = masked as any;
      expect(result['cm:email'][0]).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(result['cm:email'][1]).toMatch(/^<MASKED_[a-f0-9]+>$/);
      expect(stats.maskedFields).toBe(2);
    });
  });

  describe('empty/null/undefined handling', () => {
    it('handles null values gracefully', () => {
      const data = { 'cm:creator': null, name: 'test' };
      const { masked } = maskPayload(data, baseConfig);
      const result = masked as Record<string, unknown>;
      expect(result['cm:creator']).toBeNull();
    });

    it('handles empty string', () => {
      const data = { 'cm:creator': '', name: 'test' };
      const { masked, stats } = maskPayload(data, baseConfig);
      const result = masked as Record<string, unknown>;
      // Empty string still gets masked since key matches
      expect(stats.maskedFields).toBe(1);
    });
  });

  describe('maskString', () => {
    it('applies text regex rules to plain strings', () => {
      const config: LlmMaskingConfig = {
        ...baseConfig,
        textRegexRules: [
          {
            id: 'email',
            pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
            flags: 'g',
            replacement: '[EMAIL]',
          },
        ],
      };
      const { masked, stats } = maskString('Email admin@test.com today', config);
      expect(masked).toBe('Email [EMAIL] today');
      expect(stats.regexHits).toBe(1);
    });

    it('returns unchanged when disabled', () => {
      const config: LlmMaskingConfig = { ...baseConfig, enabled: false };
      const { masked } = maskString('test@example.com', config);
      expect(masked).toBe('test@example.com');
    });
  });

  describe('maskPayload with string input', () => {
    it('applies text regex to plain string payload', () => {
      const config: LlmMaskingConfig = {
        ...baseConfig,
        textRegexRules: [
          { id: 'phone', pattern: '\\d{3}-\\d{4}', flags: 'g', replacement: '[PHONE]' },
        ],
      };
      const { masked } = maskPayload('Call 555-1234 now', config);
      expect(masked).toBe('Call [PHONE] now');
    });
  });

  describe('does not mutate original', () => {
    it('returns a new object, not the original', () => {
      const data = { 'cm:creator': 'admin' };
      const original = JSON.parse(JSON.stringify(data));
      maskPayload(data, baseConfig);
      expect(data).toEqual(original);
    });
  });
});

describe('validateMaskingConfig', () => {
  it('accepts valid config', () => {
    const input = {
      enabled: true,
      mode: 'tokenize',
      propertyRules: {
        exact: ['cm:creator'],
        prefixes: ['myhr:'],
        regex: ['^secret'],
      },
      textRegexRules: [
        { id: 'email', pattern: '\\w+@\\w+\\.\\w+', flags: 'gi', replacement: '[EMAIL]' },
      ],
      preserveKeys: ['id', 'name'],
    };
    const result = validateMaskingConfig(input);
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe('tokenize');
    expect(result.propertyRules.exact).toEqual(['cm:creator']);
    expect(result.textRegexRules).toHaveLength(1);
  });

  it('rejects invalid regex with clear error', () => {
    const input = {
      enabled: true,
      mode: 'tokenize',
      propertyRules: {
        exact: [],
        prefixes: [],
        regex: ['[invalid('],
      },
      textRegexRules: [],
      preserveKeys: [],
    };
    expect(() => validateMaskingConfig(input)).toThrow(/Invalid key regex pattern/);
  });

  it('rejects invalid text regex rule with clear error', () => {
    const input = {
      enabled: true,
      mode: 'tokenize',
      propertyRules: { exact: [], prefixes: [], regex: [] },
      textRegexRules: [{ id: 'bad', pattern: '(unclosed', flags: '', replacement: 'x' }],
      preserveKeys: [],
    };
    expect(() => validateMaskingConfig(input)).toThrow(/Invalid text regex pattern/);
  });

  it('trims and deduplicates arrays', () => {
    const input = {
      enabled: true,
      mode: 'tokenize',
      propertyRules: {
        exact: ['  cm:creator  ', 'cm:creator', 'cm:email'],
        prefixes: [],
        regex: [],
      },
      textRegexRules: [],
      preserveKeys: [],
    };
    const result = validateMaskingConfig(input);
    expect(result.propertyRules.exact).toEqual(['cm:creator', 'cm:email']);
  });

  it('sanitizes unsafe regex flags', () => {
    const input = {
      enabled: true,
      mode: 'tokenize',
      propertyRules: { exact: [], prefixes: [], regex: [] },
      textRegexRules: [{ id: 'test', pattern: 'foo', flags: 'gius', replacement: 'bar' }],
      preserveKeys: [],
    };
    const result = validateMaskingConfig(input);
    // 'u' and 's' should be stripped, only 'gi' and 'm' are safe
    expect(result.textRegexRules[0].flags).toBe('gi');
  });

  it('normalizes duplicate regex flags', () => {
    const input = {
      enabled: true,
      mode: 'tokenize',
      propertyRules: { exact: [], prefixes: [], regex: [] },
      textRegexRules: [{ id: 'test', pattern: 'foo', flags: 'iigg', replacement: 'bar' }],
      preserveKeys: [],
    };
    const result = validateMaskingConfig(input);
    expect(result.textRegexRules[0].flags).toBe('gi');
  });

  it('defaults mode to tokenize for invalid value', () => {
    const result = validateMaskingConfig({ enabled: true, mode: 'invalid' });
    expect(result.mode).toBe('tokenize');
  });

  it('fills in built-in defaults when optional sections are missing', () => {
    const result = validateMaskingConfig({ enabled: true, mode: 'tokenize' });
    expect(result.propertyRules.exact).toContain('cm:creator');
    expect(result.propertyRules.exact).toContain('cm:modifier');
    expect(result.propertyRules.exact).toContain('cm:email');
    expect(result.preserveKeys).toContain('id');
    expect(result.preserveKeys).toContain('name');
  });

  it('throws for non-object input', () => {
    expect(() => validateMaskingConfig('string')).toThrow('Masking config must be an object');
    expect(() => validateMaskingConfig(null)).toThrow('Masking config must be an object');
  });
});
