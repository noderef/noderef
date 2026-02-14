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

import { alfrescoRpc } from '@/core/ipc/alfresco';
import { backendRpc } from '@/core/ipc/backend';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import {
  ActionIcon,
  Badge,
  Button,
  Combobox,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
  useCombobox,
} from '@mantine/core';
import type { NotificationData, NotificationsProps } from '@mantine/notifications';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconTrash, IconUsers } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthorityResult, AuthorityType } from './authorityUtils';
import {
  SYSTEM_AUTHORITIES,
  mapGroupChildrenResponse,
  mapPublicApiGroupsResponse,
  mapGroupsWebscriptResponse,
  mapPeopleResponse,
} from './authorityUtils';

const DEFAULT_ROLES = ['Consumer', 'Editor', 'Contributor', 'Collaborator', 'Coordinator'] as const;
const SITE_ROLES = ['SiteManager', 'SiteCollaborator', 'SiteContributor', 'SiteConsumer'] as const;
type PermissionRole = (typeof DEFAULT_ROLES)[number] | (typeof SITE_ROLES)[number];
const ALL_PERMISSION_ROLES = [...DEFAULT_ROLES, ...SITE_ROLES] as const;
const PAGE_SIZE = 50;

interface PermissionEntry {
  authorityId: string;
  name: string;
  accessStatus?: 'ALLOWED' | 'DENIED';
}

interface NodePermissionsModalPayload {
  serverId: number;
  nodeId: string;
  nodeName?: string;
  onUpdated?: () => void;
}

const isPermissionRole = (role: string): role is PermissionRole =>
  (ALL_PERMISSION_ROLES as readonly string[]).includes(role);

const normalizePermissionEntry = (entry: any): PermissionEntry => {
  const rawAccessStatus = entry?.accessStatus ?? entry?.rel;
  return {
    authorityId: entry?.authorityId ?? entry?.authority ?? '',
    name: entry?.name ?? entry?.permission ?? '',
    accessStatus: rawAccessStatus === 'DENIED' ? 'DENIED' : 'ALLOWED',
  };
};

const getEntryFromResponse = (response: any) => response?.entry ?? response;

const buildSiteGroupId = (siteId: string, role: string) => `GROUP_site_${siteId}_${role}`;

