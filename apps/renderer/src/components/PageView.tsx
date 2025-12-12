/**
 * Copyright 2025 NodeRef
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

import { ContentArea } from '@/components/content/ContentArea';
import { ContentHeader } from '@/components/content/ContentHeader';
import { MultiServerSelectorControl } from '@/components/content/MultiServerSelectorControl';
import { getPageActions } from '@/components/content/pageActions';
import { SearchQueryBuilder } from '@/components/search/SearchQueryBuilder';
import { getIconComponent } from '@/components/submenu/iconUtils';
import { getRoute, routes } from '@/config/navigation';
import { useFileFolderBrowserActionsStore } from '@/core/store/fileFolderBrowserActions';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useSavedSearchesStore } from '@/core/store/savedSearches';
import { useSearchStore } from '@/core/store/search';
import { useServersStore } from '@/core/store/servers';
import { useTextEditorStore } from '@/core/store/textEditor';
import { usePageActions } from '@/hooks/usePageActions';
import { useActiveServerId, useNavigation } from '@/hooks/useNavigation';
import { Box, Loader } from '@mantine/core';
import { useEffect, useMemo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * PageView component that renders the active page based on navigation state.
 * Includes safe fallback for unknown page keys and auto-reset to dashboard.
 * Wraps content with ContentArea and ContentHeader for toolbar and frame.
 */
