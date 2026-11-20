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
import { canSaveAddServer } from './addServerForm';

describe('canSaveAddServer', () => {
  it('allows a non-admin with valid basic credentials to save', () => {
    expect(
      canSaveAddServer({
        name: 'ACS',
        urlValid: true,
        serverType: 'alfresco',
        authType: 'basic',
        credentialsValid: true,
        oidcAuthenticated: false,
      })
    ).toBe(true);
  });

  it('allows a non-admin with completed OIDC login to save', () => {
    expect(
      canSaveAddServer({
        name: 'ACS',
        urlValid: true,
        serverType: 'alfresco',
        authType: 'openid_connect',
        credentialsValid: false,
        oidcAuthenticated: true,
      })
    ).toBe(true);
  });

  it('blocks save until credentials are valid', () => {
    expect(
      canSaveAddServer({
        name: 'ACS',
        urlValid: true,
        serverType: 'alfresco',
        authType: 'basic',
        credentialsValid: false,
        oidcAuthenticated: false,
      })
    ).toBe(false);
  });
});