export function NodePermissionsModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.NODE_PERMISSIONS);
  const { t } = useTranslation(['nodeBrowser', 'common']);
  const modalPayload = payload as NodePermissionsModalPayload | undefined;
  const getServerById = useServersStore(state => state.getServerById);
  const notificationPosition: NotificationsProps['position'] = 'bottom-center';
  const showNotification = useCallback(
    (data: NotificationData) =>
      notifications.show({
        position: notificationPosition,
        withCloseButton: true,
        autoClose: 6000,
        ...data,
      }),
    [notificationPosition]
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeLabel, setNodeLabel] = useState('');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [isInheritanceEnabled, setIsInheritanceEnabled] = useState(true);
  const [locallySet, setLocallySet] = useState<PermissionEntry[]>([]);
  const [inherited, setInherited] = useState<PermissionEntry[]>([]);
  const [settable, setSettable] = useState<string[]>([]);

  const [authorityType, setAuthorityType] = useState<AuthorityType>('PERSON');
  const [permissionsView, setPermissionsView] = useState<'local' | 'inherited'>('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [peopleResults, setPeopleResults] = useState<AuthorityResult[]>([]);
  const [groupsResults, setGroupsResults] = useState<AuthorityResult[]>([]);

  const [authorityLoading, setAuthorityLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PermissionRole | null>(null);
  const [authorityDirectory, setAuthorityDirectory] = useState<Record<string, AuthorityResult>>({});
  const permissionsRequestRef = useRef(0);
  const groupsSearchRequestRef = useRef(0);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const [membersGroupLabel, setMembersGroupLabel] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [members, setMembers] = useState<AuthorityResult[]>([]);
  const [memberSearchType, setMemberSearchType] = useState<AuthorityType>('PERSON');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberResults, setMemberResults] = useState<AuthorityResult[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const membersRequestRef = useRef(0);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const roleOptions = useMemo<PermissionRole[]>(() => {
    const inSite = Boolean(siteId);
    const allowedRoles: PermissionRole[] = inSite
      ? [...DEFAULT_ROLES, ...SITE_ROLES]
      : [...DEFAULT_ROLES];
    const settableRoles: PermissionRole[] =
      Array.isArray(settable) && settable.length > 0
        ? settable.filter(isPermissionRole)
        : allowedRoles;
    const filtered = settableRoles.filter(role => allowedRoles.includes(role));
    const roles: PermissionRole[] = filtered.length ? filtered : allowedRoles;
    const ordered = allowedRoles.filter(role => roles.includes(role));
    return Array.from(new Set(ordered));
  }, [siteId, settable]);

  const roleLabel = useCallback(
    (role: string) => {
      switch (role) {
        case 'Consumer':
          return t('nodeBrowser:permissionRoleConsumer');
        case 'Editor':
          return t('nodeBrowser:permissionRoleEditor');
        case 'Contributor':
          return t('nodeBrowser:permissionRoleContributor');
        case 'Collaborator':
          return t('nodeBrowser:permissionRoleCollaborator');
        case 'Coordinator':
          return t('nodeBrowser:permissionRoleCoordinator');
        case 'SiteManager':
          return t('nodeBrowser:permissionRoleSiteManager');
        case 'SiteCollaborator':
          return t('nodeBrowser:permissionRoleSiteCollaborator');
        case 'SiteContributor':
          return t('nodeBrowser:permissionRoleSiteContributor');
        case 'SiteConsumer':
          return t('nodeBrowser:permissionRoleSiteConsumer');
        default:
          return role;
      }
    },
    [t]
  );

  useEffect(() => {
    if (!selectedRole && roleOptions.length > 0) {
      setSelectedRole(roleOptions[0]);
    } else if (selectedRole && !roleOptions.includes(selectedRole)) {
      setSelectedRole(roleOptions[0] ?? null);
    }
  }, [roleOptions, selectedRole]);

  const activeResults = useMemo(() => {
    const results = authorityType === 'PERSON' ? peopleResults : groupsResults;
    if (!searchQuery.trim()) {
      return results;
    }
    const query = searchQuery.trim().toLowerCase();
    return results.filter(result => {
      return (
        result.displayName.toLowerCase().includes(query) || result.id.toLowerCase().includes(query)
      );
    });
  }, [authorityType, peopleResults, groupsResults, searchQuery]);

  const updateAuthorityDirectory = useCallback((entries: AuthorityResult[]) => {
    if (!entries.length) return;
    setAuthorityDirectory(prev => {
      const next = { ...prev };
      for (const entry of entries) {
        next[entry.id] = entry;
      }
      return next;
    });
  }, []);

  const openMembersModal = (groupId: string, label: string) => {
    setMembersGroupId(groupId);
    setMembersGroupLabel(label);
    setMemberSearchQuery('');
    setMemberSearchType('PERSON');
    setMemberResults([]);
    setMembersModalOpen(true);
  };

  const closeMembersModal = () => {
    setMembersModalOpen(false);
    setMembers([]);
    setMembersGroupId(null);
    setMembersGroupLabel(null);
    setMemberSearchQuery('');
    setMemberResults([]);
  };

  const extractSiteId = (entry: any): string | null => {
    const elements = entry?.path?.elements;
    if (Array.isArray(elements)) {
      const siteElement = elements.find((el: any) => {
        const nodeType = String(el?.nodeType || '').toLowerCase();
        return nodeType === 'st:site';
      });
      if (siteElement?.name) {
        return String(siteElement.name);
      }
    }
    const nodeType = String(entry?.nodeType || '').toLowerCase();
    if (nodeType === 'st:site' && entry?.name) {
      return String(entry.name);
    }
    return null;
  };

  const loadPermissions = useCallback(async () => {
    if (!modalPayload) return;
    const server = getServerById(modalPayload.serverId);
    if (!server?.baseUrl) {
      throw new Error(t('nodeBrowser:permissionsServerMissing'));
    }

    const requestId = ++permissionsRequestRef.current;
    const response = await alfrescoRpc.call(
      'nodes.getNode',
      [modalPayload.nodeId, { include: ['permissions', 'path'] }],
      server.baseUrl,
      modalPayload.serverId
    );
    if (requestId !== permissionsRequestRef.current) {
      return;
    }

    const entry = getEntryFromResponse(response);
    const permissions = entry?.permissions ?? {};
    const localEntries: PermissionEntry[] = Array.isArray(permissions.locallySet)
      ? permissions.locallySet.map(normalizePermissionEntry)
      : [];
    const inheritedEntries: PermissionEntry[] = Array.isArray(permissions.inherited)
      ? permissions.inherited.map(normalizePermissionEntry)
      : [];
    const settablePermissions: string[] = Array.isArray(permissions.settable)
      ? permissions.settable.filter((permission: unknown): permission is string =>
          typeof permission === 'string'
        )
      : [];

    setNodeLabel(String(entry?.name || modalPayload.nodeName || modalPayload.nodeId));
    setSiteId(extractSiteId(entry));
    setIsInheritanceEnabled(Boolean(permissions.isInheritanceEnabled ?? true));
    setLocallySet(
      localEntries.filter(
        (permissionEntry: PermissionEntry) => permissionEntry.authorityId && permissionEntry.name
      )
    );
    setInherited(
      inheritedEntries.filter(
        (permissionEntry: PermissionEntry) => permissionEntry.authorityId && permissionEntry.name
      )
    );
    setSettable(settablePermissions);
  }, [getServerById, modalPayload, t]);

  const loadPeoplePage = useCallback(
    async (skipCount: number, reset: boolean) => {
      if (!modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;
      setAuthorityLoading(true);
      try {
        const response = await alfrescoRpc.call(
          'webscript.executeWebScript',
          [
            'GET',
            'api/people',
            {
              filter: '',
              skipCount,
              maxItems: PAGE_SIZE,
              sortBy: 'userName',
              dir: 'asc',
            },
          ],
          server.baseUrl,
          modalPayload.serverId
        );
        const mapped = mapPeopleResponse(response);
        updateAuthorityDirectory(mapped);
        setPeopleResults(prev => (reset ? mapped : [...prev, ...mapped]));
      } catch (err) {
        console.error('[NodePermissionsModal] Failed to load people', err);
        showNotification({
          color: 'red',
          title: t('nodeBrowser:permissionsLoadErrorTitle'),
          message: err instanceof Error ? err.message : t('common:error'),
        });
      } finally {
        setAuthorityLoading(false);
      }
    },
    [getServerById, modalPayload, showNotification, t, updateAuthorityDirectory]
  );

  const loadGroupsPage = useCallback(
    async (skipCount: number, reset: boolean) => {
      if (!modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;
      setAuthorityLoading(true);
      try {
        const response = await alfrescoRpc.call(
          'groups.listGroups',
          [{ maxItems: PAGE_SIZE, skipCount }],
          server.baseUrl,
          modalPayload.serverId
        );
        const mapped = mapPublicApiGroupsResponse(response);
        updateAuthorityDirectory(mapped);
        setGroupsResults(prev => (reset ? mapped : [...prev, ...mapped]));
      } catch (err) {
        console.error('[NodePermissionsModal] Failed to load groups', err);
        showNotification({
          color: 'red',
          title: t('nodeBrowser:permissionsLoadErrorTitle'),
          message: err instanceof Error ? err.message : t('common:error'),
        });
      } finally {
        setAuthorityLoading(false);
      }
    },
    [getServerById, modalPayload, showNotification, t, updateAuthorityDirectory]
  );

  const loadGroupsSearch = useCallback(
    async (query: string) => {
      if (!modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;
      const requestId = ++groupsSearchRequestRef.current;
      setAuthorityLoading(true);
      try {
        const response = await alfrescoRpc.call(
          'webscript.executeWebScript',
          [
            'GET',
            'api/groups',
            {
              shortNameFilter: query,
              skipCount: 0,
              maxItems: PAGE_SIZE,
              sortBy: 'displayName',
              dir: 'asc',
            },
          ],
          server.baseUrl,
          modalPayload.serverId
        );
        if (requestId !== groupsSearchRequestRef.current) {
          return;
        }
        const mapped = mapGroupsWebscriptResponse(response);
        updateAuthorityDirectory(mapped);
        setGroupsResults(mapped);
      } catch (err) {
        if (requestId !== groupsSearchRequestRef.current) {
          return;
        }
        console.error('[NodePermissionsModal] Failed to search groups', err);
        setGroupsResults([]);
      } finally {
        if (requestId === groupsSearchRequestRef.current) {
          setAuthorityLoading(false);
        }
      }
    },
    [getServerById, modalPayload, updateAuthorityDirectory]
  );

  const loadGroupMembers = useCallback(
    async (groupId: string, options?: { silent?: boolean }) => {
      if (!modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;
      const requestId = ++membersRequestRef.current;
      if (!options?.silent) {
        setMembersLoading(true);
      }
      try {
        const shortName = groupId.replace(/^GROUP_/, '');
        const response = await alfrescoRpc.call(
          'webscript.executeWebScript',
          [
            'GET',
            `api/groups/${shortName}/children`,
            {
              skipCount: 0,
              maxItems: 200,
              sortBy: 'displayName',
              dir: 'asc',
            },
          ],
          server.baseUrl,
          modalPayload.serverId
        );
        if (requestId !== membersRequestRef.current) {
          return;
        }
        setMembers(mapGroupChildrenResponse(response));
      } catch (err) {
        console.error('[NodePermissionsModal] Failed to load group members', err);
        if (requestId === membersRequestRef.current) {
          setMembers([]);
        }
      } finally {
        if (!options?.silent) {
          setMembersLoading(false);
        }
      }
    },
    [getServerById, modalPayload]
  );

  const searchMembers = useCallback(
    async (type: AuthorityType, query: string) => {
      if (!modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;
      setMemberSearchLoading(true);
      try {
        if (type === 'PERSON') {
          const response = await alfrescoRpc.call(
            'webscript.executeWebScript',
            [
              'GET',
              'api/people',
              {
                filter: query || '',
                skipCount: 0,
                maxItems: 100,
                sortBy: 'userName',
                dir: 'asc',
              },
            ],
            server.baseUrl,
            modalPayload.serverId
          );
          const mapped = mapPeopleResponse(response);
          const filtered = query
            ? mapped.filter(item =>
                `${item.displayName} ${item.id}`.toLowerCase().includes(query.toLowerCase())
              )
            : mapped;
          setMemberResults(filtered.slice(0, 20));
        } else {
          const response = await alfrescoRpc.call(
            'webscript.executeWebScript',
            [
              'GET',
              'api/groups',
              {
                shortNameFilter: query,
                skipCount: 0,
                maxItems: 25,
                sortBy: 'displayName',
                dir: 'asc',
              },
            ],
            server.baseUrl,
            modalPayload.serverId
          );
          setMemberResults(mapGroupsWebscriptResponse(response));
        }
      } catch (err) {
        console.error('[NodePermissionsModal] Failed to search members', err);
        setMemberResults([]);
      } finally {
        setMemberSearchLoading(false);
      }
    },
    [getServerById, modalPayload]
  );

  const handleAddMember = useCallback(
    async (member: AuthorityResult) => {
      if (!membersGroupId || !modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;

      // Optimistic update: immediately show the new member
      setMembers(prev => {
        if (prev.some(entry => entry.id === member.id)) {
          return prev;
        }
        return [{ ...member }, ...prev];
      });
      setMemberSearchQuery('');
      setMemberResults([]);

      try {
        await alfrescoRpc.call(
          'groups.createGroupMembership',
          [membersGroupId, { id: member.id, memberType: member.type }],
          server.baseUrl,
          modalPayload.serverId
        );
      } catch (err) {
        console.error('[NodePermissionsModal] Failed to add member', err);
        // Revert optimistic update on failure
        setMembers(prev => prev.filter(entry => entry.id !== member.id));
      }
    },
    [getServerById, membersGroupId, modalPayload]
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!membersGroupId || !modalPayload) return;
      const server = getServerById(modalPayload.serverId);
      if (!server?.baseUrl) return;

      // Optimistic update: immediately remove from list
      setMembers(prev => prev.filter(entry => entry.id !== memberId));

      try {
        await alfrescoRpc.call(
          'groups.deleteGroupMembership',
          [membersGroupId, memberId],
          server.baseUrl,
          modalPayload.serverId
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // If already removed on server, keep the optimistic state
        if (message.includes('Not Found') || message.includes('NOT_FOUND')) {
          return;
        }
        console.error('[NodePermissionsModal] Failed to remove member', err);
        // Revert optimistic update on actual failure - reload from server
        if (membersGroupId) {
          loadGroupMembers(membersGroupId, { silent: true });
        }
      }
    },
    [getServerById, loadGroupMembers, membersGroupId, modalPayload]
  );

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSearchQuery('');
    setPermissionsView('local');
    setPeopleResults([]);
    setGroupsResults([]);

    setAuthorityDirectory({});
    setSelectedRole(null);

    loadPermissions()
      .catch(err => {
        console.error('[NodePermissionsModal] Failed to load permissions', err);
        setError(err instanceof Error ? err.message : t('common:error'));
      })
      .finally(() => setLoading(false));
  }, [isOpen, loadPermissions, t]);

  useEffect(() => {
    if (!isOpen || !modalPayload) return;
    if (authorityType === 'PERSON') {
      loadPeoplePage(0, true);
    } else {
      loadGroupsPage(0, true);
    }
  }, [authorityType, isOpen, loadGroupsPage, loadPeoplePage, modalPayload]);

  useEffect(() => {
    if (!isOpen || authorityType !== 'GROUP') return;
    const query = searchQuery.trim();
    if (!query) {
      loadGroupsPage(0, true);
      return;
    }
    const handle = window.setTimeout(() => {
      loadGroupsSearch(query);
    }, 300);
    return () => {
      window.clearTimeout(handle);
    };
  }, [authorityType, isOpen, loadGroupsPage, loadGroupsSearch, searchQuery]);

  useEffect(() => {
    if (!membersModalOpen || !membersGroupId) return;
    loadGroupMembers(membersGroupId);
  }, [loadGroupMembers, membersGroupId, membersModalOpen]);

  useEffect(() => {
    if (!membersModalOpen) return;
    const query = memberSearchQuery.trim();
    if (!query) {
      setMemberResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      searchMembers(memberSearchType, query);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [memberSearchQuery, memberSearchType, membersModalOpen, searchMembers]);

  const handleAddAuthority = (authority: AuthorityResult, roleOverride?: string) => {
    const role = roleOverride ?? selectedRole;
    if (!role || !isPermissionRole(role)) return;
    setLocallySet(prev => {
      const existingIndex = prev.findIndex(entry => entry.authorityId === authority.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          name: role,
          accessStatus: updated[existingIndex].accessStatus ?? 'ALLOWED',
        };
        return updated;
      }
      return [
        ...prev,
        {
          authorityId: authority.id,
          name: role,
          accessStatus: 'ALLOWED',
        },
      ];
    });
    updateAuthorityDirectory([authority]);
    combobox.closeDropdown();
    setSearchQuery('');
  };

  const handleRemoveAuthority = (authorityId: string) => {
    setLocallySet(prev => prev.filter(entry => entry.authorityId !== authorityId));
  };

  const handlePermissionChange = (authorityId: string, role: string | null) => {
    if (!role || !isPermissionRole(role)) return;
    setLocallySet(prev =>
      prev.map(entry => (entry.authorityId === authorityId ? { ...entry, name: role } : entry))
    );
  };

  const handleSave = async () => {
    if (!modalPayload) return;
    setSaving(true);
    try {
      const sanitizedLocallySet = locallySet
        .filter(entry => entry.authorityId && entry.name)
        .map(entry => {
          const accessStatus: 'ALLOWED' | 'DENIED' =
            entry.accessStatus === 'DENIED' ? 'DENIED' : 'ALLOWED';
          return {
            authorityId: entry.authorityId,
            name: entry.name,
            accessStatus,
          };
        });

      await backendRpc.repository.updateNodePermissions(
        modalPayload.serverId,
        modalPayload.nodeId,
        {
          isInheritanceEnabled,
          locallySet: sanitizedLocallySet,
        }
      );

      showNotification({
        color: 'green',
        title: t('nodeBrowser:permissionsSavedTitle'),
        message: t('nodeBrowser:permissionsSavedMessage'),
      });
      modalPayload.onUpdated?.();
      close();
    } catch (err) {
      console.error('[NodePermissionsModal] Failed to save permissions', err);
      showNotification({
        color: 'red',
        title: t('nodeBrowser:permissionsSaveErrorTitle'),
        message: err instanceof Error ? err.message : t('common:error'),
      });
    } finally {
      setSaving(false);
    }
  };

  const getAuthorityLabel = (authorityId: string) => {
    if (authorityId in SYSTEM_AUTHORITIES) {
      return SYSTEM_AUTHORITIES[authorityId];
    }
    const known = authorityDirectory[authorityId];
    return known?.displayName || authorityId;
  };

  const getAuthorityType = (authorityId: string): AuthorityType => {
    const known = authorityDirectory[authorityId];
    if (known?.type) return known.type;
    return authorityId.startsWith('GROUP_') ? 'GROUP' : 'PERSON';
  };

  const renderPermissionRows = (entries: PermissionEntry[], editable: boolean) => {
    if (!entries.length) {
      return (
        <Table.Tr>
          <Table.Td colSpan={4}>
            <Text size="sm" c="dimmed">
              {editable
                ? t('nodeBrowser:permissionsNoLocal')
                : t('nodeBrowser:permissionsNoInherited')}
            </Text>
          </Table.Td>
        </Table.Tr>
      );
    }

    return entries.map(entry => {
      const authorityLabel = getAuthorityLabel(entry.authorityId);
      const authorityTypeLabel =
        getAuthorityType(entry.authorityId) === 'GROUP'
          ? t('nodeBrowser:permissionsGroup')
          : t('nodeBrowser:permissionsUser');
      const isGroup = getAuthorityType(entry.authorityId) === 'GROUP';
      const accessStatus = entry.accessStatus ?? 'ALLOWED';
      const isAllowed = accessStatus === 'ALLOWED';

      return (
        <Table.Tr key={`${entry.authorityId}-${entry.name}`}>
          <Table.Td>
            <Stack gap={2}>
              <Tooltip label={authorityLabel} withArrow withinPortal={false}>
                <Text size="sm" fw={500} lineClamp={1} title={authorityLabel}>
                  {authorityLabel}
                </Text>
              </Tooltip>
              <Group gap="xs" wrap="nowrap">
                <Badge size="xs" variant="light">
                  {authorityTypeLabel}
                </Badge>
                <Tooltip label={entry.authorityId} withArrow withinPortal={false}>
                  <Text size="xs" c="dimmed" lineClamp={1} title={entry.authorityId}>
                    {entry.authorityId}
                  </Text>
                </Tooltip>
              </Group>
            </Stack>
          </Table.Td>
          <Table.Td>
            {editable && isAllowed ? (
              <Select
                data={roleOptions.map(role => ({ value: role, label: roleLabel(role) }))}
                value={entry.name}
                onChange={value => handlePermissionChange(entry.authorityId, value)}
                size="xs"
                comboboxProps={{
                  withinPortal: true,
                  position: 'bottom-start',
                  offset: 6,
                  zIndex: 10000,
                }}
              />
            ) : (
              <Text size="sm">{roleLabel(entry.name)}</Text>
            )}
          </Table.Td>
          <Table.Td>
            <Badge color={isAllowed ? 'green' : 'red'} size="sm">
              {accessStatus}
            </Badge>
          </Table.Td>
          <Table.Td>
            {isGroup && (
              <ActionIcon
                variant="subtle"
                onClick={() => openMembersModal(entry.authorityId, authorityLabel)}
                aria-label={t('nodeBrowser:permissionsManageMembers')}
              >
                <IconUsers size={14} />
              </ActionIcon>
            )}
            {editable && (
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => handleRemoveAuthority(entry.authorityId)}
                aria-label={t('nodeBrowser:permissionsRemove')}
              >
                <IconTrash size={14} />
              </ActionIcon>
            )}
          </Table.Td>
        </Table.Tr>
      );
    });
  };

  const siteGroupOptions = useMemo(() => {
    if (!siteId) return [];
    return SITE_ROLES.map(role => ({
      id: buildSiteGroupId(siteId, role),
      label: `${siteId} · ${roleLabel(role)}`,
      role,
    }));
  }, [siteId, roleLabel]);

  const activePermissionEntries = permissionsView === 'local' ? locallySet : inherited;
  const isEditableView = permissionsView === 'local';
  const visibleResults = useMemo(() => activeResults.slice(0, 8), [activeResults]);
  const comboboxOptions = useMemo(() => {
    if (authorityType === 'GROUP' && siteGroupOptions.length > 0 && !searchQuery.trim()) {
      return siteGroupOptions.map(option => ({
        id: option.id,
        displayName: option.label,
        type: 'GROUP' as AuthorityType,
      }));
    }
    return visibleResults;
  }, [authorityType, searchQuery, siteGroupOptions, visibleResults]);

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={close}
        title={t('nodeBrowser:permissionsManageTitle')}
        size="xl"
        centered
        trapFocus
        returnFocus
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        transitionProps={{ duration: 300, transition: 'fade' }}
      >
        <Stack gap="sm">
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
              <Text c="dimmed">{t('common:loading')}</Text>
            </Group>
          ) : error ? (
            <Text c="red" size="sm">
              {error}
            </Text>
          ) : (
            <>
              <Group justify="space-between" align="center">
                <Stack gap={2}>
                  <Text fw={600}>{nodeLabel}</Text>
                  <Text size="xs" c="dimmed">
                    {modalPayload?.nodeId}
                  </Text>
                </Stack>
                <Group gap="sm">
                  {siteId && (
                    <Badge variant="light" color="blue">
                      {t('nodeBrowser:permissionsSiteBadge', { siteId })}
                    </Badge>
                  )}
                  <Switch
                    checked={isInheritanceEnabled}
                    onChange={event => setIsInheritanceEnabled(event.currentTarget.checked)}
                    label={t('nodeBrowser:permissionsInheritLabel')}
                  />
                </Group>
              </Group>

              <Paper withBorder p="sm">
                <Stack gap="sm">
                  <Text fw={600}>{t('nodeBrowser:permissionsAddTitle')}</Text>
                  <Group align="flex-end" grow>
                    <Stack gap={4}>
                      <Text size="xs" fw={600} c="dimmed">
                        {t('nodeBrowser:permissionsAuthorityLabel')}
                      </Text>
                      <SegmentedControl
                        value={authorityType}
                        onChange={value => setAuthorityType(value as AuthorityType)}
                        data={[
                          { value: 'PERSON', label: t('nodeBrowser:permissionsUsers') },
                          { value: 'GROUP', label: t('nodeBrowser:permissionsGroups') },
                        ]}
                      />
                    </Stack>
                    <Stack gap={4}>
                      <Text size="xs" fw={600} c="dimmed">
                        {t('nodeBrowser:permissionsRoleLabel')}
                      </Text>
                      <Select
                        data={roleOptions.map(role => ({ value: role, label: roleLabel(role) }))}
                        value={selectedRole}
                        onChange={value =>
                          setSelectedRole(value && isPermissionRole(value) ? value : null)
                        }
                        placeholder={t('nodeBrowser:permissionsRolePlaceholder')}
                        comboboxProps={{ withinPortal: true, position: 'bottom-start', offset: 6 }}
                      />
                    </Stack>
                  </Group>
                  <Combobox
                    store={combobox}
                    withinPortal
                    onOptionSubmit={value => {
                      const selected = activeResults.find(entry => entry.id === value);
                      if (selected) {
                        handleAddAuthority(selected);
                      }
                    }}
                  >
                    <Combobox.Target>
                      <Combobox.EventsTarget>
                        <TextInput
                          value={searchQuery}
                          onChange={event => {
                            const next = event.currentTarget.value;
                            setSearchQuery(next);
                            combobox.openDropdown();
                          }}
                          onFocus={() => combobox.openDropdown()}
                          onBlur={() => combobox.closeDropdown()}
                          placeholder={t('nodeBrowser:permissionsSearchPlaceholder')}
                          leftSection={<IconSearch size={14} />}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </Combobox.EventsTarget>
                    </Combobox.Target>
                    <Combobox.Dropdown
                      styles={{
                        dropdown: {
                          maxHeight: 220,
                          overflowY: 'auto',
                          zIndex: 10000,
                        },
                      }}
                    >
                      <Combobox.Options>
                        {authorityLoading && <Combobox.Empty>{t('common:loading')}</Combobox.Empty>}
                        {!authorityLoading && comboboxOptions.length === 0 && (
                          <Combobox.Empty>{t('nodeBrowser:permissionsNoResults')}</Combobox.Empty>
                        )}
                        {!authorityLoading &&
                          comboboxOptions.map(result => (
                            <Combobox.Option value={result.id} key={result.id}>
                              <Stack gap={0}>
                                <Text size="sm" fw={500}>
                                  {result.displayName || result.id}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {result.id}
                                </Text>
                              </Stack>
                            </Combobox.Option>
                          ))}
                      </Combobox.Options>
                    </Combobox.Dropdown>
                  </Combobox>
                </Stack>
              </Paper>

              <Paper withBorder p="sm">
                <Group justify="space-between" align="center" mb="xs">
                  <SegmentedControl
                    value={permissionsView}
                    onChange={value => setPermissionsView(value as 'local' | 'inherited')}
                    data={[
                      {
                        value: 'local',
                        label: `${t('nodeBrowser:permissionsLocalTitle')} (${locallySet.length})`,
                      },
                      {
                        value: 'inherited',
                        label: `${t('nodeBrowser:permissionsInheritedTitle')} (${inherited.length})`,
                      },
                    ]}
                  />
                </Group>
                <ScrollArea h={180}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('nodeBrowser:authority')}</Table.Th>
                        <Table.Th>{t('nodeBrowser:permission')}</Table.Th>
                        <Table.Th>{t('nodeBrowser:access')}</Table.Th>
                        <Table.Th />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {renderPermissionRows(activePermissionEntries, isEditableView)}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>

              <Group justify="flex-end" mt="sm">
                <Button variant="subtle" onClick={close} disabled={saving}>
                  {t('common:cancel')}
                </Button>
                <Button onClick={handleSave} loading={saving} disabled={loading}>
                  {t('nodeBrowser:permissionsSaveAction')}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
      <MembersModal
        opened={membersModalOpen}
        onClose={closeMembersModal}
        title={t('nodeBrowser:permissionsManageMembersTitle', { group: membersGroupLabel ?? '' })}
        members={members}
        loading={membersLoading}
        memberSearchType={memberSearchType}
        onSearchTypeChange={setMemberSearchType}
        memberSearchQuery={memberSearchQuery}
        onSearchQueryChange={setMemberSearchQuery}
        memberResults={memberResults}
        memberSearchLoading={memberSearchLoading}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
      />
    </>
  );
}

function MembersModal({
  opened,
  onClose,
  title,
  members,
  loading,
  memberSearchType,
  onSearchTypeChange,
  memberSearchQuery,
  onSearchQueryChange,
  memberResults,
  memberSearchLoading,
  onAddMember,
  onRemoveMember,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  members: AuthorityResult[];
  loading: boolean;
  memberSearchType: AuthorityType;
  onSearchTypeChange: (value: AuthorityType) => void;
  memberSearchQuery: string;
  onSearchQueryChange: (value: string) => void;
  memberResults: AuthorityResult[];
  memberSearchLoading: boolean;
  onAddMember: (member: AuthorityResult) => void;
  onRemoveMember: (memberId: string) => void;
}) {
  const { t } = useTranslation(['nodeBrowser', 'common']);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="lg"
      centered
      styles={{ body: { minHeight: 440 } }}
    >
      <Stack gap="sm" mih={380}>
        <SegmentedControl
          value={memberSearchType}
          onChange={value => onSearchTypeChange(value as AuthorityType)}
          data={[
            { value: 'PERSON', label: t('nodeBrowser:permissionsUsers') },
            { value: 'GROUP', label: t('nodeBrowser:permissionsGroups') },
          ]}
        />
        <Combobox
          store={combobox}
          withinPortal={false}
          onOptionSubmit={value => {
            const selected = memberResults.find(entry => entry.id === value);
            if (selected) {
              onAddMember(selected);
              combobox.closeDropdown();
              onSearchQueryChange('');
            }
          }}
        >
          <Combobox.Target>
            <Combobox.EventsTarget>
              <TextInput
                value={memberSearchQuery}
                onChange={event => {
                  onSearchQueryChange(event.currentTarget.value);
                  combobox.openDropdown();
                }}
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                placeholder={t('nodeBrowser:permissionsMemberSearchPlaceholder')}
                leftSection={<IconSearch size={14} />}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </Combobox.EventsTarget>
          </Combobox.Target>
          <Combobox.Dropdown
            styles={{
              dropdown: {
                maxHeight: 220,
                overflowY: 'auto',
              },
            }}
          >
            <Combobox.Options>
              {memberSearchLoading && <Combobox.Empty>{t('common:loading')}</Combobox.Empty>}
              {!memberSearchLoading && memberResults.length === 0 && (
                <Combobox.Empty>{t('nodeBrowser:permissionsNoResults')}</Combobox.Empty>
              )}
              {!memberSearchLoading &&
                memberResults.map(result => (
                  <Combobox.Option value={result.id} key={result.id}>
                    <Stack gap={0}>
                      <Text size="sm" fw={500}>
                        {result.displayName || result.id}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {result.id}
                      </Text>
                    </Stack>
                  </Combobox.Option>
                ))}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        <Text fw={600}>{t('nodeBrowser:permissionsMembersTitle')}</Text>
        <ScrollArea h={280}>
          {loading ? (
            <Group gap="xs" py="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                {t('common:loading')}
              </Text>
            </Group>
          ) : members.length === 0 ? (
            <Text size="sm" c="dimmed" py="xs">
              {t('nodeBrowser:permissionsNoMembers')}
            </Text>
          ) : (
            <Stack gap="xs">
              {members.map(member => (
                <Paper key={member.id} withBorder p="xs">
                  <Group justify="space-between" align="center">
                    <Stack gap={2}>
                      <Text size="sm" fw={500}>
                        {member.displayName || member.id}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {member.id}
                      </Text>
                    </Stack>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => onRemoveMember(member.id)}
                      aria-label={t('nodeBrowser:permissionsRemoveMember')}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </ScrollArea>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t('common:close')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
