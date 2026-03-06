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
 * LLM Masking Engine
 *
 * Pure-function module for masking sensitive data before outbound LLM calls.
 * Supports property-key matching (exact, prefix, regex) and free-text regex rules.
 * Two modes: tokenize (deterministic HMAC placeholders) and redact (static replacement).
 */

import { createHmac } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TextRegexRule {
  id: string;
  pattern: string;
  flags?: string;
  replacement: string;
}

export interface LlmMaskingConfig {
  enabled: boolean;
  mode: 'tokenize' | 'redact';
  propertyRules: {
    exact: string[];
    prefixes: string[];
    regex: string[];
  };
  textRegexRules: TextRegexRule[];
  preserveKeys: string[];
}

export interface MaskingStats {
  maskedFields: number;
  regexHits: number;
}

export interface MaskingResult {
  masked: unknown;
  stats: MaskingStats;
}

export interface MaskingOptions {
  tokenMap?: Map<string, string>;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_EXACT_KEYS = ['cm:creator', 'cm:modifier', 'cm:email'];
const DEFAULT_PREFIXES = ['displayName'];

const DEFAULT_PRESERVE_KEYS = ['id', 'name', 'nodeType', 'path', 'isFile', 'isFolder'];

const INTERNAL_SALT = 'noderef-masking-v1-internal-salt';
const SAFE_REGEX_FLAGS = new Set(['g', 'i', 'm']);
const MAX_ARRAY_ITEMS = 100;
const REDACTED_TEXT = '[REDACTED]';
const MASKED_TOKEN_PATTERN = /<MASKED_[a-f0-9]{12}>/g;

export function getDefaultMaskingConfig(): LlmMaskingConfig {
  return {
    enabled: false,
    mode: 'tokenize',
    propertyRules: {
      exact: [...DEFAULT_EXACT_KEYS],
      prefixes: [...DEFAULT_PREFIXES],
      regex: [],
    },
    textRegexRules: [],
    preserveKeys: [...DEFAULT_PRESERVE_KEYS],
  };
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateMaskingConfig(input: unknown): LlmMaskingConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('Masking config must be an object.');
  }

  const raw = input as Record<string, unknown>;

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : false;
  const mode = raw.mode === 'redact' ? 'redact' : 'tokenize';

  const propertyRules = validatePropertyRules(raw.propertyRules);
  const textRegexRules = validateTextRegexRules(raw.textRegexRules);
  const preserveKeys =
    raw.preserveKeys === undefined
      ? [...DEFAULT_PRESERVE_KEYS]
      : sanitizeStringArray(raw.preserveKeys, MAX_ARRAY_ITEMS);

  return { enabled, mode, propertyRules, textRegexRules, preserveKeys };
}

function validatePropertyRules(raw: unknown): LlmMaskingConfig['propertyRules'] {
  if (!raw || typeof raw !== 'object') {
    return { exact: [...DEFAULT_EXACT_KEYS], prefixes: [...DEFAULT_PREFIXES], regex: [] };
  }

  const rules = raw as Record<string, unknown>;
  const exact =
    rules.exact === undefined
      ? [...DEFAULT_EXACT_KEYS]
      : sanitizeStringArray(rules.exact, MAX_ARRAY_ITEMS);
  const prefixes =
    rules.prefixes === undefined
      ? [...DEFAULT_PREFIXES]
      : sanitizeStringArray(rules.prefixes, MAX_ARRAY_ITEMS);
  const regex = validateRegexArray(rules.regex);

  return { exact, prefixes, regex };
}

function validateTextRegexRules(raw: unknown): TextRegexRule[] {
  if (!Array.isArray(raw)) return [];

  const rules: TextRegexRule[] = [];
  for (const item of raw.slice(0, MAX_ARRAY_ITEMS)) {
    if (!item || typeof item !== 'object') continue;
    const rule = item as Record<string, unknown>;

    const id = typeof rule.id === 'string' ? rule.id.trim() : '';
    const pattern = typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
    const flags = typeof rule.flags === 'string' ? sanitizeFlags(rule.flags) : '';
    const replacement = typeof rule.replacement === 'string' ? rule.replacement : REDACTED_TEXT;

    if (!pattern) continue;

    // Validate that the regex compiles
    try {
      new RegExp(pattern, flags);
    } catch (err) {
      throw new Error(
        `Invalid text regex pattern "${pattern}": ${err instanceof Error ? err.message : 'compilation failed'}`
      );
    }

    rules.push({ id: id || `rule_${rules.length}`, pattern, flags, replacement });
  }

  return rules;
}

function validateRegexArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const result: string[] = [];
  for (const item of raw.slice(0, MAX_ARRAY_ITEMS)) {
    const pattern = typeof item === 'string' ? item.trim() : '';
    if (!pattern) continue;

    try {
      new RegExp(pattern, 'i');
    } catch (err) {
      throw new Error(
        `Invalid key regex pattern "${pattern}": ${err instanceof Error ? err.message : 'compilation failed'}`
      );
    }

    if (!result.includes(pattern)) {
      result.push(pattern);
    }
  }

  return result;
}

function sanitizeStringArray(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const value = typeof item === 'string' ? item.trim() : '';
    if (value && !seen.has(value) && result.length < max) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function sanitizeFlags(flags: string): string {
  const normalized = flags.toLowerCase();
  const orderedFlags: Array<'g' | 'i' | 'm'> = ['g', 'i', 'm'];
  return orderedFlags
    .filter(flag => SAFE_REGEX_FLAGS.has(flag) && normalized.includes(flag))
    .join('');
}

// ── Masking Core ───────────────────────────────────────────────────────────────

function resolveHmacKey(): string {
  const envSalt = process.env.LLM_MASKING_SALT;
  return envSalt && envSalt.trim().length > 0 ? envSalt.trim() : INTERNAL_SALT;
}

function tokenizeValue(value: string, hmacKey: string): string {
  const hash = createHmac('sha256', hmacKey).update(value).digest('hex').slice(0, 12);
  return `<MASKED_${hash}>`;
}

function maskStringValue(
  value: string,
  mode: 'tokenize' | 'redact',
  hmacKey: string,
  tokenMap?: Map<string, string>
): string {
  if (mode === 'tokenize') {
    const token = tokenizeValue(value, hmacKey);
    tokenMap?.set(token, value);
    return token;
  }
  return REDACTED_TEXT;
}

interface CompiledConfig {
  exactKeys: Set<string>;
  prefixes: string[];
  regexKeys: RegExp[];
  textRegexRules: Array<{ regex: RegExp; replacement: string }>;
  preserveKeys: Set<string>;
  mode: 'tokenize' | 'redact';
  hmacKey: string;
}

function compileConfig(config: LlmMaskingConfig): CompiledConfig {
  const hmacKey = resolveHmacKey();

  return {
    exactKeys: new Set(config.propertyRules.exact.map(k => k.toLowerCase())),
    prefixes: config.propertyRules.prefixes.map(p => p.toLowerCase()),
    regexKeys: config.propertyRules.regex.map(r => new RegExp(r, 'i')),
    textRegexRules: config.textRegexRules.map(rule => ({
      regex: new RegExp(rule.pattern, rule.flags || 'g'),
      replacement: rule.replacement,
    })),
    preserveKeys: new Set(config.preserveKeys.map(k => k.toLowerCase())),
    mode: config.mode,
    hmacKey,
  };
}

function shouldMaskKey(key: string, compiled: CompiledConfig): boolean {
  const lower = key.toLowerCase();

  if (compiled.preserveKeys.has(lower)) return false;
  if (compiled.exactKeys.has(lower)) return true;
  if (compiled.prefixes.some(prefix => lower.startsWith(prefix))) return true;
  if (compiled.regexKeys.some(regex => regex.test(key))) return true;

  return false;
}

function applyTextRegexRules(value: string, compiled: CompiledConfig, stats: MaskingStats): string {
  let result = value;
  for (const rule of compiled.textRegexRules) {
    // Reset lastIndex for stateful regexes
    rule.regex.lastIndex = 0;
    let hits = 0;
    result = result.replace(rule.regex, () => {
      hits += 1;
      return rule.replacement;
    });
    stats.regexHits += hits;
  }
  return result;
}

interface TraversalState {
  inProgress: WeakSet<object>;
  tokenMap?: Map<string, string>;
}

function maskCircularReference(
  compiled: CompiledConfig,
  stats: MaskingStats,
  state: TraversalState
) {
  stats.maskedFields += 1;
  return maskStringValue('[CIRCULAR_REFERENCE]', compiled.mode, compiled.hmacKey, state.tokenMap);
}

function maskValue(
  value: unknown,
  key: string,
  compiled: CompiledConfig,
  stats: MaskingStats,
  state: TraversalState
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (shouldMaskKey(key, compiled)) {
      stats.maskedFields += 1;
      return maskStringValue(value, compiled.mode, compiled.hmacKey, state.tokenMap);
    }
    // Apply text regex rules to all string values regardless of key
    return applyTextRegexRules(value, compiled, stats);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    if (shouldMaskKey(key, compiled)) {
      stats.maskedFields += 1;
      return maskStringValue(String(value), compiled.mode, compiled.hmacKey, state.tokenMap);
    }
    return value;
  }

  if (typeof value === 'bigint') {
    const asString = value.toString();
    if (shouldMaskKey(key, compiled)) {
      stats.maskedFields += 1;
      return maskStringValue(asString, compiled.mode, compiled.hmacKey, state.tokenMap);
    }
    return asString;
  }

  if (Array.isArray(value)) {
    if (state.inProgress.has(value)) {
      return maskCircularReference(compiled, stats, state);
    }
    state.inProgress.add(value);
    const masked = value.map(item => maskValue(item, key, compiled, stats, state));
    state.inProgress.delete(value);
    return masked;
  }

  if (typeof value === 'object') {
    if (value instanceof Date) {
      const iso = value.toISOString();
      if (shouldMaskKey(key, compiled)) {
        stats.maskedFields += 1;
        return maskStringValue(iso, compiled.mode, compiled.hmacKey, state.tokenMap);
      }
      return applyTextRegexRules(iso, compiled, stats);
    }

    if (state.inProgress.has(value)) {
      return maskCircularReference(compiled, stats, state);
    }
    state.inProgress.add(value);
    const masked = maskObject(value as Record<string, unknown>, compiled, stats, state);
    state.inProgress.delete(value);
    return masked;
  }

  return value;
}

