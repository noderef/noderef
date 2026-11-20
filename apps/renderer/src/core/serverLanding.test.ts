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
import { getAlfrescoLandingPage, shouldPreservePageOnAlfrescoServer } from './serverLanding';

describe('getAlfrescoLandingPage', () => {
  it('lands admins with JS Console on the console', () => {
    expect(getAlfrescoLandingPage(FULL_ADMIN_PROFILE)).toBe('jsconsole');
    expect(getAlfrescoLandingPage(createOkProfile({ isAdmin: true, jsConsole: true }))).toBe(
      'jsconsole'
    );
  });

  it('lands non-admins on a new Agent chat', () => {
    expect(getAlfrescoLandingPage(createOkProfile({ isAdmin: false }))).toBe('agentPage');
    expect(getAlfrescoLandingPage(RESTRICTED_PROFILE)).toBe('agentPage');
    expect(getAlfrescoLandingPage(null)).toBe('agentPage');
    expect(getAlfrescoLandingPage(undefined)).toBe('agentPage');
  });
});

describe('shouldPreservePageOnAlfrescoServer', () => {
  const nonAdmin = createOkProfile({ isAdmin: false });

  it('does not keep JS Console when switching to a server without it', () => {
    expect(shouldPreservePageOnAlfrescoServer('jsconsole', nonAdmin)).toBe(false);
    expect(shouldPreservePageOnAlfrescoServer('jsconsole', RESTRICTED_PROFILE)).toBe(false);
    expect(shouldPreservePageOnAlfrescoServer('jsconsole', null)).toBe(false);
  });

  it('keeps JS Console when the target server exposes it', () => {
    expect(shouldPreservePageOnAlfrescoServer('jsconsole', FULL_ADMIN_PROFILE)).toBe(true);
  });

  it('keeps ungated workspace pages across Alfresco servers', () => {
    expect(shouldPreservePageOnAlfrescoServer('agentPage', nonAdmin)).toBe(true);
    expect(shouldPreservePageOnAlfrescoServer('text-editor', nonAdmin)).toBe(true);
    expect(shouldPreservePageOnAlfrescoServer('insights', nonAdmin)).toBe(true);
  });

  it('does not treat repo or dashboard as preserved server pages', () => {
    expect(shouldPreservePageOnAlfrescoServer('dashboard', nonAdmin)).toBe(false);
    expect(shouldPreservePageOnAlfrescoServer('repo', nonAdmin)).toBe(false);
    expect(shouldPreservePageOnAlfrescoServer('search', FULL_ADMIN_PROFILE)).toBe(false);
  });
});
