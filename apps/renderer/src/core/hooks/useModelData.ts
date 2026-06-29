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

import {
  buildGraph,
  getNamespaceFromId,
  normalizeCustomAspect,
  normalizeCustomType,
  normalizeDictionaryClass,
} from '@/components/model-explorer/normalize';
import { computeLayout } from '@/components/model-explorer/layoutEngine';
import { isSystemNamespace, type SchemaRecord } from '@/components/model-explorer/types';
import { backendRpc } from '@/core/ipc/backend';
import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type KindFilter = 'all' | 'type' | 'aspect';

interface UseModelDataOptions {
  serverId: number | null;
  baseUrl: string | null | undefined;
  showSystem: boolean;
  namespaceFilter: string[];
  kindFilter: KindFilter;
}

function mergeSchemaRecords(existing: SchemaRecord, incoming: SchemaRecord): SchemaRecord {
  const namespace = getNamespaceFromId(incoming.id);
  return {
    ...existing,
    ...incoming,
    namespace,
    isSystem: isSystemNamespace(namespace),
    properties: incoming.properties.length > 0 ? incoming.properties : existing.properties,
    associations: incoming.associations.length > 0 ? incoming.associations : existing.associations,
    mandatoryAspects:
      incoming.mandatoryAspects.length > 0 ? incoming.mandatoryAspects : existing.mandatoryAspects,
    description: incoming.description || existing.description,
  };
}

export function useModelData({
  serverId,
  baseUrl,
  showSystem,
  namespaceFilter,
  kindFilter,
}: UseModelDataOptions) {
  const [rawRecords, setRawRecords] = useState<SchemaRecord[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [schemaMap, setSchemaMap] = useState<Record<string, SchemaRecord>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!serverId || !baseUrl) {
      setRawRecords([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const recordMap = new Map<string, SchemaRecord>();

      const pushRecord = (record: SchemaRecord | null) => {
        if (!record) {
          return;
        }

        const existing = recordMap.get(record.id);
        recordMap.set(record.id, existing ? mergeSchemaRecords(existing, record) : record);
      };

      const allClasses = (await backendRpc.alfresco.dictionary.getClasses(
        serverId,
        baseUrl,
        ''
      )) as Record<string, unknown>[];

      for (const classDef of allClasses) {
        pushRecord(normalizeDictionaryClass(classDef));
      }

      const customModels = (await backendRpc.alfresco.customModels.getAll(
        serverId,
        baseUrl
      )) as Array<Record<string, unknown>>;

      for (const model of customModels) {
        const namespacePrefix = String(model.namespacePrefix || '');
        const types = Array.isArray(model.types) ? model.types : [];
        const aspects = Array.isArray(model.aspects) ? model.aspects : [];

        for (const type of types) {
          pushRecord(normalizeCustomType(type as Record<string, unknown>, namespacePrefix));
        }
        for (const aspect of aspects) {
          pushRecord(normalizeCustomAspect(aspect as Record<string, unknown>, namespacePrefix));
        }
      }

      setRawRecords([...recordMap.values()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRawRecords([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, baseUrl]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableNamespaces = useMemo(() => {
    const set = new Set<string>();
    for (const record of rawRecords) {
      if (!showSystem && record.isSystem) {
        continue;
      }
      set.add(record.namespace);
    }
    return Array.from(set).sort();
  }, [rawRecords, showSystem]);

  const filteredRecords = useMemo(() => {
    return rawRecords.filter(record => {
      if (!showSystem && record.isSystem) return false;
      if (namespaceFilter.length > 0 && !namespaceFilter.includes(record.namespace)) {
        return false;
      }
      if (kindFilter === 'type' && record.kind !== 'type') return false;
      if (kindFilter === 'aspect' && record.kind !== 'aspect') return false;
      return true;
    });
  }, [rawRecords, showSystem, namespaceFilter, kindFilter]);

  const applyLayout = useCallback(async (records: SchemaRecord[]) => {
    const graph = buildGraph(records);
    const laidOut = await computeLayout(graph.nodes, graph.edges);
    setNodes(laidOut);
    setEdges(graph.edges);
    setSchemaMap(graph.schemaMap);
  }, []);

  useEffect(() => {
    void applyLayout(filteredRecords);
  }, [filteredRecords, applyLayout]);

  return {
    nodes,
    edges,
    schemaMap,
    loading,
    error,
    availableNamespaces,
  };
}
