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

import { AlfrescoApi, AspectsApi, SitesApi, TypesApi, WebscriptApi } from '@alfresco/js-api';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('alfresco.dictionary');
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface DictionaryData {
  types: string[];
  aspects: string[];
  sites: string[];
  propertiesByPrefix: Record<string, string[]>;
  propertyDataTypesByPrefix: Record<string, Record<string, string>>;
  classesByPrefix: Record<string, { types: string[]; aspects: string[]; containers: string[] }>;
  fetchedAt: number;
}

const cache = new Map<number, DictionaryData>();

async function fetchAllTypes(api: AlfrescoApi): Promise<string[]> {
  const typesApi = new TypesApi(api);
  const names = new Set<string>();

  let skipCount = 0;
  const maxItems = 200;
  let hasMore = true;

  while (hasMore) {
    const response = await typesApi.listTypes({
      skipCount,
      maxItems,
    });
    const entries = response.list?.entries || [];
    entries.forEach((entry: any) => {
      const id = entry?.entry?.id || entry?.entry?.prefixedName || entry?.entry?.name?.prefixedName;
      if (id) {
        names.add(id);
      }
    });
    hasMore = Boolean(response.list?.pagination?.hasMoreItems);
    skipCount += maxItems;
    if (!hasMore) {
      break;
    }
  }

  return Array.from(names).sort();
}

async function fetchAllAspects(api: AlfrescoApi): Promise<string[]> {
  const aspectsApi = new AspectsApi(api);
  const names = new Set<string>();

  let skipCount = 0;
  const maxItems = 200;
  let hasMore = true;

  while (hasMore) {
    const response = await aspectsApi.listAspects({
      skipCount,
      maxItems,
    });
    const entries = response.list?.entries || [];
    entries.forEach((entry: any) => {
      const id = entry?.entry?.id || entry?.entry?.prefixedName || entry?.entry?.name?.prefixedName;
      if (id) {
        names.add(id);
      }
    });
    hasMore = Boolean(response.list?.pagination?.hasMoreItems);
    skipCount += maxItems;
    if (!hasMore) {
      break;
    }
  }

  return Array.from(names).sort();
}

async function fetchSites(api: AlfrescoApi): Promise<string[]> {
  const sitesApi = new SitesApi(api);
  const sites: string[] = [];
  let skipCount = 0;
  const maxItems = 200;
  let hasMore = true;

  while (hasMore) {
    const response = await sitesApi.listSites({ maxItems, skipCount });
    const entries = response.list?.entries || [];
    entries.forEach((entry: any) => {
      const id = entry?.entry?.id;
      if (id) {
        sites.push(id);
      }
    });
    hasMore = Boolean(response.list?.pagination?.hasMoreItems);
    skipCount += maxItems;
    if (!hasMore) {
      break;
    }
  }

  return sites.sort();
}

