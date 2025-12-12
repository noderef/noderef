/**
 * Copyright 2025 NodeRef
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

import { backendRpc, type SearchHistory } from '@/core/ipc/backend';
import { useSearchStore } from '@/core/store/search';
import { useSearchHistoryStore } from '@/core/store/searchHistory';
import { useServersStore } from '@/core/store/servers';
import { useSearchDictionary } from '@/hooks/useSearchDictionary';
import {
  Badge,
  Checkbox,
  Combobox,
  Group,
  Loader,
  Pill,
  PillsInput,
  Stack,
  Text,
  Tooltip,
  useCombobox,
  useComputedColorScheme,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type SearchTokenKind = 'type' | 'aspect' | 'site' | 'prop' | 'operator' | 'text' | 'path';

type PathDepth = 'immediate' | 'deep';

interface SearchToken {
  id: string;
  kind: SearchTokenKind;
  label: string;
  value: string;
  field?: string;
  rawValue?: string;
  pathDepth?: PathDepth; // For path tokens: 'children' or 'deep'
  pathValue?: string; // The folder path without wildcards (display path)
  qnamePath?: string; // The qname path for PATH queries (e.g., /app:company_home/app:dictionary)
}

interface ServerTarget {
  id: number;
  baseUrl: string;
  name: string;
}

interface SearchQueryBuilderProps {
  serverId: number | null;
  onSearch?: (query: string, targets?: ServerTarget[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

type SuggestionKind = 'prefix' | 'type' | 'aspect' | 'site' | 'prop' | 'operator' | 'path' | 'text';

interface SuggestionItem {
  value: string;
  label: string;
  kind: SuggestionKind;
  description?: string;
  meta?: Record<string, string>;
}

interface SuggestionGroup {
  group: string;
  items: SuggestionItem[];
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

function formatPropQuery(field: string, raw: string): { label: string; query: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      label: field,
      query: '',
    };
  }

  const hasWildcard = /[*?]/.test(trimmed);
  const isQuoted = /^".*"$/.test(trimmed);
  let queryValue = trimmed;

  if (!hasWildcard && !isQuoted) {
    queryValue = `*${trimmed}*`;
  }

  if (!isQuoted) {
    const escaped = escapeQuotes(queryValue);
    if (/\s/.test(queryValue)) {
      queryValue = `"${escaped}"`;
    } else {
      queryValue = escaped;
    }
  }

  return {
    label: `${field} = ${raw}`,
    query: `${field}:${queryValue}`,
  };
}

function formatPathToken(
  pathValue: string,
  depth: PathDepth = 'deep',
  t: (key: string, options?: { path?: string; depth?: string }) => string,
  qnamePath?: string
): SearchToken {
  const depthLabel = depth === 'deep' ? t('depthDeep') : t('depthImmediate');
  const wildcard = depth === 'immediate' ? '/*' : '//*';
  // Use qnamePath if available, otherwise fall back to pathValue
  const pathForQuery = qnamePath || pathValue;
  const escapedPath = escapeQuotes(pathForQuery);
  const query = `PATH:"${escapedPath}${wildcard}"`;

  return {
    id: randomId(),
    kind: 'path',
    label: t('pathTokenLabel', { path: pathValue, depth: depthLabel }),
    value: query,
    pathValue,
    qnamePath: qnamePath || pathValue,
    pathDepth: depth,
  };
}

function formatSimpleToken(kind: SearchTokenKind, value: string): SearchToken {
  let label = value;
  let query = value;

  switch (kind) {
    case 'type':
      label = `type:${value}`;
      query = `TYPE:"${escapeQuotes(value)}"`;
      break;
    case 'aspect':
      label = `aspect:${value}`;
      query = `ASPECT:"${escapeQuotes(value)}"`;
      break;
    case 'site':
      label = `site:${value}`;
      query = `site:${value}`;
      break;
    case 'operator':
      label = value;
      query = value;
      break;
    case 'text': {
      const escaped = escapeQuotes(value);
      label = value;
      query = `TEXT:"${escaped}"`;
      break;
    }
    default:
      label = value;
      query = value;
  }

  return {
    id: randomId(),
    kind,
    label,
    value: query,
  };
}

export function SearchQueryBuilder({
  serverId,
  onSearch,
  placeholder,
  disabled = false,
}: SearchQueryBuilderProps) {
  const { t } = useTranslation(['search', 'common']);
  const servers = useServersStore(state => state.servers);
  const explicitServer = useMemo(
    () => (serverId ? servers.find(s => s.id === serverId) || null : null),
    [serverId, servers]
  );
  const multiServerEnabled = !serverId;
  const selectedServerIds = useSearchStore(state => state.selectedServerIds);
  const setSelectedServerIds = useSearchStore(state => state.setSelectedServerIds);
  const hasAvailableServers = serverId ? Boolean(explicitServer) : servers.length > 0;
  const isDisabled = disabled || !hasAvailableServers;

  useEffect(() => {
    if (explicitServer) {
      if (selectedServerIds.length !== 1 || selectedServerIds[0] !== explicitServer.id) {
        setSelectedServerIds([explicitServer.id]);
      }
      return;
    }

    if (!multiServerEnabled) {
      return;
    }

    const availableIds = servers.map(s => s.id);
    if (availableIds.length === 0) {
      if (selectedServerIds.length !== 0) {
        setSelectedServerIds([]);
      }
      return;
    }

    // Filter out invalid server IDs (e.g., servers that were deleted)
    const validSelectedIds = selectedServerIds.filter(id => availableIds.includes(id));

    if (validSelectedIds.length !== selectedServerIds.length) {
      // Some selected servers are no longer available, update to only valid ones
      setSelectedServerIds(validSelectedIds.length > 0 ? validSelectedIds : [availableIds[0]]);
      return;
    }

    // If no servers are selected, default to the first available server
    if (selectedServerIds.length === 0) {
      setSelectedServerIds([availableIds[0]]);
    }
  }, [explicitServer, multiServerEnabled, selectedServerIds, servers, setSelectedServerIds]);

  const primaryServer =
    explicitServer ??
    (multiServerEnabled ? servers.find(s => selectedServerIds.includes(s.id)) || null : null);
  const baseUrl = primaryServer?.baseUrl || null;
  const effectiveServerId = primaryServer?.id ?? null;
  const { dictionary, loading } = useSearchDictionary(effectiveServerId);
  const { recentTypes, recentAspects, recentProps, addType, addAspect, addProp } =
    useSearchHistoryStore();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  });

  const colorScheme = useComputedColorScheme('light');
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (isDisabled) {
      combobox.closeDropdown();
    }
  }, [isDisabled, combobox]);

  const [inputValue, setInputValue] = useState('');
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [pendingPropField, setPendingPropField] = useState<string | null>(null);
  const [pendingPropValue, setPendingPropValue] = useState('');
  const pendingInputRef = useRef<HTMLInputElement | null>(null);
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [currentProperties, setCurrentProperties] = useState<string[]>([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [currentClasses, setCurrentClasses] = useState<{
    types: string[];
    aspects: string[];
    containers: string[];
  }>({
    types: [],
    aspects: [],
    containers: [],
  });
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [pathSearchResults, setPathSearchResults] = useState<
    Array<{ path: string; qnamePath: string; name: string; serverId: number; serverName: string }>
  >([]);
  const [isLoadingPaths, setIsLoadingPaths] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const propertiesCacheRef = useRef<Record<string, { values: string[]; timestamp: number }>>({});
  const classesCacheRef = useRef<
    Record<
      string,
      { values: { types: string[]; aspects: string[]; containers: string[] }; timestamp: number }
    >
  >({});
  const selectedServers = useMemo(() => {
    if (isDisabled) {
      return [];
    }
    if (explicitServer) {
      return [
        { id: explicitServer.id, baseUrl: explicitServer.baseUrl, name: explicitServer.name },
      ];
    }
    const resolved = selectedServerIds
      .map(id => servers.find(s => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    return resolved.map(server => ({
      id: server.id,
      baseUrl: server.baseUrl,
      name: server.name,
    }));
  }, [explicitServer, selectedServerIds, servers, isDisabled]);

  useEffect(() => {
    if (pendingPropField) {
      setTimeout(() => pendingInputRef.current?.focus(), 0);
    }
  }, [pendingPropField]);

  useEffect(() => {
    if (isDisabled && pendingPropField) {
      setPendingPropField(null);
      setPendingPropValue('');
    }
  }, [isDisabled, pendingPropField]);

  // Auto-scroll to keep input visible
  const scrollToInput = () => {
    if (isDisabled) {
      return;
    }
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      }
    });
  };

  // Auto-scroll when tokens or input changes
  useEffect(() => {
    if (!isDisabled) {
      scrollToInput();
    }
  }, [tokens, inputValue, pendingPropField, isDisabled]);

  const propertyPrefixes = useMemo(() => {
    const prefixes = new Set<string>();
    dictionary.properties.forEach(prop => {
      const idx = prop.indexOf(':');
      if (idx > 0) {
        prefixes.add(prop.slice(0, idx + 1));
      }
    });
    return Array.from(prefixes).sort();
  }, [dictionary.properties]);

  const defaultPropPrefix = propertyPrefixes[0] ?? 'cm:';
  const normalizedDefaultPropPrefix = defaultPropPrefix.toLowerCase();

  const activePropertyPrefix = useMemo(() => {
    if (pendingPropField) {
      return null;
    }
    const match = inputValue.match(/^([a-z0-9_-]+:)/i);
    if (!match) {
      return null;
    }
    const prefix = match[1].toLowerCase();
    if (prefix === 'prop:') {
      // Check if there's a namespace prefix after "prop:" (e.g., "prop:cm:")
      const afterProp = inputValue.slice(5);
      const namespaceMatch = afterProp.match(/^([a-z0-9_-]+:)/i);
      if (namespaceMatch) {
        return namespaceMatch[1].toLowerCase();
      }
      return normalizedDefaultPropPrefix;
    }
    if (prefix === 'type:' || prefix === 'aspect:' || prefix === 'site:') {
      return null;
    }
    return prefix;
  }, [inputValue, pendingPropField, normalizedDefaultPropPrefix]);

  const activeClassPrefix = useMemo(() => {
    if (pendingPropField) {
      return null;
    }
    const normalized = inputValue.trim().toLowerCase();
    const extractNamespace = (value: string) => {
      const match = value.match(/^([a-z0-9_-]+:)/i);
      return match ? match[1].toLowerCase() : null;
    };

    if (normalized.startsWith('type:')) {
      return extractNamespace(normalized.slice(5));
    }
    if (normalized.startsWith('aspect:')) {
      return extractNamespace(normalized.slice(7));
    }
    return null;
  }, [inputValue, pendingPropField]);

  useEffect(() => {
    // Reset cache when server context changes
    propertiesCacheRef.current = {};
    classesCacheRef.current = {};
  }, [effectiveServerId, baseUrl]);

  useEffect(() => {
    if (!effectiveServerId || !baseUrl || !activePropertyPrefix || isDisabled) {
      setCurrentProperties([]);
      setIsLoadingProperties(false);
      return;
    }

    const cacheKey = `${effectiveServerId}:${activePropertyPrefix}`;
    const cached = propertiesCacheRef.current[cacheKey];
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setCurrentProperties(cached.values);
      setIsLoadingProperties(false);
      return;
    }

    let cancelled = false;
    setIsLoadingProperties(true);
    setCurrentProperties([]);

    backendRpc.alfresco.search
      .propertiesByPrefix(effectiveServerId, baseUrl, activePropertyPrefix)
      .then(props => {
        if (cancelled) return;
        setCurrentProperties(props);
        propertiesCacheRef.current[cacheKey] = { values: props, timestamp: Date.now() };
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load properties', error);
        setCurrentProperties([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProperties(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveServerId, baseUrl, activePropertyPrefix, isDisabled]);

  useEffect(() => {
    if (!effectiveServerId || !baseUrl || !activeClassPrefix || isDisabled) {
      setCurrentClasses({ types: [], aspects: [], containers: [] });
      setIsLoadingClasses(false);
      return;
    }

    const cacheKey = `${effectiveServerId}:${activeClassPrefix}`;
    const cached = classesCacheRef.current[cacheKey];
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const safeValue = {
        ...cached.values,
        containers: cached.values.containers ?? [],
      };
      setCurrentClasses(safeValue);
      classesCacheRef.current[cacheKey] = { values: safeValue, timestamp: cached.timestamp };
      setIsLoadingClasses(false);
      return;
    }

    let cancelled = false;
    setIsLoadingClasses(true);
    setCurrentClasses({ types: [], aspects: [], containers: [] });

    backendRpc.alfresco.search
      .classesByPrefix(effectiveServerId, baseUrl, activeClassPrefix)
      .then(classes => {
        if (cancelled) return;
        const safe: { types: string[]; aspects: string[]; containers: string[] } = {
          types: classes?.types ?? [],
          aspects: classes?.aspects ?? [],
          containers: classes?.containers ?? [],
        };
        setCurrentClasses(safe);
        classesCacheRef.current[cacheKey] = { values: safe, timestamp: Date.now() };
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load classes', error);
        setCurrentClasses({ types: [], aspects: [], containers: [] });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingClasses(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeClassPrefix, baseUrl, effectiveServerId, isDisabled]);

  // Fetch paths when typing path:something
  useEffect(() => {
    const normalized = inputValue.trim().toLowerCase();
    if (!normalized.startsWith('path:')) {
      setPathSearchResults([]);
      setIsLoadingPaths(false);
      return;
    }

    const term = normalized.slice(5).trim();
    if (term.length < 2) {
      // Don't search for very short terms
      setPathSearchResults([]);
      setIsLoadingPaths(false);
      return;
    }

    if (isDisabled) {
      setPathSearchResults([]);
      setIsLoadingPaths(false);
      return;
    }

    if (selectedServers.length === 0) {
      setPathSearchResults([]);
      setIsLoadingPaths(false);
      return;
    }

    let cancelled = false;
    setIsLoadingPaths(true);

    const fetchPaths = async () => {
      try {
        const responses = await Promise.all(
          selectedServers.map(server =>
            backendRpc.alfresco.search
              .searchPaths(server.id, server.baseUrl, term)
              .then(results =>
                results.map(result => ({
                  path: result.path,
                  qnamePath: result.qnamePath,
                  name: result.name,
                  serverId: server.id,
                  serverName: server.name,
                }))
              )
              .catch(error => {
                console.error('Failed to load paths', { server: server.name, error });
                return [];
              })
          )
        );

        if (!cancelled) {
          setPathSearchResults(responses.flat());
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPaths(false);
        }
      }
    };

    fetchPaths();

    return () => {
      cancelled = true;
    };
  }, [selectedServers, inputValue, isDisabled]);

  // Function to refetch search history
  const refetchSearchHistory = () => {
    backendRpc.searchHistory
      .list({ limit: 5 })
      .then(history => {
        setSearchHistory(history);
      })
      .catch(error => {
        console.error('Failed to refresh search history:', error);
      });
  };

  // Fetch search history on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoadingHistory(true);

    backendRpc.searchHistory
      .list({ limit: 5 })
      .then(history => {
        if (!cancelled) {
          setSearchHistory(history);
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('Failed to load search history:', error);
          setSearchHistory([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const typeCandidates = useMemo(() => {
    const values = new Set<string>();
    dictionary.types.forEach(type => values.add(type));
    currentClasses.types.forEach(type => values.add(type));
    return Array.from(values);
  }, [currentClasses.types, dictionary.types]);

  const aspectCandidates = useMemo(() => {
    const values = new Set<string>();
    dictionary.aspects.forEach(aspect => values.add(aspect));
    currentClasses.aspects.forEach(aspect => values.add(aspect));
    return Array.from(values);
  }, [currentClasses.aspects, dictionary.aspects]);

  const defaultSuggestions = useMemo<SuggestionGroup[]>(() => {
    const prefixItems: SuggestionItem[] = [
      {
        value: 'prefix::type',
        label: t('prefixType'),
        kind: 'prefix',
        description: t('descriptionType'),
        meta: { insert: 'type:' },
      },
      {
        value: 'prefix::aspect',
        label: t('prefixAspect'),
        kind: 'prefix',
        description: t('descriptionAspect'),
        meta: { insert: 'aspect:' },
      },
      {
        value: 'prefix::prop',
        label: t('prefixProp'),
        kind: 'prefix',
        description: t('descriptionProp'),
        meta: { insert: 'prop:' },
      },
      {
        value: 'prefix::site',
        label: t('prefixSite'),
        kind: 'prefix',
        description: t('descriptionSite'),
        meta: { insert: 'site:' },
      },
      {
        value: 'prefix::path',
        label: t('prefixPath'),
        kind: 'prefix',
        description: t('descriptionPath'),
        meta: { insert: 'path:' },
      },
    ];

    const operatorItems: SuggestionItem[] = ['AND', 'OR', 'NOT'].map(op => ({
      value: `operator::${op}`,
      label: op,
      kind: 'operator',
      description: undefined,
      meta: { value: op },
    }));

    return [
      {
        group: t('groupSearchOptions'),
        items: [...prefixItems, ...operatorItems],
      },
    ];
  }, [t]);

  const suggestions = useMemo<SuggestionGroup[]>(() => {
    if (pendingPropField) {
      return [];
    }

    const normalized = inputValue.trim().toLowerCase();
    if (!normalized) {
      const groups: SuggestionGroup[] = [];

      // Add default suggestions first
      groups.push(...defaultSuggestions);

      // Add search history after search options
      if (isLoadingHistory) {
        groups.push({
          group: t('groupSearchHistory'),
          items: [
            {
              value: 'loading::history',
              label: t('loadingHistory'),
              kind: 'text',
            },
          ],
        });
      } else if (searchHistory.length > 0) {
        groups.push({
          group: t('groupSearchHistory'),
          items: searchHistory.map(item => ({
            value: `history::${item.id}`,
            label: item.query,
            kind: 'text',
            description: item.resultsCount !== null ? `${item.resultsCount} results` : undefined,
            meta: { query: item.query },
          })),
        });
      }

      return groups;
    }

    // Helper function to sort items by recency (recent first, then alphabetical)
    const sortByRecency = <T extends { label: string }>(items: T[], recentItems: string[]): T[] => {
      const recentSet = new Set(recentItems.map(item => item.toLowerCase()));
      const recent: T[] = [];
      const notRecent: T[] = [];

      items.forEach(item => {
        if (recentSet.has(item.label.toLowerCase())) {
          recent.push(item);
        } else {
          notRecent.push(item);
        }
      });

      // Sort recent items by their position in recentItems (most recent first)
      recent.sort((a, b) => {
        const aIndex = recentItems.findIndex(r => r.toLowerCase() === a.label.toLowerCase());
        const bIndex = recentItems.findIndex(r => r.toLowerCase() === b.label.toLowerCase());
        return aIndex - bIndex;
      });

      // Sort not recent items alphabetically
      notRecent.sort((a, b) => a.label.localeCompare(b.label));

      return [...recent, ...notRecent];
    };

    const groups: SuggestionGroup[] = [];

    const addPropertyMatches = (query: string, explicitPrefix?: string) => {
      const targetPrefix =
        explicitPrefix?.toLowerCase() ||
        (query.includes(':') ? query.split(':')[0].toLowerCase() + ':' : null);
      if (!targetPrefix) {
        return;
      }

      // Use current properties if they match the target prefix, otherwise fall back to dictionary
      let props: string[] = [];
      if (activePropertyPrefix === targetPrefix && currentProperties.length > 0) {
        props = currentProperties;
      } else {
        // Fall back to dictionary properties filtered by prefix
        const prefixLower = targetPrefix.toLowerCase();
        props = dictionary.properties.filter(prop => prop.toLowerCase().startsWith(prefixLower));
      }

      // Show loading indicator if we're fetching properties for this prefix (but still show dictionary props)
      const isLoading = isLoadingProperties && activePropertyPrefix === targetPrefix;

      // If no properties at all, return early
      if (props.length === 0) {
        return;
      }

      const lowerQuery = query.toLowerCase();
      // If query is exactly the prefix (e.g., "cm:"), show all properties starting with that prefix
      // Otherwise, filter by the full query
      let items = props
        .filter(prop => {
          const propLower = prop.toLowerCase();
          if (lowerQuery === targetPrefix) {
            // Show all properties starting with the prefix
            return propLower.startsWith(targetPrefix);
          }
          // Filter by the query (e.g., "cm:title" includes "cm:tit")
          return propLower.includes(lowerQuery);
        })
        .map<SuggestionItem>(prop => ({
          value: `prop::${prop}`,
          label: prop,
          kind: 'prop',
          meta: { field: prop },
        }));

      // Sort by recency and limit to 50
      items = sortByRecency(items, recentProps).slice(0, 50);

      // Add loading indicator at the top if loading
      if (isLoading && items.length > 0) {
        items = [
          {
            value: `loading::${targetPrefix}`,
            label: t('loadingProperties', { prefix: targetPrefix }),
            kind: 'prop',
          },
          ...items,
        ];
      } else if (isLoading && items.length === 0) {
        // Only show loading if no items at all
        items = [
          {
            value: `loading::${targetPrefix}`,
            label: t('loadingProperties', { prefix: targetPrefix }),
            kind: 'prop',
          },
        ];
      }

      groups.push({
        group: t('groupProperties'),
        items,
      });
    };

    if (normalized.startsWith('type:')) {
      const term = normalized.slice(5);
      const targetPrefix = term.endsWith(':')
        ? term.toLowerCase()
        : (term.match(/^([a-z0-9_-]+:)/)?.[1]?.toLowerCase() ?? null);
      let items: SuggestionItem[];

      // Check if term ends with ':' (namespace prefix like "cm:", "diva:")
      if (term.endsWith(':')) {
        const prefix = term.toLowerCase();
        // Show all types starting with this prefix
        items = typeCandidates
          .filter(type => type.toLowerCase().startsWith(prefix))
          .map<SuggestionItem>(type => ({
            value: `type::${type}`,
            label: type,
            kind: 'type',
            meta: { value: type },
          }));
      } else {
        // Filter by the term (partial match)
        items = typeCandidates
          .filter(type => type.toLowerCase().includes(term.toLowerCase()))
          .map<SuggestionItem>(type => ({
            value: `type::${type}`,
            label: type,
            kind: 'type',
            meta: { value: type },
          }));
      }

      // Sort by recency and limit to 50
      items = sortByRecency(items, recentTypes).slice(0, 50);

      if (isLoadingClasses && targetPrefix && targetPrefix === activeClassPrefix) {
        const loadingLabel = t('loadingTypes', { prefix: targetPrefix });
        const loadingItem: SuggestionItem = {
          value: `loading::types::${targetPrefix}`,
          label: loadingLabel,
          kind: 'type',
        };
        items = items.length > 0 ? [loadingItem, ...items] : [loadingItem];
      }

      groups.push({ group: t('groupTypes'), items });
      return groups;
    }

    if (normalized.startsWith('aspect:')) {
      const term = normalized.slice(7);
      const targetPrefix = term.endsWith(':')
        ? term.toLowerCase()
        : (term.match(/^([a-z0-9_-]+:)/)?.[1]?.toLowerCase() ?? null);
      let items: SuggestionItem[];

      // Check if term ends with ':' (namespace prefix like "cm:", "diva:")
      if (term.endsWith(':')) {
        const prefix = term.toLowerCase();
        // Show all aspects starting with this prefix
        items = aspectCandidates
          .filter(aspect => aspect.toLowerCase().startsWith(prefix))
          .map<SuggestionItem>(aspect => ({
            value: `aspect::${aspect}`,
            label: aspect,
            kind: 'aspect',
            meta: { value: aspect },
          }));
      } else {
        // Filter by the term (partial match)
        items = aspectCandidates
          .filter(aspect => aspect.toLowerCase().includes(term.toLowerCase()))
          .map<SuggestionItem>(aspect => ({
            value: `aspect::${aspect}`,
            label: aspect,
            kind: 'aspect',
            meta: { value: aspect },
          }));
      }

      // Sort by recency and limit to 50
      items = sortByRecency(items, recentAspects).slice(0, 50);

      if (isLoadingClasses && targetPrefix && targetPrefix === activeClassPrefix) {
        const loadingLabel = t('loadingAspects', { prefix: targetPrefix });
        const loadingItem: SuggestionItem = {
          value: `loading::aspects::${targetPrefix}`,
          label: loadingLabel,
          kind: 'aspect',
        };
        items = items.length > 0 ? [loadingItem, ...items] : [loadingItem];
      }

      groups.push({ group: t('groupAspects'), items });
      return groups;
    }

    if (normalized.startsWith('site:')) {
      const term = normalized.slice(5);
      const items = dictionary.sites
        .filter(site => site.toLowerCase().includes(term))
        .slice(0, 20)
        .map<SuggestionItem>(site => ({
          value: `site::${site}`,
          label: site,
          kind: 'site',
          meta: { value: site },
        }));
      groups.push({ group: t('groupSites'), items });
      return groups;
    }

    if (normalized.startsWith('path:')) {
      const term = normalized.slice(5);

      // Show loading state
      if (isLoadingPaths) {
        groups.push({
          group: t('groupPaths'),
          items: [
            {
              value: 'loading::paths',
              label: t('loadingFolders'),
              kind: 'path',
            },
          ],
        });
        return groups;
      }

      // Show path search results
      if (pathSearchResults.length > 0) {
        const items = pathSearchResults
          .filter(result => result.name.toLowerCase().includes(term.toLowerCase()))
          .slice(0, 20)
          .map<SuggestionItem>(result => ({
            value: `path::${result.path}`,
            label: result.name,
            kind: 'path',
            description: result.path,
            meta: {
              path: result.path,
              qnamePath: result.qnamePath,
              name: result.name,
              serverName: result.serverName,
            },
          }));
        if (items.length > 0) {
          groups.push({ group: t('groupPaths'), items });
        }
      }
      return groups;
    }

    if (normalized.startsWith('prop:')) {
      const query = normalized.slice(5);
      // If query is empty, show all properties for default prefix
      if (query.trim() === '') {
        addPropertyMatches(defaultPropPrefix, defaultPropPrefix);
      } else {
        // Check if query contains a namespace prefix (e.g., "cm:", "diva:")
        const prefixMatch = query.match(/^([a-z0-9_-]+:)/i);
        if (prefixMatch) {
          const detectedPrefix = prefixMatch[1].toLowerCase();
          // If query ends with ':', show all properties for that prefix
          // Otherwise, filter properties starting with that prefix by the remaining query
          if (query.endsWith(':')) {
            addPropertyMatches(detectedPrefix, detectedPrefix);
          } else {
            addPropertyMatches(query, detectedPrefix);
          }
        } else {
          // No prefix detected, use default prefix and filter by query
          addPropertyMatches(query, defaultPropPrefix);
        }
      }
      return groups;
    }

    if (/^[a-z0-9_-]+:/.test(normalized)) {
      // When typing a namespace prefix like "cm:" without type:/aspect:/prop:,
      // show all types, aspects, and properties starting with that prefix
      const prefix = normalized.toLowerCase();

      // Add types
      let typeItems = typeCandidates
        .filter(type => type.toLowerCase().startsWith(prefix))
        .map<SuggestionItem>(type => ({
          value: `type::${type}`,
          label: type,
          kind: 'type',
          meta: { value: type },
        }));
      typeItems = sortByRecency(typeItems, recentTypes).slice(0, 50);
      if (typeItems.length > 0) {
        groups.push({ group: t('groupTypes'), items: typeItems });
      }

      // Add aspects
      let aspectItems = aspectCandidates
        .filter(aspect => aspect.toLowerCase().startsWith(prefix))
        .map<SuggestionItem>(aspect => ({
          value: `aspect::${aspect}`,
          label: aspect,
          kind: 'aspect',
          meta: { value: aspect },
        }));
      aspectItems = sortByRecency(aspectItems, recentAspects).slice(0, 50);
      if (aspectItems.length > 0) {
        groups.push({ group: t('groupAspects'), items: aspectItems });
      }

      // Add properties
      addPropertyMatches(normalized);

      return groups;
    }

    // Check for operator matches (and, or, not)
    const operatorKeywords = ['and', 'or', 'not'];
    const matchingOperators = operatorKeywords
      .filter(op => op.startsWith(normalized))
      .map<SuggestionItem>(op => ({
        value: `operator::${op.toUpperCase()}`,
        label: op.toUpperCase(),
        kind: 'operator',
        meta: { value: op.toUpperCase() },
      }));

    if (matchingOperators.length > 0) {
      groups.push({
        group: t('groupOperators'),
        items: matchingOperators,
      });
    }

    // Prefix suggestions that partially match
    const prefixMatches = defaultSuggestions[0].items
      .filter(item => item.kind === 'prefix' && item.label.startsWith(normalized))
      .map(item => ({ ...item }));

    if (prefixMatches.length > 0) {
      groups.push({
        group: t('groupSearchOptions'),
        items: prefixMatches,
      });
    }

    return groups;
  }, [
    pendingPropField,
    inputValue,
    dictionary.properties,
    dictionary.sites,
    defaultSuggestions,
    currentProperties,
    isLoadingProperties,
    activePropertyPrefix,
    defaultPropPrefix,
    pathSearchResults,
    isLoadingPaths,
    recentTypes,
    recentAspects,
    recentProps,
    typeCandidates,
    aspectCandidates,
    isLoadingClasses,
    activeClassPrefix,
    t,
    isLoadingHistory,
    searchHistory,
  ]);

  const flatSuggestions = useMemo(() => suggestions.flatMap(group => group.items), [suggestions]);

  const suggestionMap = useMemo(() => {
    const map = new Map<string, SuggestionItem>();
    flatSuggestions.forEach((item, index) => {
      map.set(item.value, { ...item, meta: { ...item.meta, index: String(index) } });
    });
    return map;
  }, [flatSuggestions]);

  const addToken = (token: SearchToken) => {
    if (!token.value) {
      return;
    }
    setTokens(prev => [...prev, token]);
    // Auto-scroll after adding token
    scrollToInput();
  };

  const buildQueryString = (currentTokens: SearchToken[]) =>
    currentTokens.map(token => token.value).join(' ');

  const handleSearchSubmit = () => {
    if (isDisabled) {
      return;
    }
    if (pendingPropField) {
      return;
    }
    if (tokens.length === 0) {
      return;
    }
    if (selectedServers.length === 0) {
      return;
    }
    onSearch?.(buildQueryString(tokens), selectedServers);
    // Refetch search history after a short delay to allow backend to save
    setTimeout(() => {
      refetchSearchHistory();
    }, 500);
  };

  const startPendingProp = (field: string) => {
    if (isDisabled) {
      return;
    }
    setPendingPropField(field);
    setPendingPropValue('');
    setInputValue('');
    combobox.closeDropdown();
  };

  const cancelPendingProp = () => {
    setPendingPropField(null);
    setPendingPropValue('');
    // Return focus to main search input
    setTimeout(() => {
      mainInputRef.current?.focus();
      combobox.openDropdown();
    }, 0);
  };

  const finalizePendingProp = () => {
    if (isDisabled || !pendingPropField) {
      return;
    }
    const trimmed = pendingPropValue.trim();
    if (!trimmed) {
      return;
    }
    addProp(pendingPropField);
    const { label, query } = formatPropQuery(pendingPropField, trimmed);
    addToken({
      id: randomId(),
      kind: 'prop',
      label,
      value: query,
      field: pendingPropField,
      rawValue: trimmed,
    });
    setPendingPropField(null);
    setPendingPropValue('');
    // Return focus to main search input
    setTimeout(() => {
      mainInputRef.current?.focus();
      combobox.openDropdown();
    }, 0);
  };

  const handleSuggestionSelect = (val: string) => {
    if (isDisabled) {
      return;
    }
    const item = suggestionMap.get(val);
    if (!item) {
      handleFreeformSubmit(val);
      return;
    }

    switch (item.kind) {
      case 'prefix':
        setInputValue(item.meta?.insert ?? item.label);
        combobox.openDropdown();
        combobox.updateSelectedOptionIndex();
        return;
      case 'type': {
        const typeValue = item.meta?.value ?? item.label;
        addType(typeValue);
        addToken(formatSimpleToken(item.kind, typeValue));
        break;
      }
      case 'aspect': {
        const aspectValue = item.meta?.value ?? item.label;
        addAspect(aspectValue);
        addToken(formatSimpleToken(item.kind, aspectValue));
        break;
      }
      case 'site': {
        const siteValue = item.meta?.value ?? item.label;
        addToken(formatSimpleToken(item.kind, siteValue));
        break;
      }
      case 'operator': {
        const opValue = item.meta?.value ?? item.label;
        addToken(formatSimpleToken(item.kind, opValue));
        break;
      }
      case 'prop': {
        const propValue = item.meta?.field ?? item.label;
        addProp(propValue);
        startPendingProp(propValue);
        return;
      }
      case 'path': {
        // Add path token with default depth (deep)
        const pathValue = item.meta?.path ?? item.label;
        const qnamePath = item.meta?.qnamePath;
        addToken(formatPathToken(pathValue, 'deep', t, qnamePath));
        break;
      }
      case 'text': {
        // Handle search history items - submit the stored query directly
        if (item.meta?.query) {
          // Clear current tokens and input
          setTokens([]);
          setInputValue('');
          combobox.closeDropdown();
          // Trigger search with the stored query
          if (selectedServers.length > 0) {
            onSearch?.(item.meta.query, selectedServers);
            // Refetch search history after a short delay
            setTimeout(() => {
              refetchSearchHistory();
            }, 500);
          }
          return;
        }
        // Fallback to treating it as a text search
        addToken(formatSimpleToken(item.kind, item.label));
        break;
      }
      default:
        break;
    }

    setInputValue('');
    combobox.closeDropdown();
    // Keep focus in search input after adding token
    setTimeout(() => {
      mainInputRef.current?.focus();
      combobox.openDropdown();
    }, 0);
  };

  const handleTokenRemove = (id: string) => {
    setTokens(prev => prev.filter(token => token.id !== id));
  };

  const handlePathDepthChange = (tokenId: string, newDepth: PathDepth) => {
    setTokens(prev =>
      prev.map(token => {
        if (token.id === tokenId && token.kind === 'path' && token.pathValue) {
          const newToken = formatPathToken(token.pathValue, newDepth, t, token.qnamePath);
          // Preserve the original token ID so React can properly update it
          return { ...newToken, id: token.id };
        }
        return token;
      })
    );
  };

  const handleFreeformSubmit = (raw?: string) => {
    if (isDisabled) {
      return;
    }
    const value = (raw ?? inputValue).trim();
    if (!value) {
      handleSearchSubmit();
      return;
    }

    const lower = value.toLowerCase();

    // Check for operators (and, or, not)
    if (lower === 'and' || lower === 'or' || lower === 'not') {
      addToken(formatSimpleToken('operator', lower.toUpperCase()));
      setInputValue('');
      setTimeout(() => {
        mainInputRef.current?.focus();
        combobox.openDropdown();
      }, 0);
      return;
    }

    if (lower.startsWith('type:')) {
      const typeValue = value.slice(5);
      addType(typeValue);
      addToken(formatSimpleToken('type', typeValue));
      setInputValue('');
      return;
    }

    if (lower.startsWith('aspect:')) {
      const aspectValue = value.slice(7);
      addAspect(aspectValue);
      addToken(formatSimpleToken('aspect', aspectValue));
      setInputValue('');
      return;
    }

    if (lower.startsWith('site:')) {
      addToken(formatSimpleToken('site', value.slice(5)));
      setInputValue('');
      return;
    }

    // Parse path:folder/* or path:folder//*
    const pathMatch = value.match(/^path:(.+?)(\/\*|\/\/\*)?$/i);
    if (pathMatch) {
      const [, pathValue, wildcard] = pathMatch;
      // If /* is specified, use immediate; otherwise default to deep
      const depth: PathDepth = wildcard === '/*' ? 'immediate' : 'deep';
      addToken(formatPathToken(pathValue.trim(), depth, t));
      setInputValue('');
      return;
    }

    const propMatch = value.match(/^([a-z0-9_-]+:[^:]+):(.*)$/i);
    if (propMatch) {
      const [, field, propValue] = propMatch;
      if (propValue.trim()) {
        addProp(field);
        const { label, query } = formatPropQuery(field, propValue.trim());
        addToken({
          id: randomId(),
          kind: 'prop',
          label,
          value: query,
          field,
          rawValue: propValue.trim(),
        });
        setInputValue('');
        return;
      }
      startPendingProp(field);
      return;
    }

    addToken(formatSimpleToken('text', value));
    setInputValue('');
    combobox.closeDropdown();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDisabled) {
      return;
    }
    if (pendingPropField) {
      return;
    }

    if (event.key === 'Tab' && combobox.dropdownOpened && flatSuggestions.length > 0) {
      event.preventDefault();
      let index = combobox.getSelectedOptionIndex();
      // If no option is selected, use the first one
      if (index < 0) {
        index = 0;
      }
      const target = flatSuggestions[index];
      if (target) {
        handleSuggestionSelect(target.value);
      }
      return;
    }

    if (event.key === 'Backspace' && inputValue.length === 0 && tokens.length > 0) {
      event.preventDefault();
      setTokens(prev => prev.slice(0, -1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (combobox.dropdownOpened && flatSuggestions.length > 0) {
        const index = combobox.getSelectedOptionIndex();
        if (index >= 0) {
          const target = flatSuggestions[index];
          if (target) {
            handleSuggestionSelect(target.value);
            return;
          }
        }
      }
      handleFreeformSubmit();
    }
  };

  const handlePendingKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDisabled) {
      return;
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      finalizePendingProp();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelPendingProp();
      return;
    }
    if (event.key === 'Backspace' && pendingPropValue.length === 0) {
      event.preventDefault();
      cancelPendingProp();
    }
  };

  return (
    <Combobox store={combobox} onOptionSubmit={handleSuggestionSelect} withinPortal={false}>
      <Combobox.DropdownTarget>
        <PillsInput
          onClick={() => {
            if (!isDisabled) {
              combobox.openDropdown();
            }
          }}
          leftSection={<IconSearch size={16} />}
          rightSection={!isDisabled && loading ? <Loader size={16} /> : undefined}
          style={{
            width: '100%',
            minWidth: 200,
            maxWidth: 400,
            cursor: isDisabled ? 'not-allowed' : undefined,
            opacity: isDisabled ? 0.6 : 1,
          }}
          styles={{
            input: {
              backgroundColor: isDark
                ? 'var(--mantine-color-dark-6)'
                : 'var(--mantine-color-gray-0)',
            },
          }}
          aria-disabled={isDisabled}
        >
          <div
            ref={scrollContainerRef}
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              gap: 8,
              width: '100%',
              alignItems: 'center',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <Pill.Group style={{ display: 'flex', flexWrap: 'nowrap', gap: 8 }}>
              {tokens.map(token => {
                if (token.kind === 'path') {
                  return (
                    <Group
                      key={token.id}
                      gap={4}
                      align="center"
                      wrap="nowrap"
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <Pill
                        withRemoveButton
                        onRemove={() => handleTokenRemove(token.id)}
                        styles={{
                          root: {
                            borderRadius: '4px',
                            backgroundColor: isDark
                              ? 'var(--mantine-color-dark-5)'
                              : 'var(--mantine-color-gray-2)',
                            color: isDark
                              ? 'var(--mantine-color-gray-0)'
                              : 'var(--mantine-color-gray-9)',
                          },
                        }}
                      >
                        <Text size="sm">{token.pathValue}</Text>
                      </Pill>
                      <div
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <Tooltip
                          label={token.pathDepth === 'deep' ? t('depthDeep') : t('depthImmediate')}
                        >
                          <Checkbox
                            checked={token.pathDepth === 'deep'}
                            onChange={event => {
                              handlePathDepthChange(
                                token.id,
                                event.currentTarget.checked ? 'deep' : 'immediate'
                              );
                            }}
                            size="xs"
                            style={{ flexShrink: 0 }}
                          />
                        </Tooltip>
                      </div>
                    </Group>
                  );
                }

                return (
                  <Pill
                    key={token.id}
                    withRemoveButton
                    onRemove={() => handleTokenRemove(token.id)}
                    styles={{
                      root: {
                        borderRadius: '4px',
                        backgroundColor: isDark
                          ? 'var(--mantine-color-dark-5)'
                          : 'var(--mantine-color-gray-2)',
                        color: isDark
                          ? 'var(--mantine-color-gray-0)'
                          : 'var(--mantine-color-gray-9)',
                      },
                    }}
                  >
                    {token.label}
                  </Pill>
                );
              })}

              {pendingPropField && (
                <Pill
                  withRemoveButton
                  onRemove={cancelPendingProp}
                  styles={{
                    root: {
                      borderRadius: '4px',
                      backgroundColor: isDark
                        ? 'var(--mantine-color-dark-5)'
                        : 'var(--mantine-color-gray-2)',
                      color: isDark ? 'var(--mantine-color-gray-0)' : 'var(--mantine-color-gray-9)',
                    },
                  }}
                >
                  <Group gap={6} align="center">
                    <Text fw={600}>{pendingPropField}</Text>
                    <Text>=</Text>
                    <input
                      ref={pendingInputRef}
                      value={pendingPropValue}
                      onChange={event => setPendingPropValue(event.currentTarget.value)}
                      onKeyDown={handlePendingKeyDown}
                      placeholder={t('placeholderValue')}
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        minWidth: 80,
                      }}
                      disabled={isDisabled}
                      onBlur={() => {
                        if (isDisabled) {
                          return;
                        }
                        if (pendingPropValue.trim()) {
                          finalizePendingProp();
                        } else {
                          cancelPendingProp();
                        }
                      }}
                    />
                  </Group>
                </Pill>
              )}

              <Combobox.EventsTarget>
                <PillsInput.Field
                  ref={mainInputRef}
                  value={inputValue}
                  onChange={event => {
                    if (isDisabled) {
                      return;
                    }
                    setInputValue(event.currentTarget.value);
                    combobox.openDropdown();
                    scrollToInput();
                  }}
                  onFocus={() => {
                    if (isDisabled) {
                      return;
                    }
                    combobox.openDropdown();
                    scrollToInput();
                  }}
                  onBlur={() => {
                    if (!isDisabled) {
                      combobox.closeDropdown();
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    tokens.length === 0 && !pendingPropField
                      ? isDisabled
                        ? t('common:noServers')
                        : (placeholder ?? t('placeholder'))
                      : undefined
                  }
                  disabled={Boolean(pendingPropField) || isDisabled}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={{
                    minWidth: 140,
                    flex: '0 0 auto',
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </div>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown
        styles={{
          dropdown: {
            maxHeight: 400,
            overflowY: 'auto',
          },
        }}
      >
        <Combobox.Options>
          {suggestions.length > 0 ? (
            suggestions.map(group => (
              <Combobox.Group label={group.group} key={group.group}>
                {group.items.map(item => {
                  // Special layout for path items: name on top, path below
                  if (item.kind === 'path' && item.description) {
                    return (
                      <Combobox.Option value={item.value} key={item.value}>
                        <Stack gap={4}>
                          <Group justify="space-between" gap="xs" wrap="nowrap">
                            <Text size="sm" fw={500} truncate="end">
                              {item.label}
                            </Text>
                            {multiServerEnabled && item.meta?.serverName && (
                              <Badge size="xs" radius="xl" variant="light" color="gray">
                                {item.meta.serverName}
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed" truncate="end" style={{ lineHeight: 1.2 }}>
                            {item.description}
                          </Text>
                        </Stack>
                      </Combobox.Option>
                    );
                  }

                  // Default layout for other items
                  return (
                    <Combobox.Option value={item.value} key={item.value}>
                      <Group gap="sm" justify="space-between" wrap="nowrap">
                        <Tooltip label={item.label} withArrow position="top" withinPortal>
                          <Text size="sm" truncate="end" style={{ flex: 1, minWidth: 0 }}>
                            {item.label}
                          </Text>
                        </Tooltip>
                        {item.description && (
                          <Text size="xs" c="dimmed" style={{ textAlign: 'right', flexShrink: 0 }}>
                            {item.description}
                          </Text>
                        )}
                      </Group>
                    </Combobox.Option>
                  );
                })}
              </Combobox.Group>
            ))
          ) : (
            <Combobox.Empty>{t('noSuggestions')}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
