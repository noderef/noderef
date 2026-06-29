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

import { buildStyledEdge } from '@/components/model-explorer/edges';
import {
  isSystemNamespace,
  type ModelAssociation,
  type ModelProperty,
  type SchemaRecord,
} from '@/components/model-explorer/types';
import { Position, type Edge, type Node } from '@xyflow/react';

export function getNamespaceFromId(id: string): string {
  const idx = id.indexOf(':');
  const prefix = idx > 0 ? id.slice(0, idx) : id;
  return prefix.toLowerCase();
}

function toPrefixedName(
  name: string | undefined,
  namespacePrefix: string,
  fallback?: string
): string | undefined {
  if (!name) return fallback;
  if (name.includes(':')) return name;
  return `${namespacePrefix}:${name}`;
}

function extractQName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = value as {
      prefixedName?: string;
      name?: string;
      fullName?: string;
      localName?: string;
    };

    return (
      candidate.prefixedName ||
      candidate.name ||
      candidate.fullName ||
      candidate.localName ||
      undefined
    );
  }

  return undefined;
}

function normalizeCustomProperty(prop: Record<string, unknown>): ModelProperty {
  const constraints = Array.isArray(prop.constraints)
    ? (prop.constraints as Array<{ prefixedName?: string; name?: string }>).map(
        c => c.prefixedName || c.name || ''
      )
    : undefined;

  return {
    name: String(prop.prefixedName || prop.name || ''),
    dataType: prop.dataType ? String(prop.dataType) : undefined,
    mandatory: Boolean(prop.mandatory || prop.mandatoryEnforced),
    multiValued: Boolean(prop.multiValued),
    constraints: constraints?.filter(Boolean),
    indexed: prop.indexed !== undefined ? Boolean(prop.indexed) : undefined,
    tokenised:
      prop.indexTokenisationMode !== undefined
        ? String(prop.indexTokenisationMode) === 'TRUE'
        : undefined,
    facetable: prop.facetable !== undefined ? String(prop.facetable) === 'TRUE' : undefined,
  };
}

function normalizeDictionaryProperty(
  propName: string,
  propDef: Record<string, unknown>
): ModelProperty {
  const dataType =
    typeof propDef.dataType === 'string'
      ? propDef.dataType
      : typeof (propDef.dataType as { name?: string })?.name === 'string'
        ? (propDef.dataType as { name: string }).name
        : undefined;

  return {
    name: propName,
    dataType,
    mandatory: Boolean(propDef.mandatory),
    multiValued: Boolean(propDef.multiValued),
    defaultValue: propDef.defaultValue !== undefined ? String(propDef.defaultValue) : undefined,
    indexed: propDef.indexed !== undefined ? Boolean(propDef.indexed) : undefined,
    tokenised: propDef.tokenised !== undefined ? Boolean(propDef.tokenised) : undefined,
    facetable: propDef.facetable !== undefined ? Boolean(propDef.facetable) : undefined,
    constraints: Array.isArray(propDef.constraints) ? (propDef.constraints as string[]) : undefined,
  };
}

function extractClassName(classDef: Record<string, unknown>): string | null {
  if (typeof classDef.name === 'string') return classDef.name;
  const nameObj = classDef.name as { prefixedName?: string } | undefined;
  if (typeof nameObj?.prefixedName === 'string') return nameObj.prefixedName;
  return null;
}

export function normalizeDictionaryClass(classDef: Record<string, unknown>): SchemaRecord | null {
  const id = extractClassName(classDef);
  if (!id) return null;

  const isAspect = Boolean(classDef.isAspect);
  const parent =
    typeof classDef.parent === 'string'
      ? classDef.parent
      : typeof (classDef.parent as { name?: string })?.name === 'string'
        ? (classDef.parent as { name: string }).name
        : typeof classDef.superClass === 'string'
          ? classDef.superClass
          : undefined;

  const properties: ModelProperty[] = [];
  if (classDef.properties && typeof classDef.properties === 'object') {
    for (const [propName, propDef] of Object.entries(
      classDef.properties as Record<string, Record<string, unknown>>
    )) {
      properties.push(normalizeDictionaryProperty(propName, propDef));
    }
  }

  const associations: ModelAssociation[] = [];
  const appendAssociations = (
    assocContainer: Record<string, unknown> | undefined,
    kind: 'association' | 'child'
  ) => {
    if (!assocContainer || typeof assocContainer !== 'object') {
      return;
    }

    for (const [assocName, assocValue] of Object.entries(assocContainer)) {
      const assocList = Array.isArray(assocValue) ? assocValue : [assocValue];
      for (const assoc of assocList) {
        const assocRecord = assoc as {
          sourceClass?: string;
          targetClass?: string;
          sourceClassName?: string;
          targetClassName?: string;
          className?: string;
        };
        const target =
          typeof assoc === 'string'
            ? assoc
            : assocRecord.targetClass ||
              assocRecord.targetClassName ||
              assocRecord.className ||
              assocRecord.sourceClass ||
              assocRecord.sourceClassName ||
              undefined;

        associations.push({
          name: assocName,
          targetClass: target,
          isChild: kind === 'child',
          isPeer: kind === 'association',
        });
      }
    }
  };

  appendAssociations(classDef.associations as Record<string, unknown> | undefined, 'association');
  appendAssociations(classDef.childassociations as Record<string, unknown> | undefined, 'child');

  const mandatoryAspects: string[] = [];
  const appendAspectNames = (value: unknown) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          mandatoryAspects.push(item);
        } else if (typeof (item as { name?: string }).name === 'string') {
          mandatoryAspects.push((item as { name: string }).name);
        }
      }
      return;
    }

    if (typeof value === 'object') {
      for (const aspectDef of Object.values(value as Record<string, unknown>)) {
        if (typeof aspectDef === 'string') {
          mandatoryAspects.push(aspectDef);
        } else if (typeof (aspectDef as { name?: string }).name === 'string') {
          mandatoryAspects.push((aspectDef as { name: string }).name);
        }
      }
    }
  };

  appendAspectNames(classDef.mandatoryAspects);
  appendAspectNames(classDef.defaultAspects);

  const namespace = getNamespaceFromId(id);

  return {
    id,
    label: typeof classDef.title === 'string' ? classDef.title : id,
    kind: isAspect ? 'aspect' : 'type',
    namespace,
    isSystem: isSystemNamespace(namespace),
    parent,
    properties,
    associations,
    mandatoryAspects,
    description: typeof classDef.description === 'string' ? classDef.description : undefined,
  };
}

