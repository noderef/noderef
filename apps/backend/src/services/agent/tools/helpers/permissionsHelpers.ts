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

import { isRecord, normalizeNodePath } from './nodeResultHelpers.js';

export interface PermissionSummary {
  authority: string;
  role: string;
  accessStatus: string;
}

export interface NodePermissionsState {
  nodeId: string;
  name: string | null;
  path: string | null;
  isInheritanceEnabled: boolean | null;
  localPermissions: PermissionSummary[];
  inheritedPermissions: PermissionSummary[];
  settablePermissions: string[];
}

function toPermissionSummary(value: unknown): PermissionSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const authorityRaw =
    typeof value.authorityId === 'string'
      ? value.authorityId
      : typeof value.authority === 'string'
        ? value.authority
        : '';
  const roleRaw =
    typeof value.name === 'string' ? value.name : typeof value.role === 'string' ? value.role : '';

  const authority = authorityRaw.trim();
  const role = roleRaw.trim();
  if (!authority || !role) {
    return null;
  }

  const accessStatus =
    typeof value.accessStatus === 'string' && value.accessStatus.trim()
      ? value.accessStatus.trim()
      : 'ALLOWED';

  return {
    authority,
    role,
    accessStatus,
  };
}

export function extractPermissionsState(
  entry: unknown,
  fallbackNodeId: string
): NodePermissionsState {
  const nodeEntry = isRecord(entry) ? entry : {};
  const permissions = isRecord(nodeEntry.permissions) ? nodeEntry.permissions : {};

  const nodeId =
    typeof nodeEntry.id === 'string' && nodeEntry.id.trim() ? nodeEntry.id : fallbackNodeId;
  const name = typeof nodeEntry.name === 'string' && nodeEntry.name.trim() ? nodeEntry.name : null;

  const pathName =
    isRecord(nodeEntry.path) && typeof nodeEntry.path.name === 'string'
      ? nodeEntry.path.name
      : undefined;

  const localPermissions = Array.isArray(permissions.locallySet)
    ? permissions.locallySet
        .map(toPermissionSummary)
        .filter((item): item is PermissionSummary => Boolean(item))
    : [];
  const inheritedPermissions = Array.isArray(permissions.inherited)
    ? permissions.inherited
        .map(toPermissionSummary)
        .filter((item): item is PermissionSummary => Boolean(item))
    : [];
  const settablePermissions = Array.isArray(permissions.settable)
    ? permissions.settable
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : [];

  return {
    nodeId,
    name,
    path: normalizeNodePath(pathName),
    isInheritanceEnabled:
      typeof permissions.isInheritanceEnabled === 'boolean'
        ? permissions.isInheritanceEnabled
        : null,
    localPermissions,
    inheritedPermissions,
    settablePermissions,
  };
}
