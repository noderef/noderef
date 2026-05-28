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

import type { Edge } from '@xyflow/react';
import { SCHEMA_NODE_SOURCE_HANDLE, SCHEMA_NODE_TARGET_HANDLE } from './handles';
import type { EdgeKind, SchemaEdgeData } from './types';

const edgeMarkers = {
  inheritance: {
    type: 'arrowclosed' as const,
    color: '#64748b',
    width: 16,
    height: 16,
  },
  association: {
    type: 'arrowclosed' as const,
    color: '#2563eb',
    width: 14,
    height: 14,
  },
  mandatoryAspect: {
    type: 'arrowclosed' as const,
    color: '#16a34a',
    width: 10,
    height: 10,
  },
};

export function buildStyledEdge(
  id: string,
  source: string,
  target: string,
  kind: EdgeKind,
  label?: string
): Edge {
  const base = {
    id,
    source,
    target,
    sourceHandle: SCHEMA_NODE_SOURCE_HANDLE,
    targetHandle: SCHEMA_NODE_TARGET_HANDLE,
    data: { kind, label } satisfies SchemaEdgeData,
    animated: kind === 'association',
  };

  switch (kind) {
    case 'inheritance':
      return {
        ...base,
        type: 'smoothstep',
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: edgeMarkers.inheritance,
      };
    case 'association':
      return {
        ...base,
        type: 'smoothstep',
        style: { stroke: '#2563eb', strokeWidth: 1.5, strokeDasharray: '6 4' },
        markerEnd: edgeMarkers.association,
      };
    case 'mandatoryAspect':
      return {
        ...base,
        type: 'smoothstep',
        style: { stroke: '#16a34a', strokeWidth: 1.5 },
        markerEnd: edgeMarkers.mandatoryAspect,
      };
    default:
      return base;
  }
}
