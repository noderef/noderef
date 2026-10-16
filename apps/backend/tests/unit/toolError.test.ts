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
  clarifyToolErrorPayload,
  clarifyUnknownToolErrorPayload,
  isRepositoryPermissionErrorMessage,
  REPOSITORY_PERMISSION_INSTRUCTION,
} from '../../src/services/agent/tools/helpers/toolError.js';

describe('clarifyToolErrorPayload', () => {
  it('marks Alfresco access-denied messages as permission_denied for the model', () => {
    const payload = clarifyToolErrorPayload(
      '01150081 Access Denied.  You do not have the appropriate permissions to perform this operation.'
    );
    expect(payload.errorKind).toBe('permission_denied');
    expect(payload.instruction).toBe(REPOSITORY_PERMISSION_INSTRUCTION);
    expect(String(payload.error)).toContain('Access Denied');
  });

  it('marks HTTP 403 payloads', () => {
    expect(clarifyToolErrorPayload('403 - Forbidden').errorKind).toBe('permission_denied');
  });

  it('leaves unrelated errors unchanged', () => {
    expect(clarifyToolErrorPayload('nodeId is required')).toEqual({ error: 'nodeId is required' });
    expect(clarifyToolErrorPayload('Authentication failed')).toEqual({
      error: 'Authentication failed',
    });
  });

  it('maps a 403 object via mapError', () => {
    const payload = clarifyUnknownToolErrorPayload({ status: 403, message: 'Forbidden' });
    expect(payload.errorKind).toBe('permission_denied');
    expect(String(payload.error)).toMatch(/permission/i);
  });
});

describe('isRepositoryPermissionErrorMessage', () => {
  it('does not treat capability denials as node ACL errors', () => {
    expect(
      isRepositoryPermissionErrorMessage(
        'Tool "script_execute" is not available for this Alfresco account.'
      )
    ).toBe(false);
  });
});
