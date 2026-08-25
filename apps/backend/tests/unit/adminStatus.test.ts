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
  isAdminFromGroupMemberships,
  isAdminFromPerson,
} from '../../src/services/alfresco/adminStatus.js';

describe('isAdminFromPerson', () => {
  it('returns true when capabilities.isAdmin is set', () => {
    expect(
      isAdminFromPerson({
        entry: { id: 'admin', capabilities: { isAdmin: true } },
      })
    ).toBe(true);
  });

  it('returns false when OIDC omits capabilities', () => {
    expect(isAdminFromPerson({ entry: { id: 'admin' } })).toBe(false);
  });
});

describe('isAdminFromGroupMemberships', () => {
  it('detects GROUP_ALFRESCO_ADMINISTRATORS membership', () => {
    expect(
      isAdminFromGroupMemberships({
        list: {
          entries: [{ entry: { id: 'GROUP_ALFRESCO_ADMINISTRATORS' } }],
        },
      })
    ).toBe(true);
  });

  it('accepts the group id without the GROUP_ prefix', () => {
    expect(
      isAdminFromGroupMemberships({
        list: {
          entries: [{ entry: { id: 'ALFRESCO_ADMINISTRATORS' } }],
        },
      })
    ).toBe(true);
  });

  it('returns false for non-admin groups', () => {
    expect(
      isAdminFromGroupMemberships({
        list: {
          entries: [{ entry: { id: 'GROUP_SITE_COLLABORATORS' } }],
        },
      })
    ).toBe(false);
  });
});
