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

import { extractJsonFromModel } from './extractJsonFromModel.js';
import type { Manifest, ManifestEntry } from './types/manifest.js';

/** Prefix for repository-provided libs (vs. built-in static ones). */
const CUSTOM_LIB_PREFIX = 'custom_';

/** Maximum number of libraries returned by the router for a single request. */
const MAX_ROUTER_SELECTED_LIBS = 5;

/**
 * Minimum match score for a custom lib to be injected when the model returns
 * a selection that ignores it. Keeps unrelated questions from silently pulling
 * in a weak match.
 */
const MIN_CUSTOM_INJECTION_SCORE = 8;

/** Minimum score to surface a library in the router "suggested" hint block. */
const MIN_SUGGESTED_SCORE = 4;

export interface RouterLibraryResolution {
  /** Final library names to use, after parsing the model output and applying overrides. */
  selected: string[];
  /** Custom libs above the suggestion threshold (passed to `buildRouterPrompt`). */
  suggested: string[];
  /** All custom libs that scored > 0, ordered by score desc (for diagnostic logging). */
  rankedCustom: Array<{ name: string; score: number }>;
  /** What the model returned verbatim, after JSON parsing and manifest filtering. */
  parsedBeforeFallback: string[];
}

export function resolveRouterLibrarySelection(
  question: string,
  manifest: Manifest,
  rawModelOutput: string,
  maxSelected: number = MAX_ROUTER_SELECTED_LIBS
): RouterLibraryResolution {
  const parsedBeforeFallback = parseRouterLibraryNames(rawModelOutput, manifest, maxSelected);
  const rankedCustom = rankCustomLibraries(question, manifest);
  const suggested = rankedCustom
    .filter(x => x.score >= MIN_SUGGESTED_SCORE)
    .slice(0, maxSelected)
    .map(x => x.name);
  const selected = withStrongCustomLibsForced(parsedBeforeFallback, rankedCustom, maxSelected);

  return { selected, suggested, rankedCustom, parsedBeforeFallback };
}

/** Suggested custom libs for the router prompt (used to highlight strong matches). */
export function suggestedLibrariesForRouter(question: string, manifest: Manifest): string[] {
  return resolveRouterLibrarySelection(question, manifest, '[]').suggested;
}

/**
 * Ensures the final selection contains any custom lib that strongly matches
 * the question. Strong matches are prepended (preserving model order for
 * everything else) so the most relevant lib appears first in the prompt.
 */
function withStrongCustomLibsForced(
  modelSelection: string[],
  rankedCustom: ReadonlyArray<{ name: string; score: number }>,
  maxSelected: number
): string[] {
  const strongCustomNames = rankedCustom
    .filter(x => x.score >= MIN_CUSTOM_INJECTION_SCORE)
    .map(x => x.name);

  const merged = [...strongCustomNames, ...modelSelection];
  return dedupe(merged).slice(0, maxSelected);
}

function parseRouterLibraryNames(raw: string, manifest: Manifest, maxSelected: number): string[] {
  const parsed = JSON.parse(extractJsonFromModel(raw, 'array'));
  if (!Array.isArray(parsed)) {
    throw new Error('Router response must be an array.');
  }
  return parsed
    .filter((name): name is string => typeof name === 'string' && name in manifest)
    .slice(0, maxSelected);
}

function rankCustomLibraries(
  question: string,
  manifest: Manifest
): Array<{ name: string; score: number }> {
  const q = question.toLowerCase();
  return Object.entries(manifest)
    .filter(([name]) => name.startsWith(CUSTOM_LIB_PREFIX))
    .map(([name, entry]) => ({ name, score: scoreCustomLibrary(name, entry, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Exported for testing. `lowercaseQuestion` MUST already be `.toLowerCase()`. */
export function scoreCustomLibrary(
  name: string,
  entry: ManifestEntry,
  lowercaseQuestion: string
): number {
  if (!name.startsWith(CUSTOM_LIB_PREFIX)) {
    return 0;
  }

  const base = name.slice(CUSTOM_LIB_PREFIX.length).toLowerCase();
  let score = 0;

  if (base.length >= 2 && lowercaseQuestion.includes(base)) {
    score += 14;
  }

  for (const part of base.split(/[-_]/)) {
    if (part.length >= 2 && lowercaseQuestion.includes(part)) {
      score += Math.min(10, 4 + part.length);
    }
  }

  for (const tag of entry.tags) {
    const t = tag.toLowerCase();
    if (t.length >= 2 && lowercaseQuestion.includes(t)) {
      score += 6;
    }
  }

  for (const word of entry.description.toLowerCase().split(/\W+/)) {
    if (word.length >= 5 && lowercaseQuestion.includes(word)) {
      score += 2;
    }
  }

  return score;
}

function dedupe<T>(values: ReadonlyArray<T>): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
