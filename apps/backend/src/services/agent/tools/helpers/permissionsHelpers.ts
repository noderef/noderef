/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
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

export function extractPermissionsState(entry: unknown, fallbackNodeId: string): NodePermissionsState {
  const nodeEntry = isRecord(entry) ? entry : {};
  const permissions = isRecord(nodeEntry.permissions) ? nodeEntry.permissions : {};

  const nodeId = typeof nodeEntry.id === 'string' && nodeEntry.id.trim() ? nodeEntry.id : fallbackNodeId;
  const name = typeof nodeEntry.name === 'string' && nodeEntry.name.trim() ? nodeEntry.name : null;

  const pathName =
    isRecord(nodeEntry.path) && typeof nodeEntry.path.name === 'string' ? nodeEntry.path.name : undefined;

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
      typeof permissions.isInheritanceEnabled === 'boolean' ? permissions.isInheritanceEnabled : null,
    localPermissions,
    inheritedPermissions,
    settablePermissions,
  };
}
