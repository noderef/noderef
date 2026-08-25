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

import type { AlfrescoApi } from '@alfresco/js-api';
import { GroupsApi, PeopleApi } from '@alfresco/js-api';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('alfresco.admin-status');

export const ALFRESCO_ADMINISTRATORS_GROUP_ID = 'GROUP_ALFRESCO_ADMINISTRATORS';

export type AlfrescoPersonSummary = {
  id: string;
  displayName: string;
  email?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizeGroupId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const upper = trimmed.toUpperCase();
  return upper.startsWith('GROUP_') ? upper : `GROUP_${upper}`;
}

/**
 * True when the People API payload marks the user as an Alfresco admin.
 * OIDC/Bearer responses often omit `capabilities`, so callers should also
 * check group membership via {@link isAdminFromGroupMemberships}.
 */
export function isAdminFromPerson(person: unknown): boolean {
  const root = asRecord(person);
  const entry = asRecord(root?.entry) ?? root;
  const capabilities = asRecord(entry?.capabilities);
  return capabilities?.isAdmin === true;
}

/**
 * True when the user belongs to GROUP_ALFRESCO_ADMINISTRATORS.
 */
export function isAdminFromGroupMemberships(groups: unknown): boolean {
  const root = asRecord(groups);
  const list = asRecord(root?.list);
  const entries = Array.isArray(list?.entries)
    ? list.entries
    : Array.isArray(root?.entries)
      ? root.entries
      : [];

  return entries.some(item => {
    const record = asRecord(item);
    const entry = asRecord(record?.entry) ?? record;
    const id = typeof entry?.id === 'string' ? entry.id : '';
    return normalizeGroupId(id) === ALFRESCO_ADMINISTRATORS_GROUP_ID;
  });
}

function mapPersonSummary(person: unknown): AlfrescoPersonSummary {
  const root = asRecord(person);
  const entry = asRecord(root?.entry) ?? root;
  const id = typeof entry?.id === 'string' && entry.id ? entry.id : '-me-';
  const firstName = typeof entry?.firstName === 'string' ? entry.firstName : '';
  const displayName =
    (typeof entry?.displayName === 'string' && entry.displayName) || firstName || id;
  const email = typeof entry?.email === 'string' ? entry.email : undefined;

  return { id, displayName, email };
}

/**
 * Resolve the current user's admin status.
 * Uses People API capabilities first, then group membership as a fallback
 * because OIDC sessions frequently omit `capabilities` on GET /people/-me-.
 */
export async function resolveAlfrescoAdminStatus(api: AlfrescoApi): Promise<{
  isAdmin: boolean;
  user: AlfrescoPersonSummary;
}> {
  const peopleApi = new PeopleApi(api);
  const personEntry = await peopleApi.getPerson('-me-');
  const user = mapPersonSummary(personEntry);

  if (isAdminFromPerson(personEntry)) {
    return { isAdmin: true, user };
  }

  try {
    const groupsApi = new GroupsApi(api);
    const groups = await groupsApi.listGroupMembershipsForPerson('-me-', { maxItems: 200 });
    const isAdmin = isAdminFromGroupMemberships(groups);
    log.debug({ userId: user.id, isAdmin }, 'Resolved admin status from group memberships');
    return { isAdmin, user };
  } catch (error) {
    log.debug(
      { error, userId: user.id },
      'Failed to list group memberships while resolving admin status'
    );
    return { isAdmin: false, user };
  }
}
