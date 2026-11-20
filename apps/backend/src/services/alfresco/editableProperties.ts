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

export interface EditablePropertyDefinition {
  name: string;
  dataType?: string;
  multiValued?: boolean;
  mandatory?: boolean;
  protected?: boolean;
  allowedValues?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
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
    propertyDef.dataTypeQName,
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

function extractListAllowedValues(constraints: unknown): string[] | undefined {
  if (!constraints) {
    return undefined;
  }

  const list: unknown[] = Array.isArray(constraints)
    ? constraints
    : typeof constraints === 'object'
      ? Object.values(constraints as Record<string, unknown>)
      : [];

  const allowed: string[] = [];

  for (const constraint of list) {
    const record = asRecord(constraint);
    if (!record) {
      continue;
    }

    const type =
      typeof record.type === 'string'
        ? record.type
        : typeof record.constraintType === 'string'
          ? record.constraintType
          : undefined;

    if (type && type.toUpperCase() !== 'LIST') {
      continue;
    }

    collectAllowedValues(record, allowed);
  }

  const unique = Array.from(new Set(allowed.filter(Boolean)));
  return unique.length > 0 ? unique : undefined;
}

function parsePropertyDefinition(
  propertyName: string,
  propertyDef: unknown
): EditablePropertyDefinition | null {
  const record = asRecord(propertyDef);
  const name =
    (record && typeof record.name === 'string' && record.name) ||
    (typeof propertyName === 'string' ? propertyName : '');

  if (!name) {
    return null;
  }

  return {
    name,
    dataType: record ? extractDataType(record) : undefined,
    multiValued: record
      ? readBoolean(record.multiValued, readBoolean(record.isMultiValued))
      : undefined,
    mandatory: record ? readBoolean(record.mandatory, readBoolean(record.isMandatory)) : undefined,
    protected: record ? readBoolean(record.protected, readBoolean(record.isProtected)) : undefined,
    allowedValues: record ? extractListAllowedValues(record.constraints) : undefined,
  };
}

/**
 * Parse editable property definitions from an Alfresco dictionary class payload.
 */
export function parseEditablePropertiesFromClass(classDef: unknown): EditablePropertyDefinition[] {
  const record = asRecord(classDef);
  const properties = record?.properties;
  if (!properties || typeof properties !== 'object') {
    return [];
  }

  const result: EditablePropertyDefinition[] = [];

  if (Array.isArray(properties)) {
    for (const item of properties) {
      const parsed = parsePropertyDefinition(
        typeof asRecord(item)?.name === 'string' ? (asRecord(item)!.name as string) : '',
        item
      );
      if (parsed) {
        result.push(parsed);
      }
    }
    return result;
  }

  for (const [propertyName, propertyDef] of Object.entries(properties as Record<string, unknown>)) {
    const parsed = parsePropertyDefinition(propertyName, propertyDef);
    if (parsed) {
      result.push(parsed);
    }
  }

  return result;
}

export function mergeEditablePropertyDefinitions(
  groups: EditablePropertyDefinition[][]
): EditablePropertyDefinition[] {
  const merged = new Map<string, EditablePropertyDefinition>();

  for (const group of groups) {
    for (const definition of group) {
      const existing = merged.get(definition.name);
      if (!existing) {
        merged.set(definition.name, definition);
        continue;
      }

      merged.set(definition.name, {
        ...existing,
        ...definition,
        allowedValues: definition.allowedValues ?? existing.allowedValues,
        dataType: definition.dataType ?? existing.dataType,
        multiValued: definition.multiValued ?? existing.multiValued,
        mandatory: definition.mandatory ?? existing.mandatory,
        protected: definition.protected ?? existing.protected,
      });
    }
  }

  return Array.from(merged.values());
}