function maskObject(
  obj: Record<string, unknown>,
  compiled: CompiledConfig,
  stats: MaskingStats,
  state: TraversalState
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    result[key] = maskValue(val, key, compiled, stats, state);
  }

  return result;
}

/**
 * Mask a string by applying text regex rules and optionally full masking.
 */
export function maskString(
  text: string,
  config: LlmMaskingConfig
): { masked: string; stats: MaskingStats } {
  if (!config.enabled) {
    return { masked: text, stats: { maskedFields: 0, regexHits: 0 } };
  }

  const compiled = compileConfig(config);
  const stats: MaskingStats = { maskedFields: 0, regexHits: 0 };
  const masked = applyTextRegexRules(text, compiled, stats);

  return { masked, stats };
}

/**
 * Top-level entry point: mask an entire payload (object, array, or string).
 * Returns a deep copy with sensitive values masked.
 */
export function maskPayload(
  payload: unknown,
  config: LlmMaskingConfig,
  options: MaskingOptions = {}
): MaskingResult {
  if (!config.enabled) {
    return { masked: payload, stats: { maskedFields: 0, regexHits: 0 } };
  }

  const compiled = compileConfig(config);
  const stats: MaskingStats = { maskedFields: 0, regexHits: 0 };
  const state: TraversalState = {
    inProgress: new WeakSet<object>(),
    tokenMap: options.tokenMap,
  };

  if (typeof payload === 'string') {
    const masked = applyTextRegexRules(payload, compiled, stats);
    return { masked, stats };
  }

  if (Array.isArray(payload)) {
    const masked = payload.map((item, index) =>
      maskValue(item, `[${index}]`, compiled, stats, state)
    );
    return { masked, stats };
  }

  if (payload && typeof payload === 'object') {
    const masked = maskValue(payload, '$', compiled, stats, state);
    return { masked, stats };
  }

  return { masked: payload, stats };
}

export function detokenizeText(
  text: string,
  tokenMap: Map<string, string> | null | undefined
): string {
  if (!tokenMap || tokenMap.size === 0 || !text) {
    return text;
  }

  return text.replace(MASKED_TOKEN_PATTERN, token => tokenMap.get(token) ?? token);
}
