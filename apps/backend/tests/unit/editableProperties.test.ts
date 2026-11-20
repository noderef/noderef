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
import { parseEditablePropertiesFromClass } from '../../src/services/alfresco/editableProperties.js';

describe('parseEditablePropertiesFromClass', () => {
  it('reads data type, flags and LIST allowed values from a class payload', () => {
    const parsed = parseEditablePropertiesFromClass({
      name: 'cm:content',
      properties: {
        'cm:title': {
          name: 'cm:title',
          dataType: 'd:mltext',
          isMultiValued: false,
          isMandatory: false,
          isProtected: false,
        },
        'cm:name': {
          name: 'cm:name',
          dataType: { name: 'd:text' },
          multiValued: false,
          mandatory: true,
          protected: true,
        },
        'cm:visibility': {
          name: 'cm:visibility',
          dataType: 'd:text',
          constraints: [
            {
              type: 'LIST',
              parameters: [{ allowedValues: ['PUBLIC', 'PRIVATE'] }],
            },
          ],
        },
      },
    });

    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'cm:title',
          dataType: 'd:mltext',
          multiValued: false,
          mandatory: false,
          protected: false,
        }),
        expect.objectContaining({
          name: 'cm:name',
          dataType: 'd:text',
          mandatory: true,
          protected: true,
        }),
        expect.objectContaining({
          name: 'cm:visibility',
          allowedValues: ['PUBLIC', 'PRIVATE'],
        }),
      ])
    );
  });

  it('returns an empty list when the class has no properties', () => {
    expect(parseEditablePropertiesFromClass({ name: 'cm:empty' })).toEqual([]);
  });
});
