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

import { backendRpc } from '@/core/ipc/backend';
import { useServersStore } from '@/core/store/servers';
import { useEffect, useMemo, useState } from 'react';

export interface SearchDictionary {
  types: string[];
  aspects: string[];
  sites: string[];
  properties: string[];
}

const CACHE_KEY = 'search-dictionary-cache';

export function useSearchDictionary(serverId: number | null) {
  const server = useServersStore(state =>
    typeof serverId === 'number' ? state.servers.find(s => s.id === serverId) || null : null
  );
  const cacheKey = useMemo(() => {
    if (!serverId || !server?.baseUrl) {
      return null;
    }
    return `${CACHE_KEY}-${serverId}`;
  }, [serverId, server?.baseUrl]);

  const [dictionary, setDictionary] = useState<SearchDictionary>({
    types: [],
    aspects: [],
    sites: [],
    properties: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serverId || !server?.baseUrl) {
      setDictionary({ types: [], aspects: [], sites: [], properties: [] });
      return;
    }

    const loadDictionary = async () => {
      setLoading(true);
      try {
        // Check local storage cache first
        const cached = cacheKey ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          // Cache valid for 1 hour
          if (Date.now() - timestamp < 60 * 60 * 1000) {
            setDictionary(data);
            setLoading(false);
            return;
          }
        }

        // Fetch from backend
        const result = await backendRpc.alfresco.search.getDictionary(serverId, server.baseUrl);

        setDictionary(result);

        // Update cache
        if (cacheKey) {
          localStorage.setItem(cacheKey, JSON.stringify({ data: result, timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('Failed to load search dictionary:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDictionary();
  }, [serverId, server?.baseUrl, cacheKey]);

  return { dictionary, loading };
}
