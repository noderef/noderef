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

import type { ModelProperty, SchemaRecord } from '@/components/model-explorer/types';
import { backendRpc } from '@/core/ipc/backend';
import { useEffect, useState } from 'react';

interface DictionaryPropertyDetail {
  name: string;
  dataType?: string;
  mandatory?: boolean;
  multiValued?: boolean;
  indexed?: boolean;
  constraints: string[];
}

function mergePropertyDetails(
  record: SchemaRecord,
  details: DictionaryPropertyDetail[]
): SchemaRecord {
  if (details.length === 0) {
    return record;
  }

  const detailMap = new Map(details.map(detail => [detail.name, detail]));
  const mergedProperties: ModelProperty[] = [];
  const seen = new Set<string>();

  for (const prop of record.properties) {
    seen.add(prop.name);
    const detail = detailMap.get(prop.name);
    if (!detail) {
      mergedProperties.push(prop);
      continue;
    }

    mergedProperties.push({
      ...prop,
      dataType: detail.dataType ?? prop.dataType,
      mandatory: detail.mandatory ?? prop.mandatory,
      multiValued: detail.multiValued ?? prop.multiValued,
      indexed: detail.indexed ?? prop.indexed,
      constraints: detail.constraints.length > 0 ? detail.constraints : prop.constraints,
    });
  }

  for (const detail of details) {
    if (seen.has(detail.name)) {
      continue;
    }

    mergedProperties.push({
      name: detail.name,
      dataType: detail.dataType,
      mandatory: detail.mandatory,
      multiValued: detail.multiValued,
      indexed: detail.indexed,
      constraints: detail.constraints.length > 0 ? detail.constraints : undefined,
    });
  }

  return {
    ...record,
    properties: mergedProperties,
  };
}

export function useClassPropertyDetails(
  serverId: number | null,
  baseUrl: string | null | undefined,
  record: SchemaRecord | null
): SchemaRecord | null {
  const classId = record?.id ?? null;
  const [enrichedRecord, setEnrichedRecord] = useState<SchemaRecord | null>(record);

  useEffect(() => {
    if (!record || !classId) {
      setEnrichedRecord(null);
      return;
    }

    setEnrichedRecord(record);

    if (!serverId || !baseUrl) {
      return;
    }

    let cancelled = false;

    void backendRpc.alfresco.dictionary
      .getClassPropertyDetails(serverId, baseUrl, classId)
      .then(details => {
        if (cancelled) {
          return;
        }
        setEnrichedRecord(mergePropertyDetails(record, details));
      })
      .catch(() => {
        if (!cancelled) {
          setEnrichedRecord(record);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serverId, baseUrl, classId, record]);

  return enrichedRecord;
}
