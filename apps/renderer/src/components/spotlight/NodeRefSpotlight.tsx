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

import type { RepositoryNode } from '@/core/ipc/backend';
import { useFileFolderBrowserActionsStore } from '@/core/store/fileFolderBrowserActions';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { MODAL_KEYS } from '@/core/store/keys';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { useTextEditorStore } from '@/core/store/textEditor';
import { isTextLikeFile } from '@/features/text-editor/language';
import { useModal } from '@/hooks/useModal';
import { useNavigation } from '@/hooks/useNavigation';
import { useSpotlightBrowser } from '@/hooks/useSpotlightBrowser';
import { Spotlight, SpotlightActionData, spotlight } from '@mantine/spotlight';
import {
  IconArrowLeft,
  IconDashboard,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconPlus,
  IconSearch,
  IconServer,
  IconSettings,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export function NodeRefSpotlight() {
  const { t } = useTranslation(['addServer', 'common', 'fileFolderBrowser', 'spotlight']);
  const { navigate, setActiveServer } = useNavigation();
  const { open: openAddServer } = useModal(MODAL_KEYS.ADD_SERVER);
  const { open: openSettings } = useModal(MODAL_KEYS.SETTINGS);
  const servers = useServersStore(state => state.servers);
  const createFolderHandler = useFileFolderBrowserActionsStore(state => state.createFolderHandler);
  const triggerCreateFolder = useFileFolderBrowserActionsStore(state => state.triggerCreateFolder);

  // Browser State
  const browser = useSpotlightBrowser();
  const loadRemoteTextFile = useTextEditorStore(state => state.loadRemoteFile);
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);

  // Handle file opening
  const handleOpenFile = async (node: RepositoryNode) => {
    if (!browser.serverId) return;
    spotlight.close();

    // Copy-pasted logic from FileFolderBrowserView for simplicity,
    // ideally this should be a shared hook "useNodeOpener"
    const isText = isTextLikeFile(node.name, node.mimeType);

    if (isText) {
      try {
        // We need to fetch content. This is async.
        // We can't await easily inside onClick without proper handling, but it's fine.
        const { rpc } = await import('@/core/ipc/rpc');
        const result = await rpc<{ content: string }>('backend.jsconsole.loadScriptFile', {
          serverId: browser.serverId,
          nodeId: node.id,
        });

        loadRemoteTextFile({
          content: result.content,
          fileName: node.name,
          mimeType: node.mimeType,
          serverId: browser.serverId,
          nodeId: node.id,
        });
        navigate('text-editor');
      } catch (e) {
        console.error(e);
      }
    } else {
      // Default to Node Browser
      openNodeTab({
        nodeId: node.id,
        nodeName: node.name,
        serverId: browser.serverId,
      });
      navigate('node-browser');
    }

    // Reset browser state after action
    browser.reset();
  };

  const getActions = (): SpotlightActionData[] => {
    if (browser.view === 'HOME') {
      return [
        {
          id: 'browse-repo',
          label: t('spotlight:browseRepositories'),
          description: t('spotlight:browseRepositoriesDesc'),
          onClick: () => {
            browser.startBrowsing();
            // Do not close spotlight
          },
          leftSection: <IconFolder size={20} stroke={1.5} />,
        },
        {
          id: 'dashboard',
          label: t('spotlight:dashboard'),
          description: t('spotlight:dashboardDesc'),
          onClick: () => {
            setActiveServer(null);
            navigate('dashboard');
            spotlight.close();
          },
          leftSection: <IconDashboard size={20} stroke={1.5} />,
        },
        {
          id: 'add-server',
          label: t('addServer:addServer'),
          description: t('spotlight:addServerDesc'),
          onClick: () => {
            openAddServer();
            spotlight.close();
          },
          leftSection: <IconPlus size={20} stroke={1.5} />,
        },
        {
          id: 'settings',
          label: t('spotlight:settings'),
          description: t('spotlight:settingsDesc'),
          onClick: () => {
            openSettings();
            spotlight.close();
          },
          leftSection: <IconSettings size={20} stroke={1.5} />,
        },
        ...(createFolderHandler
          ? [
              {
                id: 'create-folder',
                label: t('fileFolderBrowser:createFolderAction'),
                description: t('fileFolderBrowser:createFolderSubtitle'),
                onClick: () => {
                  triggerCreateFolder();
                  spotlight.close();
                },
                leftSection: <IconFolderPlus size={20} stroke={1.5} />,
              } satisfies SpotlightActionData,
            ]
          : []),
        ...servers.map(server => ({
          id: `server-${server.id}`,
          label: server.name,
          description: server.baseUrl,
          onClick: () => {
            setActiveServer(server.id);
            if (server.serverType === 'alfresco') {
              navigate('repo');
            } else {
              navigate('dashboard');
            }
            spotlight.close();
          },
          leftSection: <IconServer size={20} stroke={1.5} />,
        })),
      ];
    }

    const backAction: SpotlightActionData = {
      id: 'back',
      label: '..',
      description: t('spotlight:goBack'),
      onClick: () => browser.goBack(),
      leftSection: <IconArrowLeft size={20} stroke={1.5} />,
    };

    if (browser.view === 'SERVER_LIST') {
      const serverActions: SpotlightActionData[] = browser.servers.map(s => ({
        id: `browse-server-${s.id}`,
        label: s.name,
        description: s.baseUrl,
        onClick: () => browser.selectServer(s),
        leftSection: <IconServer size={20} stroke={1.5} />,
      }));
      return [backAction, ...serverActions];
    }

    if (browser.view === 'FOLDER') {
      if (browser.loading) {
        return [
          {
            id: 'loading',
            label: t('common:loading'),
            description: t('spotlight:fetchingContents'),
            onClick: () => {},
            leftSection: <IconSearch size={20} stroke={1.5} />,
          },
        ];
      }

      const openCurrentFolderAction: SpotlightActionData = {
        id: 'open-current-folder',
        label: t('spotlight:openFolder', {
          name: browser.currentFolderName || t('spotlight:folder'),
        }),
        description: t('spotlight:openFolderDesc'),
        onClick: () => {
          if (browser.serverId && browser.currentFolderId) {
            openFolderTab({
              serverId: browser.serverId,
              nodeId: browser.currentFolderId,
              nodeName: browser.currentFolderName || t('spotlight:folder'),
            });
            navigate('file-folder-browser');
            spotlight.close();
            browser.reset();
          }
        },
        leftSection: <IconExternalLink size={20} stroke={1.5} />,
      };

      const nodeActions: SpotlightActionData[] = browser.items.map(node => ({
        id: node.id,
        label: node.name,
        description: node.nodeType,
        leftSection: node.isFolder ? (
          <IconFolder size={20} stroke={1.5} />
        ) : (
          <IconFile size={20} stroke={1.5} />
        ),
        onClick: () => {
          if (node.isFolder) {
            browser.drillDown(node);
          } else {
            handleOpenFile(node);
          }
        },
      }));

      // Only show "Open Current" if we are not at root? Or always?
      // If currentFolderId is null (-root-), it's effectively "Company Home" or similar.
      // browser.currentFolderId might be null if we just entered server.
      // Let's check useSpotlightBrowser default.
      // loadFolder sets currentFolderId to null if undefined.
      // But passing undefined to backend opens root.
      // If we want to open root in browser, we need root ID?
      // FileFolderBrowserView handles root if nodeId is missing?
      // Actually usually we need a nodeId.
      // If currentFolderId is null, we might need to resolve it,
      // or we can just pass '-root-' (which backendRpc default uses).

      const actionsList = [backAction, openCurrentFolderAction, ...nodeActions];

      if (browser.pagination.hasMore) {
        actionsList.push({
          id: 'load-more',
          label: t('spotlight:loadMore'),
          description: t('spotlight:loadMoreDesc'),
          onClick: () => browser.loadMore(),
          leftSection: <IconPlus size={20} stroke={1.5} />,
        });
      }

      return actionsList;
    }

    return [];
  };

  const actions = getActions();

  // Handle closing properly (reset browser if closed without action? handled by useEffect?)
  // Actually, Spotlight component doesn't have onClose prop easily accessible here without wrapping.
  // We can just rely on manual resets or next open.
  // To ensure clean state on open, we might want to `useEffect` on mount?
  // No, mounting happens when component is rendered (always rendered if in layout?).
  // Spotlight is usually global.

  return (
    <Spotlight
      actions={actions}
      nothingFound={t('common:nothingFound')}
      highlightQuery
      searchProps={{
        leftSection: <IconSearch size={20} stroke={1.5} />,
        placeholder:
          browser.view === 'FOLDER'
            ? t('common:searchIn', {
                context: browser.currentFolderName || t('spotlight:folder'),
              })
            : t('common:search'),
      }}
      shortcut={['mod + K', 'mod + P']}
      closeOnActionTrigger={false}
      scrollAreaProps={{ type: 'scroll' }}
      // Use styles to strictly enforce height limits on the actions list
      styles={{
        actionsList: {
          maxHeight: 'calc(80vh - 60px)', // Account for search input height
          overflowY: 'auto',
        },
        content: {
          maxHeight: '80vh',
          overflow: 'hidden',
        },
      }}
    />
  );
}
