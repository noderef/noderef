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

import { Feature, createOkProfile, isFeatureAvailable } from '@app/contracts';
import { describe, expect, it } from 'vitest';

describe('renderer capability gating', () => {
  it('keeps agent/search/insights/repo available for non-admins', () => {
    const profile = createOkProfile({ isAdmin: false });
    expect(isFeatureAvailable(profile, Feature.Agent)).toBe(true);
    expect(isFeatureAvailable(profile, Feature.Search)).toBe(true);
    expect(isFeatureAvailable(profile, Feature.Insights)).toBe(true);
    expect(isFeatureAvailable(profile, Feature.RepoBrowser)).toBe(true);
    expect(isFeatureAvailable(profile, Feature.Logs)).toBe(false);
    expect(isFeatureAvailable(profile, Feature.RepoAdmin)).toBe(false);
    expect(isFeatureAvailable(profile, Feature.UsersGroups)).toBe(false);
    expect(isFeatureAvailable(profile, Feature.ModelExplorer)).toBe(false);
    expect(isFeatureAvailable(profile, Feature.JsConsole)).toBe(false);
  });
});
