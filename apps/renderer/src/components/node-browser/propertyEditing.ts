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

import type { AlfrescoNodeDetails, EditablePropertyDefinition } from '@/core/ipc/backend';

export type SlingshotProperty = AlfrescoNodeDetails['properties'][number];
export type EditorKind = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'list';

const COMPLEX_TYPES = new Set([
  'd:content',
  'd:noderef',
  'd:qname',
  'd:category',
  'd:assocref',
  'd:childassocref',
  'd:path',
  'd:locale',
  'd:any',
]);

const NUMBER_TYPES = new Set(['d:int', 'd:long', 'd:float', 'd:double']);
const NON_EDITABLE_PROPERTIES = new Set(['cm:name', 'cm:content', 'cm:preferencevalues']);

export function normalizeDataType(dataType?: string | null): string {
  if (!dataType) {
    return 'd:text';
  }
  return dataType.trim().toLowerCase();
}

export function isComplexDataType(dataType?: string | null): boolean {
  return COMPLEX_TYPES.has(normalizeDataType(dataType));
}

export function isNumberDataType(dataType?: string | null): boolean {
  return NUMBER_TYPES.has(normalizeDataType(dataType));
}

function isNonEditablePropertyName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (lower.startsWith('sys:')) {
    return true;
  }
  return NON_EDITABLE_PROPERTIES.has(lower);
}

export function resolvePropertyDefinition(
  property: Pick<SlingshotProperty, 'name' | 'type' | 'multiple' | 'residual'>,
  definitions: Map<string, EditablePropertyDefinition>
): EditablePropertyDefinition {
  const name = property.name.prefixedName;
  const existing = definitions.get(name);
  return {
    name,
    dataType: existing?.dataType ?? property.type?.prefixedName ?? 'd:text',
    multiValued: existing?.multiValued ?? property.multiple,
    mandatory: existing?.mandatory,
    protected: existing?.protected,
    allowedValues: existing?.allowedValues,
  };
}

export function isPropertyEditable(
  propertyName: string,
  definition: Pick<EditablePropertyDefinition, 'dataType' | 'protected'>,
  options?: { isContent?: boolean }
): boolean {
  if (isNonEditablePropertyName(propertyName)) {
    return false;
  }
  if (definition.protected) {
    return false;
  }
  if (options?.isContent) {
    return false;
  }
  if (isComplexDataType(definition.dataType)) {
    return false;
  }
  return true;
}

export function getEditorKind(
  definition: Pick<EditablePropertyDefinition, 'dataType' | 'allowedValues' | 'multiValued'>
): EditorKind {
  if (definition.allowedValues && definition.allowedValues.length > 0 && !definition.multiValued) {
    return 'list';
  }

  const dataType = normalizeDataType(definition.dataType);
  if (dataType === 'd:boolean') {
    return 'boolean';
  }
  if (dataType === 'd:date') {
    return 'date';
  }
  if (dataType === 'd:datetime') {
    return 'datetime';
  }
  if (NUMBER_TYPES.has(dataType)) {
    return 'number';
  }
  if (dataType === 'd:mltext') {
    return 'textarea';
  }
  return 'text';
}

function coerceScalar(value: unknown, dataType?: string | null): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  const kind = getEditorKind({ dataType: dataType ?? undefined });
  if (kind === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
    }
    return Boolean(value);
  }

  if (kind === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (kind === 'date' || kind === 'datetime') {
    return normalizeDateInput(String(value), kind === 'datetime');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

export function slingshotValuesToEditorValue(
  values: SlingshotProperty['values'] | undefined,
  definition: Pick<EditablePropertyDefinition, 'dataType' | 'multiValued'>
): unknown {
  const usable = (values ?? []).filter(value => !value.isNullValue && value.value !== undefined);
  if (definition.multiValued) {
    return usable
      .map(value => coerceScalar(value.value, definition.dataType))
      .filter(v => v !== null);
  }

  if (usable.length === 0) {
    return null;
  }

  return coerceScalar(usable[0].value, definition.dataType);
}

function emptyToNull(value: unknown): unknown | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  return value;
}

export function editorValueToRest(
  value: unknown,
  definition: Pick<EditablePropertyDefinition, 'dataType' | 'multiValued'>
): unknown | null {
  if (definition.multiValued) {
    const items = Array.isArray(value) ? value : value === '' || value == null ? [] : [value];
    const converted = items
      .map(item => emptyToNull(coerceScalar(item, definition.dataType)))
      .filter(item => item !== null);
    return converted.length === 0 ? null : converted;
  }

  const converted = emptyToNull(coerceScalar(value, definition.dataType));
  return converted;
}

export function normalizeDateInput(value: string, includeTime: boolean): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (includeTime) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T00:00:00.000Z`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return trimmed;
  }

  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) {
    return isoDate[1];
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

export function isValidDateInput(value: string, includeTime: boolean): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (includeTime) {
    const parsed = new Date(trimmed);
    return !Number.isNaN(parsed.getTime());
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) || !Number.isNaN(new Date(trimmed).getTime());
}

export function valuesAreEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeForCompare(left)) === JSON.stringify(normalizeForCompare(right));
}

function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCompare);
  }
  if (value === '') {
    return null;
  }
  return value ?? null;
}

export function formatEditorValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return value.map(item => formatEditorValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function countNodeEdits(edits: {
  properties: Record<string, unknown | null>;
  addAspects: string[];
  removeAspects: string[];
  nodeType: string | null;
}): number {
  return (
    Object.keys(edits.properties).length +
    edits.addAspects.length +
    edits.removeAspects.length +
    (edits.nodeType ? 1 : 0)
  );
}
