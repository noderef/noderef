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

import { createOkProfile, FULL_ADMIN_PROFILE, RESTRICTED_PROFILE } from '@app/contracts';
import { describe, expect, it } from 'vitest';
import {
  getToolsFor,
  isToolAllowed,
  toolCapabilityDeniedMessage,
} from '../../src/services/agent/tools/registry.js';

const nonAdmin = createOkProfile({
  isAdmin: false,
  jsConsole: false,
  supportTools: false,
  nodeBrowser: false,
});

describe('agent tool capability filter', () => {
  it('hides admin and jsconsole tools for a restricted profile', () => {
    const names = getToolsFor(nonAdmin).map(tool => tool.name);
    expect(names).not.toContain('script_execute');
    expect(names).not.toContain('script_create');
    expect(names).not.toContain('people_create');
    expect(names).not.toContain('audit_apps');
    expect(names).not.toContain('audit_list');
    expect(names).toContain('search');
    expect(names).toContain('trashcan_purge');
    expect(names).toContain('get_installed_modules');
  });

  it('denies aliased script/admin tools for non-admins', () => {
    expect(isToolAllowed('execute_script', nonAdmin)).toBe(false);
    expect(isToolAllowed('create_script', nonAdmin)).toBe(false);
    expect(isToolAllowed('create_person', nonAdmin)).toBe(false);
    expect(isToolAllowed('list_audit_apps', nonAdmin)).toBe(false);
    expect(isToolAllowed('search', nonAdmin)).toBe(true);
  });

  it('allows the full set for a live admin profile', () => {
    expect(isToolAllowed('script_execute', FULL_ADMIN_PROFILE)).toBe(true);
    expect(isToolAllowed('people_create', FULL_ADMIN_PROFILE)).toBe(true);
  });

  it('is restrictive when the profile is unknown', () => {
    expect(isToolAllowed('script_execute', RESTRICTED_PROFILE)).toBe(false);
    expect(isToolAllowed('search', RESTRICTED_PROFILE)).toBe(true);
  });

  it('explains why a gated tool is unavailable', () => {
    expect(toolCapabilityDeniedMessage('script_execute')).toContain('JavaScript Console');
    expect(toolCapabilityDeniedMessage('people_create')).toContain('administrator');
    expect(toolCapabilityDeniedMessage('search')).toBe(
      'Tool "search" is not available for this Alfresco account.'
    );
  });
});
