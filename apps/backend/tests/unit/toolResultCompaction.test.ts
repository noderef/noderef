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
import { compactToolDataForModel } from '../../src/services/agent/toolResultCompaction.js';

describe('compactToolDataForModel', () => {
  it('keeps allowableOperations on sample entries so the model can honor ACLs', () => {
    const compacted = compactToolDataForModel({
      sample: [
        {
          id: 'n1',
          name: 'Readme',
          nodeType: 'cm:content',
          isFolder: false,
          isFile: true,
          path: '/Company Home/Readme',
          mimeType: 'text/plain',
          allowableOperations: ['update'],
        },
      ],
    });

    expect(compacted.sample).toEqual([
      expect.objectContaining({
        id: 'n1',
        name: 'Readme',
        allowableOperations: ['update'],
      }),
    ]);
  });
});
