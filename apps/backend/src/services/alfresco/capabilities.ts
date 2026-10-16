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

import type { AlfrescoApi } from '@alfresco/js-api';
import { GroupsApi, PeopleApi, WebscriptApi } from '@alfresco/js-api';
import {
  createOkProfile,
  RESTRICTED_PROFILE,
  type CapabilityProfile,
} from '@app/contracts';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('alfresco.capabilities');

const ALFRESCO_ADMINISTRATORS_GROUP_ID = 'GROUP_ALFRESCO_ADMINISTRATORS';
const GROUP_PAGE_SIZE = 100;
const GROUP_SCAN_LIMIT = 2000;
const DEFAULT_OOTBEE_PROBE_PATH = 'ootbee/admin/log4j-log-files';
const DEFAULT_JSCONSOLE_PATH = 'ootbee/jsconsole';

/**
 * Spike notes (ACS Community 23/25/26, basic + OIDC):
 * S1: GET people/-me-/groups returns nested/transitive memberships and paginates
 *     with skipCount / maxItems / hasMoreItems.
 * S2: webscripts with authentication=admin return 401 for a valid non-admin session
 *     (not 403) — slingshot node, OOTBee logs, jsconsole.
 * S3: GET ootbee/admin/log4j-log-files?format=json → 200 installed, 404 missing,
 *     405 means the path exists. jsconsole GET is often 405 when only POST execute
 *     is allowed.
 * S4: Discovery / repository information is available to authenticated non-admins
 *     on stock Community; get_installed_modules stays unfiltered.
 * S5: Reauth is manual from tree error UI; 401 on admin webscripts must not look
 *     like a session expiry.
 */

export type AlfrescoPersonSummary = {
  id: string;
  displayName: string;
  email?: string;
};

