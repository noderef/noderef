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
import type { McpCatalog } from '@app/contracts';
import { useCallback, useEffect, useState } from 'react';

const cache = new Map<number, McpCatalog>();
const invalidationListeners = new Set<(serverId: number) => void>();

export function invalidateMcpCatalog(serverId: number): void {
  cache.delete(serverId);
  invalidationListeners.forEach(listener => listener(serverId));
}

export function useMcpCatalog(serverId: number | null) {
  const [catalog, setCatalog] = useState<McpCatalog | null>(
    serverId ? (cache.get(serverId) ?? null) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!serverId) {
        setCatalog(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await backendRpc.agentGateway.getCatalog(serverId, refresh);
        cache.set(serverId, next);
        setCatalog(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load MCP catalog');
      } finally {
        setLoading(false);
      }
    },
    [serverId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const listener = (changedId: number) => {
      if (changedId === serverId) void load(true);
    };
    invalidationListeners.add(listener);
    return () => {
      invalidationListeners.delete(listener);
    };
  }, [load, serverId]);

  return { catalog, loading, error, refresh: () => load(true) };
}