export function normalizeCustomType(
  type: Record<string, unknown>,
  namespacePrefix: string
): SchemaRecord | null {
  const id =
    toPrefixedName(
      extractQName(type.prefixedName) || extractQName(type.name),
      namespacePrefix,
      extractQName(type.name)
    ) || null;
  if (!id) return null;

  const parent = toPrefixedName(extractQName(type.parentName), namespacePrefix);
  const namespace = getNamespaceFromId(id);

  return {
    id,
    label: String(type.title || extractQName(type.name) || id),
    kind: 'type',
    namespace,
    isSystem: isSystemNamespace(namespace),
    parent,
    properties: Array.isArray(type.properties)
      ? (type.properties as Record<string, unknown>[]).map(normalizeCustomProperty)
      : [],
    associations: [],
    mandatoryAspects: [],
    description: type.description ? String(type.description) : undefined,
  };
}

export function normalizeCustomAspect(
  aspect: Record<string, unknown>,
  namespacePrefix: string
): SchemaRecord | null {
  const id =
    toPrefixedName(
      extractQName(aspect.prefixedName) || extractQName(aspect.name),
      namespacePrefix,
      extractQName(aspect.name)
    ) || null;
  if (!id) return null;

  const parent = toPrefixedName(extractQName(aspect.parentName), namespacePrefix);
  const namespace = getNamespaceFromId(id);

  return {
    id,
    label: String(aspect.title || extractQName(aspect.name) || id),
    kind: 'aspect',
    namespace,
    isSystem: isSystemNamespace(namespace),
    parent,
    properties: Array.isArray(aspect.properties)
      ? (aspect.properties as Record<string, unknown>[]).map(normalizeCustomProperty)
      : [],
    associations: [],
    mandatoryAspects: [],
    description: aspect.description ? String(aspect.description) : undefined,
  };
}

export function buildGraph(records: SchemaRecord[]): {
  nodes: Node[];
  edges: Edge[];
  schemaMap: Record<string, SchemaRecord>;
} {
  const schemaMap: Record<string, SchemaRecord> = {};
  for (const record of records) {
    schemaMap[record.id] = record;
  }

  const nodes: Node[] = records.map(record => ({
    id: record.id,
    type: record.kind === 'aspect' ? 'aspectNode' : 'typeNode',
    position: { x: 0, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    connectable: false,
    data: { record },
  }));

  const edgeIds = new Set<string>();
  const edges: Edge[] = [];

  const addEdge = (
    source: string,
    target: string,
    kind: 'inheritance' | 'association' | 'mandatoryAspect',
    label?: string
  ) => {
    if (!schemaMap[source] || !schemaMap[target] || source === target) return;
    const id = `${kind}:${source}->${target}${label ? `:${label}` : ''}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push(buildStyledEdge(id, source, target, kind, label));
  };

  for (const record of records) {
    if (record.parent && schemaMap[record.parent]) {
      addEdge(record.parent, record.id, 'inheritance');
    }
    for (const aspectId of record.mandatoryAspects) {
      if (schemaMap[aspectId]) {
        addEdge(record.id, aspectId, 'mandatoryAspect');
      }
    }
    for (const assoc of record.associations) {
      if (assoc.targetClass && schemaMap[assoc.targetClass]) {
        addEdge(record.id, assoc.targetClass, 'association', assoc.name);
      }
    }
  }

  return { nodes, edges, schemaMap };
}
