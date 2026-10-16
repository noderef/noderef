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

import { ErrorCode } from '@app/contracts';
import { describe, expect, it } from 'vitest';
import { mapAlfrescoHttpError, mapError } from '../../src/services/alfresco/errorMapper.js';

describe('mapAlfrescoHttpError', () => {
  it('maps a normal 401 to UNAUTHORIZED', () => {
    expect(mapAlfrescoHttpError(401).code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('maps admin-webscript 401/403 to PERMISSION_DENIED', () => {
    expect(mapAlfrescoHttpError(401, { adminWebscript: true }).code).toBe(
      ErrorCode.PERMISSION_DENIED
    );
    expect(mapAlfrescoHttpError(403, { adminWebscript: true }).code).toBe(
      ErrorCode.PERMISSION_DENIED
    );
  });

  it('maps a generic 403 to PERMISSION_DENIED', () => {
    expect(mapAlfrescoHttpError(403).code).toBe(ErrorCode.PERMISSION_DENIED);
  });
});

describe('mapError', () => {
  it('maps superagent 401 without treating it as an admin webscript', () => {
    const mapped = mapError({ status: 401, message: 'Unauthorized' });
    expect(mapped.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('can map superagent 401 as PERMISSION_DENIED for admin webscripts', () => {
    const mapped = mapError({ status: 401, message: 'Unauthorized' }, { adminWebscript: true });
    expect(mapped.code).toBe(ErrorCode.PERMISSION_DENIED);
  });
});
