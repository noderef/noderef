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
import { resolveMcpToolPolicy } from '../../../src/services/agentGateway/mcpPolicy.js';

describe('resolveMcpToolPolicy', () => {
  it('treats read-only non-destructive tools as auto-approved reads', () => {
    expect(resolveMcpToolPolicy({ readOnlyHint: true, destructiveHint: false })).toEqual({
      policy: 'read',
      requiresConfirmation: false,
      allowAutoApprove: true,
    });
  });

  it('requires confirmation but allows auto-approve for explicit non-destructive writes', () => {
    expect(resolveMcpToolPolicy({ readOnlyHint: false, destructiveHint: false })).toEqual({
      policy: 'write',
      requiresConfirmation: true,
      allowAutoApprove: true,
    });
  });

  it('requires manual confirmation for destructive or missing annotations', () => {
    expect(resolveMcpToolPolicy({ destructiveHint: true })).toMatchObject({
      policy: 'destructive_or_unknown',
      requiresConfirmation: true,
      allowAutoApprove: false,
    });
    expect(resolveMcpToolPolicy(null)).toMatchObject({
      policy: 'destructive_or_unknown',
      allowAutoApprove: false,
    });
  });
});
