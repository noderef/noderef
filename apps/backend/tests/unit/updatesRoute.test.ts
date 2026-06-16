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
import { isAllowedResourcesUrl } from '../../src/routes/updates.js';

describe('updates route helpers', () => {
  it('allows noderef GitHub resources URLs only', () => {
    expect(
      isAllowedResourcesUrl(
        'https://github.com/noderef/noderef/releases/download/v0.10.1/noderef-resources.neu'
      )
    ).toBe(true);
    expect(isAllowedResourcesUrl('https://example.com/noderef-resources.neu')).toBe(false);
    expect(
      isAllowedResourcesUrl(
        'https://github.com/noderef/noderef/releases/download/v0.10.1/update_manifest.json'
      )
    ).toBe(false);
  });
});
