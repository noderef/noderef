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

import type { EditablePropertyDefinition } from '@/core/ipc/backend';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function extractClassName(classDef: unknown): string | null {
  const record = asRecord(classDef);
  if (!record) {
    return null;
  }
  if (typeof record.name === 'string' && record.name.trim()) {
    return record.name.trim();
  }
  const nameObj = asRecord(record.name);
  if (typeof nameObj?.prefixedName === 'string' && nameObj.prefixedName.trim()) {
    return nameObj.prefixedName.trim();
  }
  if (typeof nameObj?.name === 'string' && nameObj.name.trim()) {
    return nameObj.name.trim();
  }
  return null;
}

export function extractParentName(classDef: unknown): string | undefined {
  const record = asRecord(classDef);
  if (!record) {
    return undefined;
  }
  if (typeof record.parent === 'string' && record.parent.trim()) {
    return record.parent.trim();
  }
  const parent = asRecord(record.parent);
  if (typeof parent?.name === 'string' && parent.name.trim()) {
    return parent.name.trim();
  }
  if (typeof parent?.prefixedName === 'string' && parent.prefixedName.trim()) {
    return parent.prefixedName.trim();
  }
  if (typeof record.superClass === 'string' && record.superClass.trim()) {
    return record.superClass.trim();
  }
  return undefined;
}

export function isAspectClass(classDef: unknown): boolean {
  const record = asRecord(classDef);
  return Boolean(record?.isAspect);
}

export function listTypeAndAspectNames(classes: unknown[]): {
  types: string[];
  aspects: string[];
} {
  const types = new Set<string>();
  const aspects = new Set<string>();

  for (const classDef of classes) {
    const name = extractClassName(classDef);
    if (!name) {
      continue;
    }
    if (isAspectClass(classDef)) {
      aspects.add(name);
    } else {
      types.add(name);
    }
  }

  return {
    types: Array.from(types).sort(),
    aspects: Array.from(aspects).sort(),
  };
}

export function getSubtypeNames(classes: unknown[], currentType: string): string[] {
  if (!currentType) {
    return [];
  }

  const children = new Map<string, string[]>();
  for (const classDef of classes) {
    if (isAspectClass(classDef)) {
      continue;
    }
    const name = extractClassName(classDef);
    const parent = extractParentName(classDef);
    if (!name || !parent) {
      continue;
    }
    const list = children.get(parent) ?? [];
    list.push(name);
    children.set(parent, list);
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const stack = [...(children.get(currentType) ?? [])];

  while (stack.length > 0) {
    const name = stack.pop()!;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push(name);
    const next = children.get(name);
    if (next) {
      stack.push(...next);
    }
  }

  return result.sort();
}

function readBoolean(value: unknown, fallback?: boolean): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function extractDataType(propertyDef: Record<string, unknown>): string | undefined {
  const candidates = [
    propertyDef.dataType,
    asRecord(propertyDef.dataType)?.name,
    asRecord(propertyDef.dataType)?.prefixedName,
    propertyDef.type,
    asRecord(propertyDef.type)?.name,
    asRecord(propertyDef.type)?.prefixedName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function collectAllowedValues(source: unknown, into: string[]): void {
  if (typeof source === 'string' && source.trim()) {
    into.push(source.trim());
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      collectAllowedValues(item, into);
    }
    return;
  }
  const record = asRecord(source);
  if (!record) {
    return;
  }
  if ('allowedValues' in record) {
    collectAllowedValues(record.allowedValues, into);
  }
  if ('value' in record) {
    collectAllowedValues(record.value, into);
  }
  if (Array.isArray(record.parameters)) {
    for (const param of record.parameters) {
      collectAllowedValues(param, into);
    }
  } else if (record.parameters) {
    collectAllowedValues(record.parameters, into);
  }
}

export function parseClassPropertyDefs(classDef: unknown): EditablePropertyDefinition[] {
  const record = asRecord(classDef);
  const properties = record?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return [];
  }

  const result: EditablePropertyDefinition[] = [];
  for (const [propertyName, propertyDef] of Object.entries(properties as Record<string, unknown>)) {
    const def = asRecord(propertyDef);
    const name = (def && typeof def.name === 'string' && def.name) || propertyName;
    if (!name) {
      continue;
    }

    const allowed: string[] = [];
    if (def?.constraints) {
      const list = Array.isArray(def.constraints)
        ? def.constraints
        : Object.values(def.constraints as Record<string, unknown>);
      for (const constraint of list) {
        const constraintRecord = asRecord(constraint);
        const type =
          typeof constraintRecord?.type === 'string' ? constraintRecord.type.toUpperCase() : '';
        if (type && type !== 'LIST') {
          continue;
        }
        collectAllowedValues(constraint, allowed);
      }
    }

    result.push({
      name,
      dataType: def ? extractDataType(def) : undefined,
      multiValued: def ? readBoolean(def.multiValued, readBoolean(def.isMultiValued)) : undefined,
      mandatory: def ? readBoolean(def.mandatory, readBoolean(def.isMandatory)) : undefined,
      protected: def ? readBoolean(def.protected, readBoolean(def.isProtected)) : undefined,
      allowedValues: allowed.length > 0 ? Array.from(new Set(allowed)) : undefined,
    });
  }

  return result;
}
