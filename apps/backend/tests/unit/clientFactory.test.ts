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

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllClients,
  dropClient,
  getAuthenticatedClient,
  getClient,
} from '../../src/services/alfresco/clientFactory.js';

const BASE_URL = 'https://dev-tezza.contezza.cloud/alfresco';

describe('Alfresco client cache', () => {
  beforeEach(() => {
    clearAllClients();
  });

  it('reuses a client for the same host until it is dropped', () => {
    const first = getClient(BASE_URL);
    const second = getClient(BASE_URL);
    expect(second).toBe(first);
  });

  it('drops the default basic-auth client keyed by host without an auth suffix', () => {
    const cached = getClient(BASE_URL);
    dropClient(BASE_URL);
    const next = getClient(BASE_URL);
    expect(next).not.toBe(cached);
  });

  it('logs in with a fresh client so a previous ticket is not reused', async () => {
    const stale = getClient(BASE_URL);
    const api = await getAuthenticatedClient(BASE_URL, {
      authType: 'basic',
      username: 'admin',
      token: 'new-password',
    });

    expect(api).not.toBe(stale);
    expect(api.login).toHaveBeenCalledWith('admin', 'new-password');
  });
});
