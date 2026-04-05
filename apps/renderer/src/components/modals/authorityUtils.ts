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

/**
 * Shared types and helpers for Alfresco authority (user/group) management.
 * Used by both NodePermissionsModal and UsersGroupsModal.
 */

export type AuthorityType = 'PERSON' | 'GROUP';

export interface AuthorityResult {
  id: string;
  displayName: string;
  type: AuthorityType;
}

/**
 * Known system/virtual authority IDs that are not real users in Alfresco.
 * The People API returns 500 errors when encountering these, so they must
 * be filtered out from API results and handled with hardcoded display names.
 */
export const SYSTEM_AUTHORITIES: Record<string, string> = {
  system: 'System',
};

const isSystemAuthority = (id: string): boolean => id in SYSTEM_AUTHORITIES;

/** Map Alfresco webscript `api/people` response entries to AuthorityResult[] */
export const mapPeopleResponse = (response: any): AuthorityResult[] => {
  const people = Array.isArray(response?.people) ? response.people : [];
  return people
    .map((entry: any) => ({
      id: String(entry.userName || entry.id || ''),
      displayName: String(
        [entry.firstName, entry.lastName].filter(Boolean).join(' ') ||
          entry.userName ||
          entry.id ||
          ''
      ),
      type: 'PERSON' as AuthorityType,
    }))
    .filter((entry: AuthorityResult) => !isSystemAuthority(entry.id));
};

/** Map Alfresco webscript `api/groups` response entries to AuthorityResult[] */
export const mapGroupsWebscriptResponse = (response: any): AuthorityResult[] => {
  const data = Array.isArray(response?.data) ? response.data : [];
  return data.map((entry: any) => ({
    id: String(entry.fullName || entry.id || entry.shortName || ''),
    displayName: String(entry.displayName || entry.shortName || entry.fullName || ''),
    type: 'GROUP' as AuthorityType,
  }));
};

/** Map Alfresco webscript `api/groups/{id}/children` response entries to AuthorityResult[] */
export const mapGroupChildrenResponse = (response: any): AuthorityResult[] => {
  const data = Array.isArray(response?.data) ? response.data : [];
  return data.map((entry: any) => {
    const isGroup = entry.authorityType === 'GROUP';
    return {
      // For users, shortName is the username (e.g., 'demo'); fullName is the display name
      // For groups, fullName has the GROUP_ prefix (e.g., 'GROUP_ORG_ALGEMEEN')
      id: isGroup
        ? String(entry.fullName || `GROUP_${entry.shortName}` || '')
        : String(entry.shortName || ''),
      displayName: String(entry.displayName || entry.shortName || entry.fullName || ''),
      type: isGroup ? ('GROUP' as AuthorityType) : ('PERSON' as AuthorityType),
    };
  });
};

/**
 * Map Alfresco public API list response (e.g. people.listPeople, groups.listGroups)
 * to AuthorityResult[]. The public API returns { list: { entries: [{ entry: {...} }] } }.
 */
export const mapPublicApiPeopleResponse = (response: any): AuthorityResult[] => {
  const list = response?.list ?? response;
  const entries = Array.isArray(list?.entries)
    ? list.entries.map((item: any) => item?.entry ?? item).filter(Boolean)
    : [];
  return entries
    .map((entry: any) => ({
      id: String(entry.id || entry.userName || ''),
      displayName: String(
        [entry.firstName, entry.lastName].filter(Boolean).join(' ') ||
          entry.displayName ||
          entry.id ||
          ''
      ),
      type: 'PERSON' as AuthorityType,
    }))
    .filter((entry: AuthorityResult) => !isSystemAuthority(entry.id));
};

/** Extended person info including email, name parts, and account status */
export interface PersonDetail extends AuthorityResult {
  firstName: string;
  lastName: string;
  email: string;
  enabled: boolean;
}

/** Like mapPublicApiPeopleResponse but keeps extra person fields */
export const mapPublicApiPeopleDetailResponse = (response: any): PersonDetail[] => {
  const list = response?.list ?? response;
  const entries = Array.isArray(list?.entries)
    ? list.entries.map((item: any) => item?.entry ?? item).filter(Boolean)
    : [];
  return entries
    .map((entry: any) => ({
      id: String(entry.id || entry.userName || ''),
      displayName: String(
        [entry.firstName, entry.lastName].filter(Boolean).join(' ') ||
          entry.displayName ||
          entry.id ||
          ''
      ),
      type: 'PERSON' as AuthorityType,
      firstName: String(entry.firstName || ''),
      lastName: String(entry.lastName || ''),
      email: String(entry.email || ''),
      enabled: entry.enabled !== false,
    }))
    .filter((entry: PersonDetail) => !isSystemAuthority(entry.id));
};

export const mapPublicApiGroupsResponse = (response: any): AuthorityResult[] => {
  const list = response?.list ?? response;
  const entries = Array.isArray(list?.entries)
    ? list.entries.map((item: any) => item?.entry ?? item).filter(Boolean)
    : [];
  return entries.map((entry: any) => ({
    id: String(entry.id || ''),
    displayName: String(entry.displayName || entry.id || ''),
    type: 'GROUP' as AuthorityType,
  }));
};

export const mapPublicApiMembersResponse = (response: any): AuthorityResult[] => {
  const list = response?.list ?? response;
  const entries = Array.isArray(list?.entries)
    ? list.entries.map((item: any) => item?.entry ?? item).filter(Boolean)
    : [];
  return entries.map((entry: any) => ({
    id: String(entry.id || ''),
    displayName: String(entry.displayName || entry.id || ''),
    type: (entry.memberType === 'GROUP' ? 'GROUP' : 'PERSON') as AuthorityType,
  }));
};
