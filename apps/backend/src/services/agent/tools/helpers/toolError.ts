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
import { mapError } from '../../../alfresco/errorMapper.js';

export const REPOSITORY_PERMISSION_INSTRUCTION =
  'This Alfresco account does not have permission for this repository action. Tell the user that this action is not allowed for their account on this item. Do not retry the same mutation. Do not claim it succeeded. Ordinary REST tools remain available; Alfresco ACLs still apply per node.';

const PERMISSION_MESSAGE_PATTERN =
  /access denied|permission.?denied|not have the appropriate permissions|does not have permission|\b403\b|\bforbidden\b/i;

export function isRepositoryPermissionErrorMessage(message: string): boolean {
  return PERMISSION_MESSAGE_PATTERN.test(message);
}

export function clarifyToolErrorPayload(error: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { error };
  if (isRepositoryPermissionErrorMessage(error)) {
    payload.errorKind = 'permission_denied';
    payload.instruction = REPOSITORY_PERMISSION_INSTRUCTION;
  }
  return payload;
}

export function clarifyUnknownToolErrorPayload(err: unknown): Record<string, unknown> {
  const mapped = mapError(err);
  if (mapped.code === ErrorCode.PERMISSION_DENIED) {
    return {
      error: mapped.message,
      errorKind: 'permission_denied',
      instruction: REPOSITORY_PERMISSION_INSTRUCTION,
    };
  }
  const raw = err instanceof Error ? err.message : String(err);
  return clarifyToolErrorPayload(raw);
}