export function PageView() {
  const { activePage, navigate } = useNavigation();
  const activeServerId = useActiveServerId();
  const { t } = useTranslation(['submenu', 'menu', 'common', 'search', 'fileFolderBrowser']);

  // Resolve route configuration
  const route = getRoute(activePage);
  const PageComponent = route.component;

  const serverCount = useServersStore(state => state.servers.length);
  const noServersAvailable = serverCount === 0;
  const searchQuery = useSearchStore(state => state.query);
  const selectedServerIds = useSearchStore(state => state.selectedServerIds);
  const activeSavedSearchId = useSavedSearchesStore(state => state.activeSavedSearchId);
  const createFolderHandler = useFileFolderBrowserActionsStore(state => state.createFolderHandler);

  // State needed for page actions context
  const loadedScriptNodeId = useJsConsoleStore(state => state.loadedScriptNodeId);
  const textEditorWordWrap = useTextEditorStore(state => state.wordWrap);
  const textEditorServerId = useTextEditorStore(state => state.serverId);
  const textEditorNodeId = useTextEditorStore(state => state.nodeId);
  const textEditorLocalFileId = useTextEditorStore(state => state.localFileId);

  // Node Browser state - get current active tab
  const nodeBrowserTabs = useNodeBrowserTabsStore(state => state.tabs);
  const nodeBrowserActiveTabId = useNodeBrowserTabsStore(state => state.activeTabId);
  const activeNodeBrowserTab = useMemo(
    () => nodeBrowserTabs.find(tab => tab.id === nodeBrowserActiveTabId) ?? null,
    [nodeBrowserTabs, nodeBrowserActiveTabId]
  );
  const nodeBrowserMimeType = activeNodeBrowserTab?.mimeType ?? null;
  const nodeBrowserNodeType = activeNodeBrowserTab?.nodeType ?? null;

  // Auto-reset to dashboard if unknown page key is detected (per PRD requirement)
  useEffect(() => {
    const isValid = activePage in routes;
    if (!isValid) {
      // Reset to dashboard in development mode only (warn in console)
      if (import.meta.env.DEV) {
        console.warn(`Unknown page key detected: "${activePage}". Resetting to dashboard.`);
      }
      navigate('dashboard');
    }
  }, [activePage, navigate]);

  // Get page-specific action handlers
  const actionHandlers = usePageActions({
    activeServerId,
    activeNodeBrowserTab,
    nodeBrowserMimeType,
    searchQuery,
    selectedServerIds,
  });

  // Get page metadata for header
  const pageMetadata = useMemo(
    () => ({
      title: t(route.title),
      icon: route.icon,
    }),
    [route, t]
  );

  const pageIcon = getIconComponent(pageMetadata.icon);

  // Get page-specific actions
  const pageActions = useMemo(
    () =>
      getPageActions(activePage, t, actionHandlers, {
        loadedScriptNodeId,
        textEditorWrapEnabled: textEditorWordWrap === 'on',
        textEditorHasRemoteSource:
          Boolean(textEditorServerId && textEditorNodeId) || Boolean(textEditorLocalFileId),
        nodeBrowserNodeName: activeNodeBrowserTab?.nodeName || null,
        nodeBrowserMimeType: nodeBrowserMimeType,
        nodeBrowserNodeType: nodeBrowserNodeType,
        nodeBrowserNodeId: activeNodeBrowserTab?.nodeId || null,
        nodeBrowserServerId: activeNodeBrowserTab?.serverId || null,
        hasSearchQuery: Boolean(searchQuery),
        activeSavedSearchId,
        fileFolderCanCreate: Boolean(createFolderHandler),
        hasServerContext: Boolean(activeServerId),
      }),
    [
      activePage,
      t,
      actionHandlers,
      loadedScriptNodeId,
      textEditorWordWrap,
      textEditorServerId,
      textEditorNodeId,
      textEditorLocalFileId,
      activeNodeBrowserTab,
      nodeBrowserMimeType,
      nodeBrowserNodeType,
      searchQuery,
      activeSavedSearchId,
      createFolderHandler,
      activeServerId,
    ]
  );

  // Determine if page should have no scroll (e.g., Monaco editor pages)
  const noScroll = route.options?.noScroll ?? false;

  const showMultiServerSelector = !activeServerId;

  const searchComponentContent = showMultiServerSelector ? (
    <SearchQueryBuilder
      serverId={null}
      placeholder={t('common:search')}
      disabled={noServersAvailable}
      onSearch={(query, targets) => {
        const resolvedTargets =
          targets && targets.length > 0
            ? targets
            : useSearchStore
                .getState()
                .selectedServerIds.map(id => {
                  const server = useServersStore.getState().servers.find(s => s.id === id);
                  return server
                    ? { id: server.id, baseUrl: server.baseUrl, name: server.name }
                    : null;
                })
                .filter((s): s is { id: number; baseUrl: string; name: string } => Boolean(s));

        if (!resolvedTargets || resolvedTargets.length === 0) {
          return;
        }

        const searchStore = useSearchStore.getState();
        if (resolvedTargets.length === 1) {
          searchStore.executeSearch(resolvedTargets[0], query);
        } else {
          searchStore.executeSearchMulti(resolvedTargets, query);
        }
        navigate('search');
      }}
    />
  ) : (
    <SearchQueryBuilder
      serverId={activeServerId}
      placeholder={t('common:search')}
      disabled={noServersAvailable}
      onSearch={query => {
        if (activeServerId) {
          const server = useServersStore.getState().servers.find(s => s.id === activeServerId);
          if (server) {
            useSearchStore
              .getState()
              .executeSearch({ id: server.id, baseUrl: server.baseUrl, name: server.name }, query);
            navigate('search');
          }
        }
      }}
    />
  );

  const headerActionIcons = useMemo(() => {
    const icons = pageActions.actionIcons ?? [];
    if (showMultiServerSelector) {
      return [...icons, { customNode: <MultiServerSelectorControl /> }];
    }
    return icons;
  }, [pageActions.actionIcons, showMultiServerSelector]);

  // Determine if this is a lazy-loaded page (Monaco-dependent)
  const isLazyPage = activePage === 'jsconsole' || activePage === 'text-editor';

  return (
    <ContentArea
      header={
        <ContentHeader
          title={pageMetadata.title}
          icon={pageIcon}
          actionIcons={headerActionIcons}
          moreMenuActions={showMultiServerSelector ? [] : pageActions.moreMenuActions}
          searchComponent={searchComponentContent}
        />
      }
      noScroll={noScroll}
    >
      {isLazyPage ? (
        <Suspense
          fallback={
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
              }}
            >
              <Loader size="lg" />
            </Box>
          }
        >
          <PageComponent />
        </Suspense>
      ) : (
        <PageComponent />
      )}
    </ContentArea>
  );
}
