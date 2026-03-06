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

import { backendRpc } from '@/core/ipc/backend';
import { useAgentStore } from '@/core/store/agent';
import type { PageKey } from '@/core/store/keys';
import { useSavedSearchesStore } from '@/core/store/savedSearches';
import { useServersStore } from '@/core/store/servers';
import { useNavigation } from '@/hooks/useNavigation';
import type { MenuItem as MenuItemType, MenuSection as MenuSectionType } from '@/types/menu';
import { ScrollArea, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchChatsModal } from '../agent/SearchChatsModal';
import { getIconComponent } from './iconUtils';
import { MenuItem } from './MenuItem';
import { MenuSection } from './MenuSection';
import { RepositorySection } from './RepositorySection';
import { SystemTreeSection } from './SystemTreeSection';

const SUBMENU_SECTION_STATE_KEY = 'noderef-submenu-open-state';

type SectionStateMap = Record<string, boolean>;

const getSectionStorageKey = (serverId: number | null, sectionId: string) => {
  const contextId = serverId === null ? 'node-ref-space' : `server-${serverId}`;
  return `${contextId}::${sectionId}`;
};

const readSectionState = (): SectionStateMap => {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(SUBMENU_SECTION_STATE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as SectionStateMap;
    }
  } catch (error) {
    console.warn('Failed to read submenu section state:', error);
  }

  return {};
};

const getPersistedSectionOpened = (serverId: number | null, sectionId: string): boolean | null => {
  const state = readSectionState();
  const key = getSectionStorageKey(serverId, sectionId);
  return typeof state[key] === 'boolean' ? state[key] : null;
};

const setPersistedSectionOpened = (serverId: number | null, sectionId: string, opened: boolean) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const state = readSectionState();
    const key = getSectionStorageKey(serverId, sectionId);
    const nextState = { ...state, [key]: opened };
    localStorage.setItem(SUBMENU_SECTION_STATE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn('Failed to persist submenu section state:', error);
  }
};

const formatElapsedCompact = (date: Date | string | null | undefined): string => {
  if (!date) {
    return '';
  }

  const target = date instanceof Date ? date : new Date(date);
  const timestamp = target.getTime();
  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs <= 0) {
    return '0 m';
  }

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diffMs < minute) return '0 m';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} m`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} h`;
  if (diffMs < week) return `${Math.floor(diffMs / day)} d`;
  if (diffMs < month) return `${Math.floor(diffMs / week)} w`;
  if (diffMs < year) return `${Math.floor(diffMs / month)} mo`;
  return `${Math.floor(diffMs / year)} y`;
};

