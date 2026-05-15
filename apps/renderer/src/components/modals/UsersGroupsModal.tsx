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
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Combobox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconSearch, IconTrash, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildGroupListWhereDisplayNameContains,
  mapGroupsWebscriptResponse,
  mapPublicApiGroupsResponse,
  mapPublicApiMembersResponse,
  mapPublicApiPeopleDetailResponse,
  mapPublicApiPeopleResponse,
  parsePublicApiListPagination,
  type AuthorityResult,
  type AuthorityType,
  type PersonDetail,
} from './authorityUtils';

const PAGE_SIZE = 50;
const USERS_TAB_PEOPLE_ORDER_BY = ['lastName', 'firstName'] as const;
/** Groups shown in Create User multi-select (separate from groups-tab list / search). */
const GROUP_PICKER_MAX = 200;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UsersGroupsModalPayload {
  serverId: number;
}

/* ------------------------------------------------------------------ */
/* Users & Groups Modal                                               */
/* ------------------------------------------------------------------ */

export function UsersGroupsModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.USERS_GROUPS);
  const { t } = useTranslation(['usersGroups', 'common']);
  const modalPayload = payload as UsersGroupsModalPayload | undefined;
  const getServerById = useServersStore(state => state.getServerById);

  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** Shared debounced value for server-side search on Users and Groups tabs. */
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Users tab: server-paged list + backend search (listPeople / queries.findPeople)
  const [usersTabList, setUsersTabList] = useState<PersonDetail[]>([]);
  const [usersTabHasMore, setUsersTabHasMore] = useState(false);
  const usersTabRequestRef = useRef(0);
  const usersTabNextSkipRef = useRef(0);
  const usersScrollViewportRef = useRef<HTMLDivElement>(null);
  const usersLoadMoreLockRef = useRef(false);

  // Groups tab: server-paged list + backend search (GET /groups; webscript fallback)
  const [groupsTabList, setGroupsTabList] = useState<AuthorityResult[]>([]);
  const [groupsTabHasMore, setGroupsTabHasMore] = useState(false);
  const [groupsTabLoading, setGroupsTabLoading] = useState(false);
  const [groupsTabLoadingMore, setGroupsTabLoadingMore] = useState(false);
  const groupsTabRequestRef = useRef(0);
  const groupsTabNextSkipRef = useRef(0);
  const groupsScrollViewportRef = useRef<HTMLDivElement>(null);
  const groupsLoadMoreLockRef = useRef(false);

  // Groups for Create User picker (not affected by groups-tab search)
  const [groupsPickerList, setGroupsPickerList] = useState<AuthorityResult[]>([]);

  // Per-user group memberships (lazy loaded)
  const [userGroupsMap, setUserGroupsMap] = useState<Record<string, AuthorityResult[]>>({});
  const [userGroupsLoading, setUserGroupsLoading] = useState<Record<string, boolean>>({});

  // Create user form
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserGroups, setNewUserGroups] = useState<string[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);

  // Create group form
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupDisplayName, setNewGroupDisplayName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Members sub-modal
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

  const server = modalPayload ? getServerById(modalPayload.serverId) : undefined;

  /* ---- Data loading ---- */

  const fetchUsersTab = useCallback(
    async ({ reset, append }: { reset: boolean; append: boolean }) => {
      if (!server?.baseUrl || !modalPayload) return;
      const query = debouncedSearchQuery.trim();
      const requestId = ++usersTabRequestRef.current;

      if (reset) {
        setUsersLoading(true);
        usersTabNextSkipRef.current = 0;
        setUserGroupsMap({});
        setUserGroupsLoading({});
      } else if (append) {
        setUsersLoadingMore(true);
      }

      const skipCount = reset ? 0 : usersTabNextSkipRef.current;
      const orderBy = [...USERS_TAB_PEOPLE_ORDER_BY];

      try {
        let response: unknown;
        let mapped: PersonDetail[];

        if (query) {
          response = await alfrescoRpc.call(
            'queries.findPeople',
            [query, { skipCount, maxItems: PAGE_SIZE, orderBy }],
            server.baseUrl,
            modalPayload.serverId
          );
          mapped = mapPublicApiPeopleDetailResponse(response);
        } else {
          response = await alfrescoRpc.call(
            'people.listPeople',
            { skipCount, maxItems: PAGE_SIZE, orderBy },
            server.baseUrl,
            modalPayload.serverId
          );
          mapped = mapPublicApiPeopleDetailResponse(response);
        }

        if (requestId !== usersTabRequestRef.current) return;

        const pagination = parsePublicApiListPagination(response);
        let hasMore: boolean;
        if (pagination) {
          usersTabNextSkipRef.current = pagination.skipCount + pagination.count;
          hasMore = pagination.hasMoreItems;
        } else {
          usersTabNextSkipRef.current = skipCount + mapped.length;
          hasMore = mapped.length === PAGE_SIZE;
        }

        setUsersTabHasMore(hasMore);
        setUsersTabList(prev => (reset || !append ? mapped : [...prev, ...mapped]));
      } catch (err) {
        console.error('[UsersGroupsModal] Failed to load users tab', err);
        if (requestId === usersTabRequestRef.current) {
          notifications.show({
            color: 'red',
            title: t('usersGroups:loadError'),
            message: err instanceof Error ? err.message : t('common:error'),
          });
          if (reset) {
            setUsersTabList([]);
            setUsersTabHasMore(false);
          }
        }
      } finally {
        if (requestId === usersTabRequestRef.current) {
          setUsersLoading(false);
          setUsersLoadingMore(false);
        }
      }
    },
    [debouncedSearchQuery, modalPayload, server?.baseUrl, t]
  );

  const loadMoreUsersTab = useCallback(async () => {
    if (!usersTabHasMore || usersLoading || usersLoadingMore || usersLoadMoreLockRef.current) {
      return;
    }
    usersLoadMoreLockRef.current = true;
    try {
      await fetchUsersTab({ reset: false, append: true });
    } finally {
      usersLoadMoreLockRef.current = false;
    }
  }, [fetchUsersTab, usersLoading, usersLoadingMore, usersTabHasMore]);

  const loadGroupsPicker = useCallback(async () => {
    if (!server?.baseUrl || !modalPayload) return;
    try {
      const response = await alfrescoRpc.call(
        'groups.listGroups',
        { skipCount: 0, maxItems: GROUP_PICKER_MAX, orderBy: ['displayName'] },
        server.baseUrl,
        modalPayload.serverId
      );
      setGroupsPickerList(mapPublicApiGroupsResponse(response));
    } catch (err) {
      console.error('[UsersGroupsModal] Failed to load groups for picker', err);
      notifications.show({
        color: 'red',
        title: t('usersGroups:loadError'),
        message: err instanceof Error ? err.message : t('common:error'),
      });
      setGroupsPickerList([]);
    }
  }, [modalPayload, server?.baseUrl, t]);

  const fetchGroupsTab = useCallback(
    async ({ reset, append }: { reset: boolean; append: boolean }) => {
      if (!server?.baseUrl || !modalPayload) return;
      const query = debouncedSearchQuery.trim();
      const requestId = ++groupsTabRequestRef.current;

      if (reset) {
        setGroupsTabLoading(true);
        groupsTabNextSkipRef.current = 0;
      } else if (append) {
        setGroupsTabLoadingMore(true);
      }

      const skipCount = reset ? 0 : groupsTabNextSkipRef.current;
      const orderBy = ['displayName'];

      try {
        let response: unknown;
        let mapped: AuthorityResult[];

        if (query) {
          const literalForSearch = query.replace(/\*/g, '').trim();
          if (!literalForSearch) {
            mapped = [];
            response = {};
            groupsTabNextSkipRef.current = 0;
          } else {
            const where = buildGroupListWhereDisplayNameContains(query);
            try {
              response = await alfrescoRpc.call(
                'groups.listGroups',
                { skipCount, maxItems: PAGE_SIZE, orderBy, where },
                server.baseUrl,
                modalPayload.serverId
              );
              mapped = mapPublicApiGroupsResponse(response);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              const tryFallback =
                /\b400\b/i.test(msg) ||
                /where/i.test(msg) ||
                /predicate/i.test(msg) ||
                /bad request/i.test(msg);
              if (!tryFallback) throw err;
              response = await alfrescoRpc.call(
                'webscript.executeWebScript',
                [
                  'GET',
                  'api/groups',
                  {
                    shortNameFilter: query,
                    skipCount,
                    maxItems: PAGE_SIZE,
                    sortBy: 'displayName',
                    dir: 'asc',
                  },
                ],
                server.baseUrl,
                modalPayload.serverId
              );
              mapped = mapGroupsWebscriptResponse(response);
            }
          }
        } else {
          response = await alfrescoRpc.call(
            'groups.listGroups',
            { skipCount, maxItems: PAGE_SIZE, orderBy },
            server.baseUrl,
            modalPayload.serverId
          );
          mapped = mapPublicApiGroupsResponse(response);
        }

        if (requestId !== groupsTabRequestRef.current) return;

        const pagination = parsePublicApiListPagination(response);
        let hasMore: boolean;
        if (pagination) {
          groupsTabNextSkipRef.current = pagination.skipCount + pagination.count;
          hasMore = pagination.hasMoreItems;
        } else {
          groupsTabNextSkipRef.current = skipCount + mapped.length;
          hasMore = mapped.length === PAGE_SIZE;
        }

        setGroupsTabHasMore(hasMore);
        setGroupsTabList(prev => (reset || !append ? mapped : [...prev, ...mapped]));
      } catch (err) {
        console.error('[UsersGroupsModal] Failed to load groups tab', err);
        if (requestId === groupsTabRequestRef.current) {
          notifications.show({
            color: 'red',
            title: t('usersGroups:loadError'),
            message: err instanceof Error ? err.message : t('common:error'),
          });
          if (reset) {
            setGroupsTabList([]);
            setGroupsTabHasMore(false);
          }
        }
      } finally {
        if (requestId === groupsTabRequestRef.current) {
          setGroupsTabLoading(false);
          setGroupsTabLoadingMore(false);
        }
      }
    },
    [debouncedSearchQuery, modalPayload, server?.baseUrl, t]
  );

  const loadMoreGroupsTab = useCallback(async () => {
    if (
      !groupsTabHasMore ||
      groupsTabLoading ||
      groupsTabLoadingMore ||
      groupsLoadMoreLockRef.current
    ) {
      return;
    }
    groupsLoadMoreLockRef.current = true;
    try {
      await fetchGroupsTab({ reset: false, append: true });
    } finally {
      groupsLoadMoreLockRef.current = false;
    }
  }, [fetchGroupsTab, groupsTabHasMore, groupsTabLoading, groupsTabLoadingMore]);

  // Debounce search for server-side People / Groups list APIs.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // Load data when modal opens – sync debounced query + group picker; user list loads via Users-tab effect.
  useEffect(() => {
    if (!isOpen || !modalPayload) return;
    setSearchQuery('');
    setDebouncedSearchQuery('');
    loadGroupsPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, modalPayload]);

  // Users tab: refetch when debounced search changes or tab opens.
  useEffect(() => {
    if (!isOpen || !modalPayload || activeTab !== 'users') return;
    void fetchUsersTab({ reset: true, append: false });
  }, [activeTab, debouncedSearchQuery, fetchUsersTab, isOpen, modalPayload]);

  // Groups tab: refetch when debounced search changes while on Groups tab.
  useEffect(() => {
    if (!isOpen || !modalPayload || activeTab !== 'groups') return;
    void fetchGroupsTab({ reset: true, append: false });
  }, [activeTab, debouncedSearchQuery, fetchGroupsTab, isOpen, modalPayload]);

  // Infinite scroll (users tab viewport)
  useEffect(() => {
    const el = usersScrollViewportRef.current;
    if (!el || activeTab !== 'users') return;

    const onScroll = () => {
      if (!usersTabHasMore || usersLoading || usersLoadingMore) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 72) {
        void loadMoreUsersTab();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [
    activeTab,
    loadMoreUsersTab,
    usersLoading,
    usersLoadingMore,
    usersTabHasMore,
    usersTabList.length,
  ]);

  // If user list does not fill the viewport, keep loading until it does or there is no more data.
  useEffect(() => {
    if (activeTab !== 'users') return;
    if (!usersTabHasMore || usersLoading || usersLoadingMore) return;
    const el = usersScrollViewportRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 2) {
      void loadMoreUsersTab();
    }
  }, [
    activeTab,
    loadMoreUsersTab,
    usersLoading,
    usersLoadingMore,
    usersTabHasMore,
    usersTabList.length,
  ]);

  // Infinite scroll (groups tab viewport)
  useEffect(() => {
    const el = groupsScrollViewportRef.current;
    if (!el || activeTab !== 'groups') return;

    const onScroll = () => {
      if (!groupsTabHasMore || groupsTabLoading || groupsTabLoadingMore) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 72) {
        void loadMoreGroupsTab();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [
    activeTab,
    groupsTabHasMore,
    groupsTabList.length,
    groupsTabLoading,
    groupsTabLoadingMore,
    loadMoreGroupsTab,
  ]);

  // If the first page(s) do not fill the viewport, keep loading until they do or there is no more data.
  useEffect(() => {
    if (activeTab !== 'groups') return;
    if (!groupsTabHasMore || groupsTabLoading || groupsTabLoadingMore) return;
    const el = groupsScrollViewportRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 2) {
      void loadMoreGroupsTab();
    }
  }, [
    activeTab,
    groupsTabHasMore,
    groupsTabList.length,
    groupsTabLoading,
    groupsTabLoadingMore,
    loadMoreGroupsTab,
  ]);

  /* ---- Lazy-load user's groups on accordion open ---- */

  const handleUserAccordionChange = useCallback(
    (value: string | null) => {
      if (!value || !server?.baseUrl || !modalPayload) return;
      // Skip if already loaded or currently loading
      if (userGroupsMap[value] || userGroupsLoading[value]) return;

      setUserGroupsLoading(prev => ({ ...prev, [value]: true }));

      alfrescoRpc
        .call(
          'groups.listGroupMembershipsForPerson',
          [value, { skipCount: 0, maxItems: 100 }],
          server.baseUrl,
          modalPayload.serverId
        )
        .then(response => {
          setUserGroupsMap(prev => ({
            ...prev,
            [value]: mapPublicApiGroupsResponse(response),
          }));
        })
        .catch(err => {
          console.error(`[UsersGroupsModal] Failed to load groups for ${value}`, err);
          setUserGroupsMap(prev => ({ ...prev, [value]: [] }));
        })
        .finally(() => {
          setUserGroupsLoading(prev => ({ ...prev, [value]: false }));
        });
    },
    [modalPayload, server?.baseUrl, userGroupsMap, userGroupsLoading]
  );

  /* ---- Create user ---- */

  const resetCreateUserForm = () => {
    setNewUserName('');
    setNewUserFirstName('');
    setNewUserLastName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserGroups([]);
    setShowCreateUser(false);
  };

  const handleCreateUser = async () => {
    if (!server?.baseUrl || !modalPayload || !newUserName.trim() || !newUserPassword.trim()) return;
    setCreatingUser(true);
    try {
      const userId = newUserName.trim();
      await alfrescoRpc.call(
        'people.createPerson',
        [
          {
            id: userId,
            firstName: newUserFirstName.trim() || userId,
            lastName: newUserLastName.trim(),
            email: newUserEmail.trim(),
            password: newUserPassword.trim(),
          },
        ],
        server.baseUrl,
        modalPayload.serverId
      );

      // Add user to selected groups
      for (const groupId of newUserGroups) {
        try {
          await alfrescoRpc.call(
            'groups.createGroupMembership',
            [groupId, { id: userId, memberType: 'PERSON' }],
            server.baseUrl,
            modalPayload.serverId
          );
        } catch (err) {
          console.error(`[UsersGroupsModal] Failed to add ${userId} to ${groupId}`, err);
        }
      }

      notifications.show({
        color: 'green',
        title: t('common:success'),
        message: t('usersGroups:createUserSuccess', { name: userId }),
      });
      resetCreateUserForm();
      void fetchUsersTab({ reset: true, append: false });
    } catch (err) {
      console.error('[UsersGroupsModal] Failed to create user', err);
      notifications.show({
        color: 'red',
        title: t('usersGroups:createUserError'),
        message: err instanceof Error ? err.message : t('common:error'),
      });
    } finally {
      setCreatingUser(false);
    }
  };

  /* ---- Create group ---- */

  const resetCreateGroupForm = () => {
    setNewGroupId('');
    setNewGroupDisplayName('');
    setShowCreateGroup(false);
  };

  const handleCreateGroup = async () => {
    if (!server?.baseUrl || !modalPayload || !newGroupId.trim()) return;
    setCreatingGroup(true);
    try {
      await alfrescoRpc.call(
        'groups.createGroup',
        [
          {
            id: newGroupId.trim(),
            displayName: newGroupDisplayName.trim() || newGroupId.trim(),
          },
        ],
        server.baseUrl,
        modalPayload.serverId
      );
      notifications.show({
        color: 'green',
        title: t('common:success'),
        message: t('usersGroups:createGroupSuccess', {
          name: newGroupDisplayName.trim() || newGroupId.trim(),
        }),
      });
      resetCreateGroupForm();
      await loadGroupsPicker();
      void fetchGroupsTab({ reset: true, append: false });
    } catch (err) {
      console.error('[UsersGroupsModal] Failed to create group', err);
      notifications.show({
        color: 'red',
        title: t('usersGroups:createGroupError'),
        message: err instanceof Error ? err.message : t('common:error'),
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  /* ---- Delete group ---- */

  const handleDeleteGroup = (groupId: string, displayName: string) => {
    modals.openConfirmModal({
      title: t('usersGroups:deleteGroup'),
      centered: true,
      children: <Text size="sm">{t('usersGroups:deleteGroupConfirm', { name: displayName })}</Text>,
      labels: { confirm: t('common:remove'), cancel: t('common:cancel') },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await alfrescoRpc.call(
            'groups.deleteGroup',
            [groupId, { cascade: false }],
            server!.baseUrl,
            modalPayload!.serverId
          );
          notifications.show({
            color: 'green',
            title: t('common:success'),
            message: t('usersGroups:deleteGroupSuccess', { name: displayName }),
          });
          setGroupsTabList(prev => prev.filter(g => g.id !== groupId));
          setGroupsPickerList(prev => prev.filter(g => g.id !== groupId));
        } catch (err) {
          console.error('[UsersGroupsModal] Failed to delete group', err);
          notifications.show({
            color: 'red',
            title: t('usersGroups:deleteGroupError'),
            message: err instanceof Error ? err.message : t('common:error'),
          });
        }
      },
    });
  };

  /* ---- Group members sub-modal ---- */

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

  const loadGroupMembers = useCallback(
    async (groupId: string, options?: { silent?: boolean }) => {
      if (!server?.baseUrl || !modalPayload) return;
      const requestId = ++membersRequestRef.current;
      if (!options?.silent) setMembersLoading(true);
      try {
        const response = await alfrescoRpc.call(
          'groups.listGroupMemberships',
          [groupId, { skipCount: 0, maxItems: 200 }],
          server.baseUrl,
          modalPayload.serverId
        );
        if (requestId !== membersRequestRef.current) return;
        setMembers(mapPublicApiMembersResponse(response));
      } catch (err) {
        console.error('[UsersGroupsModal] Failed to load group members', err);
        if (requestId === membersRequestRef.current) setMembers([]);
      } finally {
        if (!options?.silent) setMembersLoading(false);
      }
    },
    [modalPayload, server?.baseUrl]
  );

  const searchMembers = useCallback(
    async (type: AuthorityType, query: string) => {
      if (!server?.baseUrl || !modalPayload) return;
      setMemberSearchLoading(true);
      try {
        if (type === 'PERSON') {
          const response = await alfrescoRpc.call(
            'people.listPeople',
            { skipCount: 0, maxItems: 25 },
            server.baseUrl,
            modalPayload.serverId
          );
          const mapped = mapPublicApiPeopleResponse(response);
          const filtered = query
            ? mapped.filter(item =>
                `${item.displayName} ${item.id}`.toLowerCase().includes(query.toLowerCase())
              )
            : mapped;
          setMemberResults(filtered.slice(0, 20));
        } else {
          const response = await alfrescoRpc.call(
            'groups.listGroups',
            { skipCount: 0, maxItems: 25 },
            server.baseUrl,
            modalPayload.serverId
          );
          const mapped = mapPublicApiGroupsResponse(response);
          const filtered = query
            ? mapped.filter(item =>
                `${item.displayName} ${item.id}`.toLowerCase().includes(query.toLowerCase())
              )
            : mapped;
          setMemberResults(filtered.slice(0, 20));
        }
      } catch (err) {
        console.error('[UsersGroupsModal] Failed to search members', err);
        setMemberResults([]);
      } finally {
        setMemberSearchLoading(false);
      }
    },
    [modalPayload, server?.baseUrl]
  );

  const handleAddMember = useCallback(
    async (member: AuthorityResult) => {
      if (!membersGroupId || !server?.baseUrl || !modalPayload) return;

      // Optimistic update
      setMembers(prev => {
        if (prev.some(entry => entry.id === member.id)) return prev;
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
        console.error('[UsersGroupsModal] Failed to add member', err);
        setMembers(prev => prev.filter(entry => entry.id !== member.id));
      }
    },
    [membersGroupId, modalPayload, server?.baseUrl]
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!membersGroupId || !server?.baseUrl || !modalPayload) return;

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
        if (message.includes('Not Found') || message.includes('NOT_FOUND')) return;
        console.error('[UsersGroupsModal] Failed to remove member', err);
        if (membersGroupId) loadGroupMembers(membersGroupId, { silent: true });
      }
    },
    [loadGroupMembers, membersGroupId, modalPayload, server?.baseUrl]
  );

  // Load members when sub-modal opens
  useEffect(() => {
    if (!membersModalOpen || !membersGroupId) return;
    loadGroupMembers(membersGroupId);
  }, [loadGroupMembers, membersGroupId, membersModalOpen]);

  // Debounced member search
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

  /* ---- Reset on close ---- */
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('users');
      setSearchQuery('');
      setDebouncedSearchQuery('');
      setUsersTabList([]);
      setUsersTabHasMore(false);
      setGroupsTabList([]);
      setGroupsTabHasMore(false);
      setGroupsPickerList([]);
      resetCreateUserForm();
      resetCreateGroupForm();
      closeMembersModal();
      setUserGroupsMap({});
      setUserGroupsLoading({});
    }
  }, [isOpen]);

  /* ---- Render ---- */

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={close}
        title={
          <Group gap="xs">
            <IconUsersGroup size={22} stroke={1.5} />
            <Title order={4}>{t('usersGroups:modalTitle')}</Title>
          </Group>
        }
        size="xl"
        centered
        trapFocus
        returnFocus
        transitionProps={{ duration: 300, transition: 'fade' }}
      >
        <Stack gap="sm">
          <SegmentedControl
            value={activeTab}
            onChange={value => setActiveTab(value as 'users' | 'groups')}
            data={[
              { value: 'users', label: t('usersGroups:tabUsers') },
              { value: 'groups', label: t('usersGroups:tabGroups') },
            ]}
          />

          <TextInput
            value={searchQuery}
            onChange={e => setSearchQuery(e.currentTarget.value)}
            placeholder={t('usersGroups:searchPlaceholder')}
            leftSection={<IconSearch size={14} />}
            autoComplete="off"
          />

          {activeTab === 'users' ? (
            /* ---------- USERS TAB ---------- */
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={600}>
                  {t('usersGroups:tabUsers')} ({usersTabList.length}
                  {usersTabHasMore ? '+' : ''})
                </Text>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  variant="light"
                  onClick={() => setShowCreateUser(true)}
                >
                  {t('usersGroups:createUser')}
                </Button>
              </Group>

              <ScrollArea h={380} viewportRef={usersScrollViewportRef}>
                {usersLoading ? (
                  <Group justify="center" py="xl">
                    <Loader size="sm" />
                    <Text c="dimmed" size="sm">
                      {t('common:loading')}
                    </Text>
                  </Group>
                ) : usersTabList.length === 0 ? (
                  <Text size="sm" c="dimmed" py="xs">
                    {t('usersGroups:noResults')}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    <Accordion variant="contained" onChange={handleUserAccordionChange}>
                      {usersTabList.map(user => (
                        <Accordion.Item key={user.id} value={user.id}>
                          <Accordion.Control>
                            <Group justify="space-between" align="center" pr="xs">
                              <Stack gap={2}>
                                <Text size="sm" fw={500}>
                                  {user.displayName}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {user.id}
                                </Text>
                              </Stack>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="xs">
                              {/* User details */}
                              <Group gap="xl">
                                {user.email && (
                                  <Stack gap={0}>
                                    <Text size="xs" c="dimmed">
                                      {t('usersGroups:email')}
                                    </Text>
                                    <Text size="sm">{user.email}</Text>
                                  </Stack>
                                )}
                                {(user.firstName || user.lastName) && (
                                  <Stack gap={0}>
                                    <Text size="xs" c="dimmed">
                                      {t('usersGroups:name')}
                                    </Text>
                                    <Text size="sm">
                                      {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                                    </Text>
                                  </Stack>
                                )}
                                <Stack gap={0}>
                                  <Text size="xs" c="dimmed">
                                    {t('usersGroups:status')}
                                  </Text>
                                  <Badge
                                    size="sm"
                                    variant="light"
                                    color={user.enabled ? 'green' : 'red'}
                                  >
                                    {user.enabled
                                      ? t('usersGroups:enabled')
                                      : t('usersGroups:disabled')}
                                  </Badge>
                                </Stack>
                              </Group>

                              {/* Group memberships */}
                              {userGroupsLoading[user.id] ? (
                                <Group gap="xs">
                                  <Loader size="xs" />
                                  <Text size="xs" c="dimmed">
                                    {t('common:loading')}
                                  </Text>
                                </Group>
                              ) : userGroupsMap[user.id] && userGroupsMap[user.id].length > 0 ? (
                                <>
                                  <Text size="xs" fw={600}>
                                    {t('usersGroups:memberOfGroups')}
                                  </Text>
                                  <Group gap="xs" wrap="wrap">
                                    {userGroupsMap[user.id].map(g => (
                                      <Badge key={g.id} size="sm" variant="light">
                                        {g.displayName || g.id}
                                      </Badge>
                                    ))}
                                  </Group>
                                </>
                              ) : (
                                <Text size="xs" c="dimmed">
                                  {t('usersGroups:noGroupMemberships')}
                                </Text>
                              )}
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                    {usersLoadingMore ? (
                      <Group justify="center" py="sm">
                        <Loader size="xs" />
                      </Group>
                    ) : null}
                  </Stack>
                )}
              </ScrollArea>
            </Stack>
          ) : (
            /* ---------- GROUPS TAB ---------- */
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={600}>
                  {t('usersGroups:tabGroups')} ({groupsTabList.length}
                  {groupsTabHasMore ? '+' : ''})
                </Text>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  variant="light"
                  onClick={() => setShowCreateGroup(true)}
                >
                  {t('usersGroups:createGroup')}
                </Button>
              </Group>

              <ScrollArea h={380} viewportRef={groupsScrollViewportRef}>
                {groupsTabLoading ? (
                  <Group justify="center" py="xl">
                    <Loader size="sm" />
                    <Text c="dimmed" size="sm">
                      {t('common:loading')}
                    </Text>
                  </Group>
                ) : groupsTabList.length === 0 ? (
                  <Text size="sm" c="dimmed" py="xs">
                    {t('usersGroups:noResults')}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {groupsTabList.map(group => (
                      <Paper key={group.id} withBorder p="xs">
                        <Group justify="space-between" align="center">
                          <Stack gap={2}>
                            <Group gap="xs">
                              <Text size="sm" fw={500}>
                                {group.displayName}
                              </Text>
                              <Badge size="xs" variant="light">
                                {t('usersGroups:groups')}
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                              {group.id}
                            </Text>
                          </Stack>
                          <Group gap="xs">
                            <ActionIcon
                              variant="subtle"
                              onClick={() =>
                                openMembersModal(group.id, group.displayName || group.id)
                              }
                              aria-label={t('usersGroups:members')}
                            >
                              <IconUsers size={14} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => handleDeleteGroup(group.id, group.displayName)}
                              aria-label={t('usersGroups:deleteGroup')}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Paper>
                    ))}
                    {groupsTabLoadingMore ? (
                      <Group justify="center" py="sm">
                        <Loader size="xs" />
                      </Group>
                    ) : null}
                  </Stack>
                )}
              </ScrollArea>
            </Stack>
          )}
        </Stack>
      </Modal>

      {/* Create User sub-modal */}
      <Modal
        opened={showCreateUser}
        onClose={resetCreateUserForm}
        title={t('usersGroups:createUserTitle')}
        size="md"
        centered
        trapFocus
        transitionProps={{ duration: 200, transition: 'pop' }}
      >
        <Stack gap="sm">
          <Group grow>
            <TextInput
              label={t('usersGroups:username')}
              placeholder={t('usersGroups:usernamePlaceholder')}
              value={newUserName}
              onChange={e => setNewUserName(e.currentTarget.value)}
              required
            />
            <TextInput
              label={t('usersGroups:email')}
              placeholder={t('usersGroups:emailPlaceholder')}
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.currentTarget.value)}
              required
              error={
                newUserEmail.trim() && !EMAIL_REGEX.test(newUserEmail.trim())
                  ? t('usersGroups:invalidEmail')
                  : undefined
              }
            />
          </Group>
          <Group grow>
            <TextInput
              label={t('usersGroups:firstName')}
              placeholder={t('usersGroups:firstNamePlaceholder')}
              value={newUserFirstName}
              onChange={e => setNewUserFirstName(e.currentTarget.value)}
              required
            />
            <TextInput
              label={t('usersGroups:lastName')}
              placeholder={t('usersGroups:lastNamePlaceholder')}
              value={newUserLastName}
              onChange={e => setNewUserLastName(e.currentTarget.value)}
            />
          </Group>
          <TextInput
            label={t('usersGroups:password')}
            placeholder={t('usersGroups:passwordPlaceholder')}
            type="password"
            value={newUserPassword}
            onChange={e => setNewUserPassword(e.currentTarget.value)}
            required
          />
          <MultiSelect
            label={t('usersGroups:assignToGroups')}
            placeholder={t('usersGroups:assignToGroupsPlaceholder')}
            data={groupsPickerList.map(g => ({ value: g.id, label: g.displayName || g.id }))}
            value={newUserGroups}
            onChange={setNewUserGroups}
            searchable
            clearable
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={resetCreateUserForm}>
              {t('common:cancel')}
            </Button>
            <Button
              onClick={handleCreateUser}
              loading={creatingUser}
              disabled={
                !newUserName.trim() ||
                !newUserFirstName.trim() ||
                !newUserEmail.trim() ||
                !newUserPassword.trim() ||
                !EMAIL_REGEX.test(newUserEmail.trim())
              }
            >
              {t('usersGroups:createUserSubmit')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Create Group sub-modal */}
      <Modal
        opened={showCreateGroup}
        onClose={resetCreateGroupForm}
        title={t('usersGroups:createGroupTitle')}
        size="md"
        centered
        trapFocus
        transitionProps={{ duration: 200, transition: 'pop' }}
      >
        <Stack gap="sm">
          <Group grow>
            <TextInput
              label={t('usersGroups:groupId')}
              placeholder={t('usersGroups:groupIdPlaceholder')}
              value={newGroupId}
              onChange={e => setNewGroupId(e.currentTarget.value)}
              required
            />
            <TextInput
              label={t('usersGroups:groupDisplayName')}
              placeholder={t('usersGroups:groupDisplayNamePlaceholder')}
              value={newGroupDisplayName}
              onChange={e => setNewGroupDisplayName(e.currentTarget.value)}
            />
          </Group>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={resetCreateGroupForm}>
              {t('common:cancel')}
            </Button>
            <Button
              onClick={handleCreateGroup}
              loading={creatingGroup}
              disabled={!newGroupId.trim()}
            >
              {t('usersGroups:createGroupSubmit')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Members sub-modal */}
      <MembersModal
        opened={membersModalOpen}
        onClose={closeMembersModal}
        title={t('usersGroups:manageMembersTitle', { group: membersGroupLabel ?? '' })}
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

/* ------------------------------------------------------------------ */
/* Members Sub-Modal (reusable pattern from NodePermissionsModal)      */
/* ------------------------------------------------------------------ */

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
  const { t } = useTranslation(['usersGroups', 'common']);
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
            { value: 'PERSON', label: t('usersGroups:users') },
            { value: 'GROUP', label: t('usersGroups:groups') },
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
                placeholder={t('usersGroups:memberSearchPlaceholder')}
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
                <Combobox.Empty>{t('usersGroups:noResults')}</Combobox.Empty>
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

        <Text fw={600}>{t('usersGroups:members')}</Text>
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
              {t('usersGroups:noMembers')}
            </Text>
          ) : (
            <Stack gap="xs">
              {members.map(member => (
                <Paper key={member.id} withBorder p="xs">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Stack gap={2} style={{ overflow: 'hidden', flex: 1 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500} truncate>
                          {member.displayName || member.id}
                        </Text>
                        {member.type === 'GROUP' && (
                          <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                            {t('usersGroups:groups')}
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" truncate>
                        {member.id}
                      </Text>
                    </Stack>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => onRemoveMember(member.id)}
                      aria-label={t('usersGroups:removeMember')}
                      style={{ flexShrink: 0 }}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
