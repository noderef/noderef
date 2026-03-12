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

import { useMemo } from 'react';
import type { SearchDictionary } from './useSearchDictionary';

export interface QNameGroupedSuggestions {
  types: string[];
  aspects: string[];
  properties: string[];
}

const EMPTY: QNameGroupedSuggestions = { types: [], aspects: [], properties: [] };

function filterByPrefix(items: string[], prefix: string, localFilter: string): string[] {
  const prefixLower = prefix.toLowerCase();
  const filterLower = localFilter.toLowerCase();

  const filtered = items.filter(item => {
    const itemLower = item.toLowerCase();
    if (!itemLower.startsWith(prefixLower)) {
      return false;
    }
    if (!filterLower) {
      return true;
    }
    const localName = itemLower.slice(prefixLower.length);
    return localName.includes(filterLower);
  });

  if (!filterLower) {
    return filtered;
  }

  // Sort by relevance: exact match → starts‐with → contains
  return filtered.sort((a, b) => {
    const aLocal = a.toLowerCase().slice(prefixLower.length);
    const bLocal = b.toLowerCase().slice(prefixLower.length);
    const aExact = aLocal === filterLower;
    const bExact = bLocal === filterLower;
    if (aExact !== bExact) return aExact ? -1 : 1;
    const aStarts = aLocal.startsWith(filterLower);
    const bStarts = bLocal.startsWith(filterLower);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return a.localeCompare(b);
  });
}

/**
 * Returns true if the given namespace prefix (e.g. "cm:") matches at least
 * one entry in any category of the dictionary.
 */
function isKnownNamespace(dictionary: SearchDictionary, prefix: string): boolean {
  const prefixLower = prefix.toLowerCase();
  return (
    dictionary.types.some(t => t.toLowerCase().startsWith(prefixLower)) ||
    dictionary.aspects.some(a => a.toLowerCase().startsWith(prefixLower)) ||
    dictionary.properties.some(p => p.toLowerCase().startsWith(prefixLower))
  );
}

/**
 * Parse a colon-query string (e.g. "cm:con") into namespace prefix and local filter.
 * Returns null if the query is not a valid namespace pattern.
 */
export function parseColonQuery(query: string): { prefix: string; localFilter: string } | null {
  const match = query.match(/^([a-zA-Z][a-zA-Z0-9_-]*):(.*)$/);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1].toLowerCase() + ':',
    localFilter: match[2],
  };
}

/**
 * Synchronously filters the dictionary by namespace prefix and optional local name filter.
 * Returns grouped results for types, aspects, and properties.
 */
export function useQNameSuggestions(
  dictionary: SearchDictionary,
  query: string | null
): QNameGroupedSuggestions {
  return useMemo(() => {
    if (!query) {
      return EMPTY;
    }

    const parsed = parseColonQuery(query);
    if (!parsed) {
      return EMPTY;
    }

    if (!isKnownNamespace(dictionary, parsed.prefix)) {
      return EMPTY;
    }

    return {
      types: filterByPrefix(dictionary.types, parsed.prefix, parsed.localFilter),
      aspects: filterByPrefix(dictionary.aspects, parsed.prefix, parsed.localFilter),
      properties: filterByPrefix(dictionary.properties, parsed.prefix, parsed.localFilter),
    };
  }, [dictionary, query]);
}