function extractPropertyDataType(propertyDef: any): string | null {
  if (!propertyDef || typeof propertyDef !== 'object') {
    return null;
  }

  const candidates = [
    propertyDef.dataType,
    propertyDef.dataType?.name,
    propertyDef.dataType?.prefixedName,
    propertyDef.dataTypeQName,
    propertyDef.type,
    propertyDef.type?.name,
    propertyDef.type?.prefixedName,
    propertyDef.propertyType,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

async function ensureDictionary(api: AlfrescoApi, serverId: number): Promise<DictionaryData> {
  const cached = cache.get(serverId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    // In case cache was created before classesByPrefix was introduced
    if (!cached.classesByPrefix) {
      cached.classesByPrefix = {};
    }
    if (!cached.propertyDataTypesByPrefix) {
      cached.propertyDataTypesByPrefix = {};
    }
    return cached;
  }

  log.info({ serverId }, 'Refreshing Alfresco dictionary cache');

  try {
    const [types, aspects, sites] = await Promise.all([
      fetchAllTypes(api),
      fetchAllAspects(api),
      fetchSites(api),
    ]);

    const entry: DictionaryData = {
      types,
      aspects,
      sites,
      propertiesByPrefix: {},
      propertyDataTypesByPrefix: {},
      classesByPrefix: {},
      fetchedAt: Date.now(),
    };

    // Pre-warm common prefixes with empty arrays (will be filled on demand)
    const commonPrefixes = ['cm:', 'sys:', 'app:', 'fm:', 'rna:', 'audio:'];
    for (const p of commonPrefixes) {
      entry.propertiesByPrefix[p.toLowerCase()] = [];
      entry.propertyDataTypesByPrefix[p.toLowerCase()] = {};
      entry.classesByPrefix[p.toLowerCase()] = { types: [], aspects: [], containers: [] };
    }

    cache.set(serverId, entry);
    return entry;
  } catch (error) {
    log.error({ serverId, error }, 'Failed to refresh dictionary data');
    if (cached) {
      return {
        ...cached,
        propertyDataTypesByPrefix: cached.propertyDataTypesByPrefix ?? {},
        classesByPrefix: cached.classesByPrefix ?? {},
      };
    }
    return {
      types: [],
      aspects: [],
      sites: [],
      propertiesByPrefix: {},
      propertyDataTypesByPrefix: {},
      classesByPrefix: {},
      fetchedAt: Date.now(),
    };
  }
}

export async function getSearchDictionary(
  api: AlfrescoApi,
  serverId: number
): Promise<{
  types: string[];
  aspects: string[];
  sites: string[];
  properties: string[];
  propertyDataTypes: Record<string, string>;
}> {
  const cacheEntry = await ensureDictionary(api, serverId);

  let properties: string[] = [];

  // Always load cm: synchronously — it's critical for search UX
  // Check if cm: properties are already loaded (not just pre-warmed empty array)
  const cmProperties = cacheEntry.propertiesByPrefix['cm:'];
  if (!cmProperties || cmProperties.length === 0) {
    try {
      log.info({ serverId }, 'Loading cm: properties synchronously for search dictionary');
      properties = await getPropertiesByPrefix(api, serverId, 'cm:');
    } catch (error) {
      log.warn({ serverId, error }, 'Failed to load cm: properties during dictionary fetch');
      properties = [];
    }
  } else {
    // Use cached properties
    properties = cmProperties;
  }

  // Background load other common prefixes for better performance
  ['sys:', 'app:', 'fm:', 'rna:', 'audio:'].forEach(prefix => {
    getPropertiesByPrefix(api, serverId, prefix).catch(() => {
      // Silently fail - this is just a background optimization
    });
  });

  return {
    types: cacheEntry.types,
    aspects: cacheEntry.aspects,
    sites: cacheEntry.sites,
    properties,
    propertyDataTypes: cacheEntry.propertyDataTypesByPrefix['cm:'] ?? {},
  };
}

export async function getPropertiesByPrefix(
  api: AlfrescoApi,
  serverId: number,
  prefix: string
): Promise<string[]> {
  const normalizedPrefix = prefix.toLowerCase(); // e.g. "cm:" or "my:custom:"
  const cacheEntry = await ensureDictionary(api, serverId);

  // Return cached version if exists and has data
  const cached = cacheEntry.propertiesByPrefix[normalizedPrefix];
  if (cached && cached.length > 0 && cacheEntry.classesByPrefix[normalizedPrefix]) {
    return cached;
  }

  log.info({ serverId, prefix }, 'Fetching properties for prefix using /s/api/classes endpoint');

  const propertySet = new Set<string>();
  const propertyDataTypes: Record<string, string> = {};
  const typeSet = new Set<string>();
  const aspectSet = new Set<string>();
  const containerSet = new Set<string>();

  try {
    // Use the webscript API endpoint /s/api/classes?nsp={namespacePrefix}
    // This is much more efficient than fetching each class individually
    const webscriptApi = new WebscriptApi(api);

    // Extract namespace prefix (e.g., "cm" from "cm:")
    const namespacePrefix = normalizedPrefix.replace(':', '');

    // Call the webscript endpoint: GET /alfresco/s/api/classes?nsp={namespacePrefix}
    // scriptPath: 'api/classes' (without /s/ prefix, servicePath handles that)
    // contextRoot: 'alfresco', servicePath: 'service' (makes /s/ which is shorthand for /service/)
    const scriptPath = 'api/classes';
    const scriptArgs = {
      nsp: namespacePrefix,
    };

    const response: any = await webscriptApi.executeWebScript(
      'GET',
      scriptPath,
      scriptArgs,
      'alfresco',
      'service'
    );

    // Response is an array of class definitions
    const classes = Array.isArray(response) ? response : [];

    log.info({ serverId, prefix, classCount: classes.length }, 'Received classes from API');

    // Extract properties from all classes
    for (const classDef of classes) {
      const className =
        typeof classDef?.name === 'string'
          ? classDef.name
          : typeof classDef?.name?.prefixedName === 'string'
            ? classDef.name.prefixedName
            : null;

      if (className && className.toLowerCase().startsWith(normalizedPrefix)) {
        if (classDef?.isAspect) {
          aspectSet.add(className);
        } else {
          typeSet.add(className);
          if (classDef?.isContainer) {
            containerSet.add(className);
          }
        }
      }

      if (classDef?.properties && typeof classDef.properties === 'object') {
        // Properties is an object with property names as keys
        for (const [propName, propertyDef] of Object.entries(classDef.properties)) {
          if (
            propName &&
            typeof propName === 'string' &&
            propName.toLowerCase().startsWith(normalizedPrefix)
          ) {
            propertySet.add(propName);
            const dataType = extractPropertyDataType(propertyDef);
            if (dataType) {
              propertyDataTypes[propName] = dataType;
            }
          }
        }
      }
    }

    log.info(
      { serverId, prefix, found: propertySet.size },
      'Finished fetching properties for prefix'
    );
  } catch (error) {
    log.error(
      { serverId, prefix, error },
      'Failed to fetch properties from /s/api/classes endpoint'
    );
    throw error;
  }

  const properties = Array.from(propertySet).sort();
  cacheEntry.classesByPrefix[normalizedPrefix] = {
    types: Array.from(typeSet).sort(),
    aspects: Array.from(aspectSet).sort(),
    containers: Array.from(containerSet).sort(),
  };
  cacheEntry.propertiesByPrefix[normalizedPrefix] = properties;
  cacheEntry.propertyDataTypesByPrefix[normalizedPrefix] = propertyDataTypes;
  return properties;
}

export async function getPropertyDataTypesByPrefix(
  api: AlfrescoApi,
  serverId: number,
  prefix: string
): Promise<Record<string, string>> {
  const normalizedPrefix = prefix.toLowerCase();
  const cacheEntry = await ensureDictionary(api, serverId);

  const cachedProperties = cacheEntry.propertiesByPrefix[normalizedPrefix];
  const cachedDataTypes = cacheEntry.propertyDataTypesByPrefix[normalizedPrefix];
  if (cachedProperties && cachedProperties.length > 0 && cachedDataTypes) {
    return cachedDataTypes;
  }

  await getPropertiesByPrefix(api, serverId, normalizedPrefix);
  return cacheEntry.propertyDataTypesByPrefix[normalizedPrefix] ?? {};
}

/**
 * Fetch raw class definitions from the Alfresco dictionary webscript.
 * When namespace is omitted, returns all classes.
 */
export async function getDictionaryClasses(
  api: AlfrescoApi,
  namespace?: string
): Promise<unknown[]> {
  const webscriptApi = new WebscriptApi(api);
  const normalizedNamespace = namespace?.trim().replace(/:$/, '') ?? '';
  const scriptArgs = normalizedNamespace ? { nsp: normalizedNamespace } : {};

  const response: unknown = await webscriptApi.executeWebScript(
    'GET',
    'api/classes',
    scriptArgs,
    'alfresco',
    'service'
  );

  return Array.isArray(response) ? response : [];
}

export async function getClassNamesByPrefix(
  api: AlfrescoApi,
  serverId: number,
  prefix: string
): Promise<{ types: string[]; aspects: string[]; containers: string[] }> {
  const normalizedPrefix = prefix.toLowerCase();
  const cacheEntry = await ensureDictionary(api, serverId);

  const cached = cacheEntry.classesByPrefix[normalizedPrefix];
  if (cached && (cached.types.length > 0 || cached.aspects.length > 0)) {
    return {
      types: cached.types,
      aspects: cached.aspects,
      containers: cached.containers ?? [],
    };
  }

  await getPropertiesByPrefix(api, serverId, normalizedPrefix);

  const entry = cacheEntry.classesByPrefix[normalizedPrefix] ?? {
    types: [],
    aspects: [],
    containers: [],
  };

  if (!entry.containers) {
    entry.containers = [];
  }

  return entry;
}

export interface DictionaryPropertyDetail {
  name: string;
  dataType?: string;
  mandatory?: boolean;
  multiValued?: boolean;
  indexed?: boolean;
  constraints: string[];
}

function toDictionaryPathSegment(qname: string): string {
  return qname.replace(':', '_');
}

/**
 * Turn Alfresco dictionary constraint objects into human-readable lines.
 */
function formatDictionaryConstraints(constraints: unknown): string[] {
  if (!Array.isArray(constraints)) {
    return [];
  }

  const formatted: string[] = [];

  for (const constraint of constraints) {
    if (!constraint || typeof constraint !== 'object') {
      continue;
    }

    const { type, parameters } = constraint as {
      type?: string;
      parameters?: unknown[];
    };

    if (!type) {
      continue;
    }

    const params = Array.isArray(parameters) ? parameters : [];

    if (type === 'LIST') {
      const allowedParam = params.find(
        param => param && typeof param === 'object' && 'allowedValues' in param
      ) as { allowedValues?: string[] } | undefined;
      const values = allowedParam?.allowedValues ?? [];
      if (values.length === 0) {
        formatted.push('LIST');
      } else if (values.length <= 6) {
        formatted.push(`LIST: ${values.join(', ')}`);
      } else {
        formatted.push(
          `LIST: ${values.slice(0, 5).join(', ')}, … (+${values.length - 5})`
        );
      }
      continue;
    }

    if (type === 'LENGTH') {
      let minLength = '0';
      let maxLength = '?';
      for (const param of params) {
        if (!param || typeof param !== 'object') {
          continue;
        }
        if ('minLength' in param) {
          minLength = String((param as { minLength: unknown }).minLength);
        }
        if ('maxLength' in param) {
          maxLength = String((param as { maxLength: unknown }).maxLength);
        }
      }
      formatted.push(`length: ${minLength}–${maxLength}`);
      continue;
    }

    if (type === 'REGEX') {
      const regexParam = params.find(
        param => param && typeof param === 'object' && 'expression' in param
      ) as { expression?: string } | undefined;
      formatted.push(`REGEX: ${regexParam?.expression ?? ''}`.trim());
      continue;
    }

    if (type === 'MINMAX') {
      let min = '?';
      let max = '?';
      for (const param of params) {
        if (!param || typeof param !== 'object') {
          continue;
        }
        if ('minValue' in param) {
          min = String((param as { minValue: unknown }).minValue);
        }
        if ('maxValue' in param) {
          max = String((param as { maxValue: unknown }).maxValue);
        }
      }
      formatted.push(`range: ${min}–${max}`);
      continue;
    }

    formatted.push(type);
  }

  return formatted;
}

function normalizePropertyDetail(
  propertyName: string,
  detail: Record<string, unknown>
): DictionaryPropertyDetail {
  const dataType =
    typeof detail.dataType === 'string'
      ? detail.dataType
      : typeof (detail.dataType as { name?: string })?.name === 'string'
        ? (detail.dataType as { name: string }).name
        : undefined;

  return {
    name: typeof detail.name === 'string' ? detail.name : propertyName,
    dataType,
    mandatory: detail.mandatory !== undefined ? Boolean(detail.mandatory) : undefined,
    multiValued: detail.multiValued !== undefined ? Boolean(detail.multiValued) : undefined,
    indexed: detail.indexed !== undefined ? Boolean(detail.indexed) : undefined,
    constraints: formatDictionaryConstraints(detail.constraints),
  };
}

/**
 * Fetch full property definitions (including constraints) for a class.
 * The bulk /api/classes response omits constraint details; they are only
 * available on per-property endpoints.
 */
export async function getDictionaryClassPropertyDetails(
  api: AlfrescoApi,
  className: string
): Promise<DictionaryPropertyDetail[]> {
  const webscriptApi = new WebscriptApi(api);
  const classPath = toDictionaryPathSegment(className);

  const classDef = (await webscriptApi.executeWebScript(
    'GET',
    `api/classes/${classPath}`,
    {},
    'alfresco',
    'service'
  )) as { properties?: Record<string, unknown> };

  const propertyNames = Object.keys(classDef?.properties ?? {});
  if (propertyNames.length === 0) {
    return [];
  }

  const details = await Promise.all(
    propertyNames.map(async propertyName => {
      const propertyPath = toDictionaryPathSegment(propertyName);
      try {
        const propertyDef = (await webscriptApi.executeWebScript(
          'GET',
          `api/classes/${classPath}/property/${propertyPath}`,
          {},
          'alfresco',
          'service'
        )) as Record<string, unknown>;

        return normalizePropertyDetail(propertyName, propertyDef);
      } catch (error) {
        log.warn(
          { className, propertyName, error },
          'Failed to fetch dictionary property details'
        );
        return null;
      }
    })
  );

  return details.filter((detail): detail is DictionaryPropertyDetail => detail !== null);
}