export function SimpleMenuNavigation() {
  const { t } = useTranslation(['submenu', 'addServer', 'agent']);
  const { activeServerId, activePage, navigate, setActiveServer } = useNavigation();
  const getServerById = useServersStore(state => state.getServerById);

  const savedSearches = useSavedSearchesStore(state => state.savedSearches);
  const setSavedSearches = useSavedSearchesStore(state => state.setSavedSearches);
  const setActiveSavedSearchId = useSavedSearchesStore(state => state.setActiveSavedSearchId);
  const activeSavedSearchId = useSavedSearchesStore(state => state.activeSavedSearchId);
  const agentChats = useAgentStore(state => state.chats);
  const setAgentChats = useAgentStore(state => state.setChats);
  const setActiveChatId = useAgentStore(state => state.setActiveChatId);
  const activeChatId = useAgentStore(state => state.activeChatId);

  const removeAgentChat = useAgentStore(state => state.removeChat);
  const serverInitializationRef = useRef<number | null>(null);
  const searchSectionOpenedRef = useRef(true);
  const [agentSectionOpened, setAgentSectionOpened] = useState(
    () => getPersistedSectionOpened(activeServerId, 'agent-main') ?? true
  );

  const server = getServerById(activeServerId);
  const isNodeRefSpace = !server || !server.serverType;

  // Load saved searches when component mounts or when activeServerId changes
  useEffect(() => {
    let cancelled = false;
    const loadSavedSearches = async () => {
      try {
        // Load searches for active server OR all searches if in NodeRef space
        const searches = await backendRpc.savedSearches.list(activeServerId || undefined);

        if (cancelled) {
          return;
        }
        setSavedSearches(searches);

        if (activeServerId) {
          if (searches.length > 0) {
            const isCurrentValid = searches.some(search => search.id === activeSavedSearchId);
            if (!isCurrentValid) {
              setActiveSavedSearchId(searches[0].id);
            }
          } else if (activeSavedSearchId !== null) {
            setActiveSavedSearchId(null);
          }

          if (serverInitializationRef.current !== activeServerId) {
            serverInitializationRef.current = activeServerId;
            const shouldPreservePage =
              activePage === 'jsconsole' ||
              activePage === 'text-editor' ||
              activePage === 'agentPage';

            if (!shouldPreservePage) {
              if (searches.length > 0) {
                const defaultSearch = searches.find(s => s.isDefault);
                if (defaultSearch) {
                  setActiveSavedSearchId(defaultSearch.id);
                  navigate('saved-search');
                } else {
                  navigate('saved-search');
                }
              } else {
                navigate('jsconsole');
              }
            }
          }
        } else {
          // In NodeRef space, we just want to load the searches, not auto-navigate
          serverInitializationRef.current = null;
        }
      } catch (error) {
        console.error('Failed to load saved searches:', error);
      }
    };

    loadSavedSearches();
    return () => {
      cancelled = true;
    };
  }, [
    activeServerId,
    setSavedSearches,
    setActiveSavedSearchId,
    activeSavedSearchId,
    activePage,
    navigate,
  ]);

  // Load agent chats for active server or all servers in NodeRef space.
  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const loadAgentChats = async () => {
      try {
        const result = await backendRpc.agent.listChats({
          serverId: activeServerId || undefined,
          skipCount: 0,
          maxItems: 100,
        });

        if (!cancelled) {
          setAgentChats(result.items);
        }
      } catch (error) {
        console.error('Failed to load agent chats:', error);
      }
    };

    if (activePage !== 'agentPage' && !agentSectionOpened) {
      return () => {
        cancelled = true;
        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
      };
    }

    void loadAgentChats();

    // Only poll when on the agent page
    if (activePage === 'agentPage') {
      intervalId = window.setInterval(() => {
        void loadAgentChats();
      }, 2000);
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [activePage, activeServerId, agentSectionOpened, setAgentChats]);

  // Convert PageKey navigation to MenuItem format for MenuSection
  const handleItemSelect = async (item: MenuItemType) => {
    const isSavedSearch = item.id.startsWith('saved-search-');
    if (isSavedSearch) {
      const searchId = parseInt(item.id.replace('saved-search-', ''), 10);
      if (!isNaN(searchId)) {
        setActiveSavedSearchId(searchId);
        const search = savedSearches.find(s => s.id === searchId);
        if (search && !isNodeRefSpace) {
          setActiveServer(search.serverId);
        }
        navigate('saved-search');
      }
      return;
    }

    const isAgentChat = item.id.startsWith('agent-chat-');
    if (isAgentChat) {
      const chatId = parseInt(item.id.replace('agent-chat-', ''), 10);
      if (!isNaN(chatId)) {
        setActiveChatId(chatId);
        const chat = agentChats.find(entry => entry.id === chatId);
        if (chat && !isNodeRefSpace) {
          setActiveServer(chat.serverId);
        }
        navigate('agentPage');
      }
      return;
    }

    navigate(item.id as PageKey);
  };

  // Top-level items (not in a section)
  const dashboardItem: MenuItemType = {
    id: 'dashboard',
    label: t('submenu:dashboard'),
    icon: 'dashboard',
    viewMode: 'monaco',
  };

  // Handle saved search deletion
  const handleDeleteSavedSearch = async (item: MenuItemType) => {
    // Extract the search ID from the item ID (format: "saved-search-{id}")
    const searchId = parseInt(item.id.replace('saved-search-', ''), 10);

    if (isNaN(searchId)) {
      return;
    }

    modals.openConfirmModal({
      title: t('submenu:deleteSearch'),
      children: (
        <Text size="sm">
          {t('submenu:deleteSearchConfirm', {
            name: item.label,
          })}
        </Text>
      ),
      labels: {
        confirm: t('common:delete'),
        cancel: t('common:cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await backendRpc.savedSearches.delete(searchId);

          // Update store
          const removeSavedSearch = useSavedSearchesStore.getState().removeSavedSearch;
          removeSavedSearch(searchId);

          notifications.show({
            title: t('common:success'),
            message: t('submenu:searchDeleted'),
            color: 'green',
          });
        } catch (error) {
          notifications.show({
            title: t('common:error'),
            message: error instanceof Error ? error.message : t('submenu:searchDeleteError'),
            color: 'red',
            autoClose: 5000,
          });
        }
      },
    });
  };

  // Handle saved search rename
  const handleRenameSavedSearch = async (item: MenuItemType) => {
    // Extract the search ID from the item ID (format: "saved-search-{id}")
    const searchId = parseInt(item.id.replace('saved-search-', ''), 10);

    if (isNaN(searchId)) {
      return;
    }

    const newName = item.label.trim();

    if (!newName) {
      notifications.show({
        title: t('common:error'),
        message: t('submenu:searchNameRequired'),
        color: 'red',
      });
      return;
    }

    try {
      await backendRpc.savedSearches.update(searchId, { name: newName });

      // Update store
      const setSavedSearches = useSavedSearchesStore.getState().setSavedSearches;
      const currentSearches = useSavedSearchesStore.getState().savedSearches;
      const updatedSearches = currentSearches.map(search =>
        search.id === searchId ? { ...search, name: newName } : search
      );
      setSavedSearches(updatedSearches);

      notifications.show({
        title: t('common:success'),
        message: t('submenu:searchRenamed'),
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('submenu:searchRenameError'),
        color: 'red',
      });
    }
  };

  const handleDeleteAgentChat = async (item: MenuItemType) => {
    const chatId = parseInt(item.id.replace('agent-chat-', ''), 10);
    if (isNaN(chatId)) {
      return;
    }

    modals.openConfirmModal({
      title: t('agent:deleteChatTitle'),
      children: <Text size="sm">{t('agent:deleteChatConfirm', { name: item.label })}</Text>,
      labels: {
        confirm: t('common:delete'),
        cancel: t('common:cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const result = await backendRpc.agent.deleteChat(chatId);
          if (result.success) {
            removeAgentChat(chatId);
            notifications.show({
              title: t('common:success'),
              message: t('agent:chatDeletedMessage'),
              color: 'green',
            });
          }
        } catch (error) {
          notifications.show({
            title: t('common:error'),
            message: error instanceof Error ? error.message : t('agent:errors.generic'),
            color: 'red',
          });
        }
      },
    });
  };

  const handleCreateAgentChat = () => {
    setActiveChatId(null);
    navigate('agentPage');
  };

  // Alfresco server sections - dynamically build search items from saved searches
  const alfrescoSections: MenuSectionType[] = useMemo(() => {
    const sortedSearches = [...savedSearches].sort((a, b) => a.name.localeCompare(b.name));
    const savedSearchItems: MenuItemType[] = sortedSearches.map(search => ({
      id: `saved-search-${search.id}`,
      label: search.name,
      icon: 'hash',
      viewMode: 'monaco' as const,
    }));

    const persistedOpened = getPersistedSectionOpened(activeServerId, 'search-main');
    const shouldOpen = persistedOpened ?? savedSearches.length > 0;
    searchSectionOpenedRef.current = shouldOpen;
    return [
      {
        id: 'search-main',
        label: t('submenu:search'),
        icon: 'search',
        collapsible: true,
        initiallyOpened: shouldOpen,
        items: savedSearchItems,
      },
    ];
  }, [activeServerId, savedSearches, t]);

  const agentSections: MenuSectionType[] = useMemo(() => {
    const sortedChats = [...agentChats].sort((a, b) => {
      const aTime = a.lastMessageAt
        ? new Date(a.lastMessageAt).getTime()
        : new Date(a.updatedAt).getTime();
      const bTime = b.lastMessageAt
        ? new Date(b.lastMessageAt).getTime()
        : new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });

    const chatItems: MenuItemType[] = sortedChats.map(chat => {
      const chatServer = getServerById(chat.serverId);
      const serverLabel = chatServer?.label || chatServer?.name;
      return {
        id: `agent-chat-${chat.id}`,
        label: chat.title,
        icon: chat.hasActiveRun ? 'loading' : chat.chatIcon || 'hash',
        viewMode: 'monaco' as const,
        badgeLabel: chat.hasWaitingConfirmation ? t('submenu:waitingApproval') : undefined,
        badgeColor: 'green',
        metaLabel: isNodeRefSpace
          ? serverLabel || `#${chat.serverId}`
          : formatElapsedCompact(chat.lastMessageAt || chat.updatedAt),
      };
    });

    const persistedOpened = getPersistedSectionOpened(activeServerId, 'agent-main');
    const shouldOpen = persistedOpened ?? true;

    return [
      {
        id: 'agent-main',
        label: t('submenu:agentPage'),
        icon: 'agent',
        collapsible: true,
        initiallyOpened: shouldOpen,
        showWhenEmpty: true,
        emptyLabel: t('agent:noChatSelected'),
        actions: [
          ...(chatItems.length > 0
            ? [
                {
                  id: 'search-chats',
                  icon: 'search',
                  label: t('agent:searchChats', 'Search chats'),
                  showOnHover: true,
                },
              ]
            : []),
          {
            id: 'create-chat',
            icon: 'edit',
            label: t('agent:newChat'),
          },
        ],
        items: chatItems,
      },
    ];
  }, [activeServerId, agentChats, getServerById, isNodeRefSpace, t]);

  // Web section (separate for ordering - appears after JavaScript Console)
  // Repository Admin is now in the submenu header dropdown as an external link

  // Alfresco top-level items (not in sections)
  const alfrescoTopLevelItems: MenuItemType[] = [
    {
      id: 'jsconsole',
      label: t('submenu:jsConsole'),
      icon: 'code',
      viewMode: 'monaco',
    },
  ];

  const nodeRefPrimaryMenuItems: MenuItemType[] = isNodeRefSpace
    ? [
        dashboardItem,
        {
          id: 'jsconsole',
          label: t('submenu:jsConsole'),
          icon: 'code',
          viewMode: 'monaco' as const,
        },
      ]
    : [];

  const nodeRefSecondaryMenuItems: MenuItemType[] = isNodeRefSpace
    ? [
        {
          id: 'files',
          label: t('submenu:files'),
          icon: 'folder',
          viewMode: 'monaco' as const,
        },
      ]
    : [];

  // Determine which sections to show based on serverType only
  let sections: MenuSectionType[] = [];
  let topLevelItems: MenuItemType[] = [];

  if (isNodeRefSpace) {
    sections = [...agentSections, ...alfrescoSections];
  } else if (server.serverType === 'alfresco') {
    // Show all Alfresco menu items for any Alfresco server
    // Feature availability should be handled at runtime, not by hiding menu items
    sections = [...agentSections, ...alfrescoSections];
    topLevelItems = alfrescoTopLevelItems;
  }

  // Check if we have any items to show (sections or top-level items)
  const hasAnyItems =
    sections.some(s => s.items.length > 0) ||
    topLevelItems.length > 0 ||
    nodeRefPrimaryMenuItems.length > 0 ||
    nodeRefSecondaryMenuItems.length > 0;

  if (!hasAnyItems) {
    return (
      <Text size="sm" c="dimmed" p="md">
        {t('submenu:noMenuItems')}
      </Text>
    );
  }

  const activeMenuItemId =
    activePage === 'agentPage' && activeChatId
      ? `agent-chat-${activeChatId}`
      : activePage === 'agentPage'
        ? null
        : activePage === 'saved-search' && activeSavedSearchId
          ? `saved-search-${activeSavedSearchId}`
          : activePage;

  const persistOpenedState = (sectionId: string, opened: boolean) => {
    setPersistedSectionOpened(activeServerId, sectionId, opened);
    if (sectionId === 'search-main') {
      searchSectionOpenedRef.current = opened;
    }
  };

  const renderMenuItems = (items: MenuItemType[]) =>
    items.map(item => {
      const itemIcon = getIconComponent(item.icon || '');
      return (
        <MenuItem
          key={item.id}
          item={item}
          active={activeMenuItemId === item.id}
          onSelect={handleItemSelect}
          icon={itemIcon}
        />
      );
    });

  const repositoryIcon = getIconComponent('folder');
  const systemTreeIcon = getIconComponent('settings');

  const searchSection = sections.find(section => section.id === 'search-main');
  const nonSearchSections = sections.filter(section => section.id !== 'search-main');
  const showSearchFirst = !isNodeRefSpace && savedSearches.length > 0 && Boolean(searchSection);

  const sectionsBeforeTopLevel = showSearchFirst && searchSection ? [searchSection] : [];
  const sectionsAfterTopLevel = showSearchFirst ? nonSearchSections : sections;

  const renderSections = (items: MenuSectionType[]) =>
    items.map(section => {
      const isSearchSection = section.id === 'search-main';
      const isAgentSection = section.id === 'agent-main';

      return (
        <MenuSection
          key={
            isSearchSection
              ? `${section.id}-${server?.id ?? 'all'}-${savedSearches.length > 0 ? 'has' : 'none'}`
              : isAgentSection
                ? `${section.id}-${server?.id ?? 'all'}-${agentChats.length}`
                : `${section.id}-${server?.id ?? 'none'}`
          }
          section={{
            ...section,
            initiallyOpened: isSearchSection
              ? searchSectionOpenedRef.current
              : isAgentSection
                ? (getPersistedSectionOpened(activeServerId, 'agent-main') ?? true)
                : section.initiallyOpened,
          }}
          activeItemId={activeMenuItemId}
          onItemSelect={handleItemSelect}
          onItemDelete={
            isSearchSection
              ? handleDeleteSavedSearch
              : isAgentSection
                ? handleDeleteAgentChat
                : undefined
          }
          onItemRename={isSearchSection ? handleRenameSavedSearch : undefined}
          onSectionAction={(sectionData, actionId) => {
            if (sectionData.id === 'agent-main') {
              if (actionId === 'create-chat') {
                void handleCreateAgentChat();
              } else if (actionId === 'search-chats') {
                modals.open({
                  title: t('agent:searchChats', 'Search chats'),
                  size: 'lg',
                  children: <SearchChatsModal />,
                });
              }
            }
          }}
          onOpenedChange={opened => {
            persistOpenedState(section.id, opened);
            if (isAgentSection) setAgentSectionOpened(opened);
          }}
          maxInitialItems={isAgentSection ? 10 : undefined}
        />
      );
    });

  return (
    <ScrollArea style={{ flex: 1, height: '100%' }}>
      <div style={{ padding: 'var(--mantine-spacing-md)' }}>
        <Stack gap="xs">
          {/* NodeRef Space primary navigation */}
          {isNodeRefSpace && renderMenuItems(nodeRefPrimaryMenuItems)}

          {/* Saved searches should stay on top when available */}
          {(isNodeRefSpace || server?.serverType === 'alfresco') &&
            renderSections(sectionsBeforeTopLevel)}

          {/* JavaScript Console next (server context) */}
          {!isNodeRefSpace && renderMenuItems(topLevelItems)}

          {(isNodeRefSpace || server?.serverType === 'alfresco') &&
            renderSections(sectionsAfterTopLevel)}

          {/* NodeRef Space secondary navigation */}
          {isNodeRefSpace && renderMenuItems(nodeRefSecondaryMenuItems)}

          {/* Repository Tree Section for Alfresco servers */}
          {!isNodeRefSpace && server?.serverType === 'alfresco' && (
            <RepositorySection
              key={`repo-${server?.id ?? 'none'}-${savedSearches.length}`}
              label={t('submenu:repository')}
              icon={repositoryIcon}
              initiallyOpened={
                getPersistedSectionOpened(activeServerId, 'repository-section') ??
                savedSearches.length === 0
              }
              onOpenedChange={opened => persistOpenedState('repository-section', opened)}
            />
          )}
          {/* System Section for Alfresco servers */}
          {!isNodeRefSpace && server?.serverType === 'alfresco' && (
            <SystemTreeSection
              key={`system-${server?.id ?? 'none'}`}
              label={t('submenu:system')}
              icon={systemTreeIcon}
              initiallyOpened={getPersistedSectionOpened(activeServerId, 'system-section') ?? false}
              onOpenedChange={opened => persistOpenedState('system-section', opened)}
            />
          )}
        </Stack>
      </div>
    </ScrollArea>
  );
}
