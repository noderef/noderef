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

import { describe, expect, it } from 'vitest';
import {
  editorValueToRest,
  isPropertyEditable,
  slingshotValuesToEditorValue,
  valuesAreEqual,
} from './propertyEditing';

const textValue = (
  value: unknown,
  extras: Partial<{ isContent: boolean; isNullValue: boolean }> = {}
) => ({
  dataType: 'd:text',
  value,
  isContent: extras.isContent ?? false,
  isNodeRef: false,
  isNullValue: extras.isNullValue ?? false,
});

describe('slingshotValuesToEditorValue', () => {
  it('converts a single text value', () => {
    expect(
      slingshotValuesToEditorValue([textValue('Hello')], { dataType: 'd:text', multiValued: false })
    ).toBe('Hello');
  });

  it('converts multi-valued properties to an array', () => {
    expect(
      slingshotValuesToEditorValue([textValue('a'), textValue('b')], {
        dataType: 'd:text',
        multiValued: true,
      })
    ).toEqual(['a', 'b']);
  });

  it('normalizes dates to YYYY-MM-DD', () => {
    expect(
      slingshotValuesToEditorValue([textValue('2024-03-01T12:00:00.000Z')], {
        dataType: 'd:date',
        multiValued: false,
      })
    ).toBe('2024-03-01');
  });

  it('returns null when there are no values', () => {
    expect(slingshotValuesToEditorValue([], { dataType: 'd:text', multiValued: false })).toBeNull();
  });
});

describe('editorValueToRest', () => {
  it('clears empty text to null', () => {
    expect(editorValueToRest('', { dataType: 'd:text', multiValued: false })).toBeNull();
    expect(editorValueToRest('  ', { dataType: 'd:text', multiValued: false })).toBeNull();
  });

  it('keeps booleans and numbers', () => {
    expect(editorValueToRest(true, { dataType: 'd:boolean', multiValued: false })).toBe(true);
    expect(editorValueToRest('42', { dataType: 'd:int', multiValued: false })).toBe(42);
  });

  it('serializes datetime values to ISO 8601', () => {
    expect(editorValueToRest('2024-03-01', { dataType: 'd:datetime', multiValued: false })).toBe(
      '2024-03-01T00:00:00.000Z'
    );
  });

  it('serializes multi-valued lists and clears empty ones', () => {
    expect(editorValueToRest(['one', 'two'], { dataType: 'd:text', multiValued: true })).toEqual([
      'one',
      'two',
    ]);
    expect(editorValueToRest([], { dataType: 'd:text', multiValued: true })).toBeNull();
  });
});

describe('isPropertyEditable', () => {
  it('blocks protected, sys, content and complex types', () => {
    expect(isPropertyEditable('cm:title', { dataType: 'd:text', protected: true })).toBe(false);
    expect(isPropertyEditable('sys:node-dbid', { dataType: 'd:long' })).toBe(false);
    expect(isPropertyEditable('cm:content', { dataType: 'd:content' })).toBe(false);
    expect(isPropertyEditable('cm:categories', { dataType: 'd:category' })).toBe(false);
    expect(isPropertyEditable('cm:title', { dataType: 'd:mltext' })).toBe(true);
  });
});

describe('valuesAreEqual', () => {
  it('treats empty string and null as equal', () => {
    expect(valuesAreEqual('', null)).toBe(true);
    expect(valuesAreEqual('a', 'a')).toBe(true);
    expect(valuesAreEqual(['a'], ['a'])).toBe(true);
  });
});
