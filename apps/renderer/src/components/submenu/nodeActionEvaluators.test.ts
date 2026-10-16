/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
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
  canDelete,
  canManagePermissions,
  canRename,
  type NodeActionContext,
} from './nodeActionEvaluators';

function ctx(overrides: Partial<NodeActionContext> = {}): NodeActionContext {
  return {
    nodeId: 'abc-123',
    nodeName: 'Report.pdf',
    nodeType: 'cm:content',
    isFolder: false,
    isFile: true,
    ...overrides,
  };
}

describe('nodeActionEvaluators allowableOperations', () => {
  it('blocks rename, delete and permissions for a read-only node', () => {
    const readOnly = ctx({ allowableOperations: [] });
    expect(canRename(readOnly)).toBe(false);
    expect(canDelete(readOnly)).toBe(false);
    expect(canManagePermissions(readOnly)).toBe(false);
  });

  it('allows rename only for Collaborator-like update rights', () => {
    const collaborator = ctx({ allowableOperations: ['update'] });
    expect(canRename(collaborator)).toBe(true);
    expect(canDelete(collaborator)).toBe(false);
    expect(canManagePermissions(collaborator)).toBe(false);
  });

  it('allows rename, delete and permissions for Coordinator rights', () => {
    const coordinator = ctx({
      allowableOperations: ['update', 'delete', 'updatePermissions'],
    });
    expect(canRename(coordinator)).toBe(true);
    expect(canDelete(coordinator)).toBe(true);
    expect(canManagePermissions(coordinator)).toBe(true);
  });

  it('stays permissive when allowableOperations is unknown', () => {
    const unknown = ctx();
    expect(canRename(unknown)).toBe(true);
    expect(canDelete(unknown)).toBe(true);
    expect(canManagePermissions(unknown)).toBe(true);
  });
});