export type CapabilityResolverDeps = {
  getPerson: () => Promise<unknown>;
  listGroupMemberships: (opts: { maxItems: number; skipCount: number }) => Promise<unknown>;
  probeWebscript?: (scriptPath: string) => Promise<number>;
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

function extractGroupEntries(groups: unknown): unknown[] {
  const root = asRecord(groups);
  const list = asRecord(root?.list);
  if (Array.isArray(list?.entries)) {
    return list.entries;
  }
  if (Array.isArray(root?.entries)) {
    return root.entries;
  }
  return [];
}

function paginationHasMore(groups: unknown): boolean {
  const root = asRecord(groups);
  const list = asRecord(root?.list);
  const pagination = asRecord(list?.pagination) ?? asRecord(root?.pagination);
  return pagination?.hasMoreItems === true;
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
 * True when the user belongs to GROUP_ALFRESCO_ADMINISTRATORS (single page).
 */
export function isAdminFromGroupMemberships(groups: unknown): boolean {
  return extractGroupEntries(groups).some(item => {
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

function nowIso(): string {
  return new Date().toISOString();
}

function unknownProfile(): CapabilityProfile {
  return { ...RESTRICTED_PROFILE, checkedAt: nowIso() };
}

export function normalizeJsconsoleEndpoint(endpoint: string | null | undefined): string | null {
  if (!endpoint) {
    return null;
  }
  const trimmed = endpoint.trim().replace(/^\/+/, '').replace(/^s\//, '');
  return trimmed || null;
}

export function isDefaultOotbeeJsconsole(endpoint: string | null | undefined): boolean {
  const normalized = normalizeJsconsoleEndpoint(endpoint);
  return !normalized || normalized === DEFAULT_JSCONSOLE_PATH;
}

function probeIndicatesInstalled(status: number): boolean {
  return status === 200 || status === 405;
}

async function resolveAdminFromGroups(deps: CapabilityResolverDeps): Promise<boolean> {
  let skipCount = 0;
  let scanned = 0;

  while (scanned < GROUP_SCAN_LIMIT) {
    const remaining = GROUP_SCAN_LIMIT - scanned;
    const maxItems = Math.min(GROUP_PAGE_SIZE, remaining);
    const groups = await deps.listGroupMemberships({ maxItems, skipCount });
    if (isAdminFromGroupMemberships(groups)) {
      return true;
    }
    const entries = extractGroupEntries(groups);
    scanned += entries.length;
    if (entries.length === 0 || !paginationHasMore(groups)) {
      return false;
    }
    skipCount += maxItems;
  }

  log.debug({ scanned }, 'Stopped group membership scan at hard ceiling');
  return false;
}

async function probePath(deps: CapabilityResolverDeps, scriptPath: string): Promise<number> {
  if (!deps.probeWebscript) {
    return 0;
  }
  try {
    return await deps.probeWebscript(scriptPath);
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status?: number }).status)
        : 0;
    log.debug({ scriptPath, status, error }, 'Capability probe failed');
    return status || 0;
  }
}

export async function resolveCapabilityProfileWithDeps(
  deps: CapabilityResolverDeps,
  options?: { jsconsoleEndpoint?: string | null }
): Promise<{ profile: CapabilityProfile; user: AlfrescoPersonSummary }> {
  let personEntry: unknown;
  try {
    personEntry = await deps.getPerson();
  } catch (error) {
    log.debug({ error }, 'GET people/-me- failed while resolving capabilities');
    return { profile: unknownProfile(), user: { id: '-me-', displayName: '-me-' } };
  }

  const user = mapPersonSummary(personEntry);
  let isAdmin = isAdminFromPerson(personEntry);

  if (!isAdmin) {
    try {
      isAdmin = await resolveAdminFromGroups(deps);
    } catch (error) {
      log.debug({ error, userId: user.id }, 'Failed to list group memberships');
      isAdmin = false;
    }
  }

  if (!isAdmin) {
    return {
      profile: createOkProfile({
        isAdmin: false,
        jsConsole: false,
        supportTools: false,
        nodeBrowser: false,
      }),
      user,
    };
  }

  const ootbeeStatus = await probePath(deps, DEFAULT_OOTBEE_PROBE_PATH);
  const supportTools = probeIndicatesInstalled(ootbeeStatus);

  const jsconsoleEndpoint = normalizeJsconsoleEndpoint(options?.jsconsoleEndpoint);
  let jsConsole = false;
  if (isDefaultOotbeeJsconsole(jsconsoleEndpoint) || !jsconsoleEndpoint) {
    jsConsole = supportTools;
  } else {
    const customStatus = await probePath(deps, jsconsoleEndpoint);
    jsConsole = probeIndicatesInstalled(customStatus);
  }

  log.debug(
    { userId: user.id, isAdmin, supportTools, jsConsole, ootbeeStatus },
    'Resolved capability profile'
  );

  return {
    profile: createOkProfile({
      isAdmin: true,
      nodeBrowser: true,
      supportTools,
      jsConsole,
    }),
    user,
  };
}

export async function probeWebscriptStatus(api: AlfrescoApi, scriptPath: string): Promise<number> {
  try {
    const webscriptApi = new WebscriptApi(api);
    await webscriptApi.executeWebScript(
      'GET',
      scriptPath,
      { format: 'json' },
      'alfresco',
      'service'
    );
    return 200;
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object'
        ? Number(
            (error as { status?: number }).status ??
              (error as { response?: { status?: number } }).response?.status
          )
        : 0;
    return Number.isFinite(status) && status > 0 ? status : 0;
  }
}

export async function resolveCapabilityProfile(
  api: AlfrescoApi,
  options?: { jsconsoleEndpoint?: string | null }
): Promise<{ profile: CapabilityProfile; user: AlfrescoPersonSummary }> {
  const peopleApi = new PeopleApi(api);
  const groupsApi = new GroupsApi(api);
  return resolveCapabilityProfileWithDeps(
    {
      getPerson: () => peopleApi.getPerson('-me-'),
      listGroupMemberships: opts => groupsApi.listGroupMembershipsForPerson('-me-', opts),
      probeWebscript: path => probeWebscriptStatus(api, path),
    },
    options
  );
}

export async function resolveAlfrescoAdminStatus(api: AlfrescoApi): Promise<{
  isAdmin: boolean;
  user: AlfrescoPersonSummary;
}> {
  const { profile, user } = await resolveCapabilityProfile(api);
  return { isAdmin: profile.isAdmin, user };
}
