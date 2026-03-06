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

import { NodesApi } from '@alfresco/js-api';
import { getAlfrescoNodePath } from '../../../../lib/alfresco-endpoints.js';
import type { AgentExecutionContext } from '../../types.js';
import { isRecord } from '../helpers/nodeResultHelpers.js';
import { extractPermissionsState, type PermissionSummary } from '../helpers/permissionsHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';

interface PermissionChange {
  authority: string;
  role: string;
}

interface PermissionElementPayload {
  authorityId: string;
  name: string;
  accessStatus: string;
}

function parsePermissionChanges(value: unknown): PermissionChange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const parsed: PermissionChange[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const authority = typeof item.authority === 'string' ? item.authority.trim() : '';
    const role = typeof item.role === 'string' ? item.role.trim() : '';
    if (!authority || !role) {
      continue;
    }

    const key = `${authority}::${role}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    parsed.push({ authority, role });
  }

  return parsed;
}

function toPermissionMap(
  localPermissions: PermissionSummary[]
): Map<string, PermissionElementPayload> {
  const map = new Map<string, PermissionElementPayload>();
  for (const item of localPermissions) {
    const key = `${item.authority}::${item.role}`;
    map.set(key, {
      authorityId: item.authority,
      name: item.role,
      accessStatus: item.accessStatus,
    });
  }
  return map;
}

export const permissionsSetTool: ToolDefinition = {
  name: 'permissions_set',
  description:
    'Update node ACLs by toggling inheritance and adding/removing local permission entries.',
  skill: { kind: 'local_md', path: '../skills/permissions_set.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID (UUID) to modify permissions for' },
      isInheritanceEnabled: {
        type: 'boolean',
        description: 'Optional inheritance toggle for this node',
      },
      addPermissions: {
        type: 'array',
        description: 'Permissions to add, each item as { authority, role }',
        items: {
          type: 'object',
          properties: {
            authority: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['authority', 'role'],
        },
      },
      removePermissions: {
        type: 'array',
        description: 'Permissions to remove, each item as { authority, role }',
        items: {
          type: 'object',
          properties: {
            authority: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['authority', 'role'],
        },
      },
    },
    required: ['nodeId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
      if (!nodeId) {
        return { ok: false, error: 'nodeId is required' };
      }

      const isInheritanceEnabled =
        typeof args.isInheritanceEnabled === 'boolean' ? args.isInheritanceEnabled : undefined;
      const addPermissions = parsePermissionChanges(args.addPermissions);
      const removePermissions = parsePermissionChanges(args.removePermissions);

      const hasPermissionChanges = addPermissions.length > 0 || removePermissions.length > 0;
      if (typeof isInheritanceEnabled !== 'boolean' && !hasPermissionChanges) {
        return {
          ok: false,
          error:
            'Provide at least one change: isInheritanceEnabled, addPermissions, or removePermissions',
        };
      }

      const requestQuery = {
        fields: ['id', 'name', 'path', 'permissions'],
        include: ['path', 'permissions'],
      };

      const nodesApi = new NodesApi(ctx.api);

      let beforeResult: unknown = null;
      const updatedPermissionElements: PermissionElementPayload[] = [];

      if (hasPermissionChanges) {
        if (ctx.signal.aborted) {
          throw new Error('Run was cancelled');
        }

        beforeResult = await nodesApi.getNode(nodeId, requestQuery);
        const beforeEntry = (beforeResult as any)?.entry ?? beforeResult;
        const beforeState = extractPermissionsState(beforeEntry, nodeId);

        const permissionMap = toPermissionMap(beforeState.localPermissions);

        for (const item of addPermissions) {
          permissionMap.set(`${item.authority}::${item.role}`, {
            authorityId: item.authority,
            name: item.role,
            accessStatus: 'ALLOWED',
          });
        }

        for (const item of removePermissions) {
          permissionMap.delete(`${item.authority}::${item.role}`);
        }

        updatedPermissionElements.push(...permissionMap.values());
      }

      const permissionsBody: Record<string, unknown> = {
        ...(typeof isInheritanceEnabled === 'boolean' ? { isInheritanceEnabled } : {}),
        ...(hasPermissionChanges ? { locallySet: updatedPermissionElements } : {}),
      };
      if (!Object.keys(permissionsBody).length) {
        return { ok: false, error: 'No valid permission changes were provided' };
      }

      const requestBody = { permissions: permissionsBody };

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }
      const updateResult = await (nodesApi as any).updateNode(nodeId, requestBody);

      if (ctx.signal.aborted) {
        throw new Error('Run was cancelled');
      }
      const readBackResult = await nodesApi.getNode(nodeId, requestQuery);
      const readBackEntry = (readBackResult as any)?.entry ?? readBackResult;
      const finalState = extractPermissionsState(readBackEntry, nodeId);

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'PUT',
            path: getAlfrescoNodePath(nodeId),
            request: {
              body: requestBody,
              query: requestQuery,
            },
            responseBody: {
              before: beforeResult,
              update: updateResult,
              readBack: readBackResult,
            },
          },
          nodeId: finalState.nodeId,
          name: finalState.name,
          path: finalState.path,
          isInheritanceEnabled: finalState.isInheritanceEnabled,
          localPermissions: finalState.localPermissions,
          inheritedPermissions: finalState.inheritedPermissions,
          settablePermissions: finalState.settablePermissions,
          requestedChanges: {
            isInheritanceEnabled:
              typeof isInheritanceEnabled === 'boolean' ? isInheritanceEnabled : null,
            addPermissions,
            removePermissions,
          },
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
