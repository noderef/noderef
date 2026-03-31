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

import { backendRpc } from '@/core/ipc/backend';
import type { SearchDictionary } from '@/hooks/useSearchDictionary';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UsePropertyDataTypesOptions {
  serverId: number;
  baseUrl: string | null;
  dictionary: SearchDictionary;
  activePropertyQuery: string;
  activePropertyInput: string;
}

interface UsePropertyDataTypesResult {
  combinedPropertyDataTypes: Record<string, string>;
  isLoadingDynamicProps: boolean;
  availableDateFields: string[];
  findMatchingDateProperty: (input: string) => string | null;
}

const PROPERTY_CACHE_TTL_MS = 5 * 60 * 1000;

const isDateDataType = (dataType: string | null | undefined): boolean => {
  const normalized = dataType?.trim().toLowerCase();
  return normalized === 'd:date' || normalized === 'd:datetime';
};

export function usePropertyDataTypes({
  serverId,
  baseUrl,
  dictionary,
  activePropertyQuery,
  activePropertyInput,
}: UsePropertyDataTypesOptions): UsePropertyDataTypesResult {
  const propertyDataTypesCacheRef = useRef<
    Record<string, { values: Record<string, string>; timestamp: number }>
  >({});
  const [currentPropertyDataTypes, setCurrentPropertyDataTypes] = useState<Record<string, string>>(
    {}
  );
  const [isLoadingDynamicProps, setIsLoadingDynamicProps] = useState(false);

  const propertyPrefix = useMemo(() => {
    const match = activePropertyQuery.match(/^([a-z0-9_-]+:)/i);
    return match ? match[1].toLowerCase() : null;
  }, [activePropertyQuery]);

  useEffect(() => {
    propertyDataTypesCacheRef.current = {};
    setCurrentPropertyDataTypes({});
  }, [serverId, baseUrl]);

  useEffect(() => {
    if (!serverId || !baseUrl || !propertyPrefix) {
      setCurrentPropertyDataTypes({});
      setIsLoadingDynamicProps(false);
      return;
    }

    const cacheKey = `${serverId}:${propertyPrefix}`;
    const cached = propertyDataTypesCacheRef.current[cacheKey];

    if (cached && Date.now() - cached.timestamp < PROPERTY_CACHE_TTL_MS) {
      setCurrentPropertyDataTypes(cached.values);
      setIsLoadingDynamicProps(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDynamicProps(true);

    backendRpc.alfresco.search
      .propertyDataTypesByPrefix(serverId, baseUrl, propertyPrefix)
      .then(propertyDataTypes => {
        if (cancelled) return;
        setCurrentPropertyDataTypes(propertyDataTypes);
        propertyDataTypesCacheRef.current[cacheKey] = {
          values: propertyDataTypes,
          timestamp: Date.now(),
        };
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load property data types', error);
        setCurrentPropertyDataTypes({});
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDynamicProps(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serverId, baseUrl, propertyPrefix]);

  const combinedPropertyDataTypes = useMemo(
    () => ({ ...dictionary.propertyDataTypes, ...currentPropertyDataTypes }),
    [currentPropertyDataTypes, dictionary.propertyDataTypes]
  );

  const availableDateFields = useMemo(() => {
    const term = activePropertyInput.toLowerCase();
    const normalizedPrefix = propertyPrefix?.toLowerCase() ?? null;

    return Object.entries(combinedPropertyDataTypes)
      .filter(
        ([prop, dataType]) =>
          isDateDataType(dataType) &&
          (!normalizedPrefix || prop.toLowerCase().startsWith(normalizedPrefix)) &&
          (term.length === 0 || prop.toLowerCase().includes(term))
      )
      .map(([prop]) => prop)
      .slice(0, 50);
  }, [activePropertyInput, combinedPropertyDataTypes, propertyPrefix]);

  const findMatchingDateProperty = useCallback(
    (input: string): string | null => {
      const value = input.trim();
      if (!value) return null;

      const lower = value.toLowerCase();
      const allDateProperties = Object.entries(combinedPropertyDataTypes)
        .filter(([, dataType]) => isDateDataType(dataType))
        .map(([prop]) => prop);

      const exact = allDateProperties.find(prop => prop.toLowerCase() === lower);
      if (exact) return exact;

      const startsWith = allDateProperties.find(prop => prop.toLowerCase().startsWith(lower));
      if (startsWith) return startsWith;

      return null;
    },
    [combinedPropertyDataTypes]
  );

  return {
    combinedPropertyDataTypes,
    isLoadingDynamicProps,
    availableDateFields,
    findMatchingDateProperty,
  };
}
