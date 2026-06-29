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

import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { getSchemaNodeDimensions } from './nodeDimensions';
import type { SchemaNodeData } from './types';

export async function computeLayout<T extends Node>(nodes: T[], edges: Edge[]): Promise<T[]> {
  if (nodes.length === 0) {
    return nodes;
  }

  const elk = new ELK();
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '72',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    },
    children: nodes.map(n => {
      const { width, height } = getSchemaNodeDimensions(n.data as SchemaNodeData | undefined);
      return {
        id: n.id,
        width,
        height,
      };
    }),
    edges: edges.map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(graph);

  return nodes.map(n => {
    const el = layout.children?.find(c => c.id === n.id);
    return {
      ...n,
      position: { x: el?.x ?? 0, y: el?.y ?? 0 },
      // Width/height are only for ELK spacing — do not set on React Flow nodes or
      // handles attach to the layout box bottom, not the visible card (edge gap).
    };
  });
}
