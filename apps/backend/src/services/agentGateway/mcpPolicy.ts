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

import type { McpToolAnnotations, McpToolPolicy } from '@app/contracts';

export interface McpConfirmationPolicy {
  policy: McpToolPolicy;
  requiresConfirmation: boolean;
  allowAutoApprove: boolean;
}

export function resolveMcpToolPolicy(annotations: McpToolAnnotations | null | undefined): McpConfirmationPolicy {
  const readOnly = annotations?.readOnlyHint === true;
  const destructive = annotations?.destructiveHint;

  if (readOnly && destructive !== true) {
    return {
      policy: 'read',
      requiresConfirmation: false,
      allowAutoApprove: true,
    };
  }

  if (!readOnly && destructive === false) {
    return {
      policy: 'write',
      requiresConfirmation: true,
      allowAutoApprove: true,
    };
  }

  return {
    policy: 'destructive_or_unknown',
    requiresConfirmation: true,
    allowAutoApprove: false,
  };
}

export function policyLabel(policy: McpToolPolicy): string {
  switch (policy) {
    case 'read':
      return 'read-only according to the gateway';
    case 'write':
      return 'write according to the gateway';
    default:
      return 'destructive or unknown according to the gateway';
  }
}
