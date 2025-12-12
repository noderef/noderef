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

import { backendRpc } from '@/core/ipc/backend';
import { useFileFolderBrowserActionsStore } from '@/core/store/fileFolderBrowserActions';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { MODAL_KEYS } from '@/core/store/keys';
import { useLocalFilesStore } from '@/core/store/localFiles';
import { useSavedSearchesStore } from '@/core/store/savedSearches';
import { useTextEditorStore } from '@/core/store/textEditor';
import { useModal } from '@/hooks/useModal';
import { useNavigation } from '@/hooks/useNavigation';
import { Box, Group, Paper, ScrollArea, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconFileDownload } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface UsePageActionsOptions {
  activeServerId: number | null;
  activeNodeBrowserTab: {
    serverId: number;
    nodeId: string;
    nodeName: string;
    mimeType: string | null;
    nodeType: string | null;
  } | null;
  nodeBrowserMimeType: string | null;
  searchQuery: string;
  selectedServerIds: number[];
}

export function usePageActions(options: UsePageActionsOptions) {
  const {
    activeServerId,
    activeNodeBrowserTab,
    nodeBrowserMimeType,
    searchQuery,
    selectedServerIds,
  } = options;
  const { navigate } = useNavigation();
  const { t } = useTranslation(['submenu', 'common']);
  const { open: openSaveSearchModal } = useModal(MODAL_KEYS.SAVE_SEARCH);
  const activeSavedSearchId = useSavedSearchesStore(state => state.activeSavedSearchId);
  const triggerCreateFolder = useFileFolderBrowserActionsStore(state => state.triggerCreateFolder);

  // JS Console specific state
  const setJsConsoleCode = useJsConsoleStore(state => state.setCode);
  const jsConsoleCode = useJsConsoleStore(state => state.code);
  const setDocumentContext = useJsConsoleStore(state => state.setDocumentContext);
  const clearDocumentContext = useJsConsoleStore(state => state.clearDocumentContext);
  const setLoadedScript = useJsConsoleStore(state => state.setLoadedScript);
  const loadedScriptName = useJsConsoleStore(state => state.loadedScriptName);
  const loadedScriptNodeId = useJsConsoleStore(state => state.loadedScriptNodeId);
  const formatCode = useJsConsoleStore(state => state.formatCode);

  // Text Editor specific state
  const textEditorWordWrap = useTextEditorStore(state => state.wordWrap);
  const setTextEditorWordWrap = useTextEditorStore(state => state.setWordWrap);
  const textEditorContent = useTextEditorStore(state => state.content);
  const textEditorServerId = useTextEditorStore(state => state.serverId);
  const textEditorNodeId = useTextEditorStore(state => state.nodeId);
  const textEditorFileName = useTextEditorStore(state => state.fileName);
  const loadRemoteTextFile = useTextEditorStore(state => state.loadRemoteFile);
  const textEditorLocalFileId = useTextEditorStore(state => state.localFileId);
  const updateLocalFileInStore = useLocalFilesStore(state => state.updateFile);

  const actionHandlers = useMemo(
    () => ({
      onNewFile: () => {
        useLocalFilesStore.getState().requestCreateModal();
      },

      // JS Console handlers
      onFormatCode: () => {
        formatCode();
      },
      onSaveScript: async () => {
        if (!activeServerId || !loadedScriptNodeId) {
          notifications.show({
            title: 'No Script Loaded',
            message: 'Please load a script before saving',
            color: 'orange',
          });
          return;
        }

        try {
          const { rpc } = await import('@/core/ipc/rpc');
          await rpc('backend.jsconsole.saveScriptFile', {
            serverId: activeServerId,
            nodeId: loadedScriptNodeId,
            content: jsConsoleCode,
          });

          notifications.show({
            title: 'Script Saved',
            message: `${loadedScriptName} saved successfully`,
            color: 'green',
          });
        } catch (error) {
          notifications.show({
            title: 'Save Failed',
            message: error instanceof Error ? error.message : 'Failed to save script',
            color: 'red',
          });
        }
      },
      onLoadScript: async () => {
        if (!activeServerId) {
          return;
        }

        try {
          const { rpc } = await import('@/core/ipc/rpc');
          const scripts = await rpc<Array<{ id: string; name: string; modifiedAt: string }>>(
            'backend.jsconsole.getScriptFiles',
            {
              serverId: activeServerId,
            }
          );

          if (scripts.length === 0) {
            modals.open({
              title: (
                <Group gap="xs">
                  <IconFileDownload size={20} />
                  <Text>No Scripts Found</Text>
                </Group>
              ),
              children: (
                <Text size="sm">
                  No JavaScript files found in /Company Home/Data Dictionary/Scripts
                </Text>
              ),
            });
            return;
          }

          // Sort scripts by modified date (most recent first)
          const sortedScripts = [...scripts].sort(
            (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
          );

          // Show modal with script list
          modals.open({
            title: (
              <Group gap="xs">
                <IconFileDownload size={20} />
                <Text>Load Script</Text>
              </Group>
            ),
            size: 'lg',
            children: (
              <Box>
                <Text size="sm" mb="md">
                  Select a script to load:
                </Text>
                <ScrollArea h={400} offsetScrollbars>
                  {sortedScripts.map(script => (
                    <Paper
                      key={script.id}
                      p="sm"
                      mb="xs"
                      style={{ cursor: 'pointer' }}
                      withBorder
                      onClick={async () => {
                        try {
                          const { rpc } = await import('@/core/ipc/rpc');
                          const result = await rpc<{ content: string }>(
                            'backend.jsconsole.loadScriptFile',
                            {
                              serverId: activeServerId,
                              nodeId: script.id,
                            }
                          );
                          setLoadedScript(script.name, script.id, result.content);
                          modals.closeAll();
                          notifications.show({
                            title: 'Script Loaded',
                            message: `${script.name} loaded successfully`,
                            color: 'green',
                          });
                        } catch (error) {
                          notifications.show({
                            title: 'Error',
                            message:
                              error instanceof Error ? error.message : 'Failed to load script',
                            color: 'red',
                          });
                        }
                      }}
                    >
                      <Text fw={500}>{script.name}</Text>
                      <Text size="xs" c="dimmed">
                        Modified: {new Date(script.modifiedAt).toLocaleString()}
                      </Text>
                    </Paper>
                  ))}
                </ScrollArea>
              </Box>
            ),
          });
        } catch (error) {
          notifications.show({
            title: 'Error',
            message: error instanceof Error ? error.message : 'Failed to load scripts',
            color: 'red',
          });
        }
      },
      onClearEditor: () => {
        setJsConsoleCode('');
      },
      onConsoleSettings: () => {
        console.log('Console settings - to be implemented');
        // TODO: Open settings modal
      },
      onSetDocument: () => {
        const input = prompt(
          'Enter nodeRef or nodeId:\n\nExamples:\n- workspace://SpacesStore/abc-123\n- abc-123'
        );
        if (input && input.trim()) {
          let fullNodeRef = input.trim();

          // If input doesn't contain "://", assume it's just a nodeId and construct full nodeRef
          if (!fullNodeRef.includes('://')) {
            fullNodeRef = `workspace://SpacesStore/${fullNodeRef}`;
          }

          // Extract node name (the UUID part after the last slash)
          const nodeName = fullNodeRef.split('/').pop() || fullNodeRef;
          setDocumentContext(fullNodeRef, nodeName);
        }
      },
      onClearDocument: () => {
        clearDocumentContext();
      },
      onHelp: () => {
        console.log('Help clicked');
        // TODO: Open help/documentation
      },
      onTextEditorToggleWrap: () => {
        setTextEditorWordWrap(textEditorWordWrap === 'on' ? 'off' : 'on');
      },
      onTextEditorSave: async () => {
        try {
          if (textEditorLocalFileId) {
            const updated = await backendRpc.localFiles.update(textEditorLocalFileId, {
              name: textEditorFileName ?? 'Untitled',
              content: textEditorContent,
            });
            updateLocalFileInStore(updated.id, updated);
            notifications.show({
              title: 'Saved',
              message: `${updated.name} updated`,
              color: 'green',
            });
            return;
          }

          if (!textEditorServerId || !textEditorNodeId) {
            notifications.show({
              title: 'Remote file required',
              message: 'Open a repository file before saving back to the server.',
              color: 'orange',
            });
            return;
          }

          const { rpc } = await import('@/core/ipc/rpc');
          await rpc('backend.jsconsole.saveScriptFile', {
            serverId: textEditorServerId,
            nodeId: textEditorNodeId,
            content: textEditorContent,
          });
          notifications.show({
            title: 'Saved',
            message: textEditorFileName ? `${textEditorFileName} updated` : 'File saved to server',
            color: 'green',
          });
        } catch (error) {
          notifications.show({
            title: 'Save failed',
            message: error instanceof Error ? error.message : 'Unable to save file',
            color: 'red',
          });
        }
      },
      onOpenInTextEditor: async () => {
        if (!activeNodeBrowserTab) {
          return;
        }

        try {
          const { rpc } = await import('@/core/ipc/rpc');
          const result = await rpc<{ content: string }>('backend.jsconsole.loadScriptFile', {
            serverId: activeNodeBrowserTab.serverId,
            nodeId: activeNodeBrowserTab.nodeId,
          });
          loadRemoteTextFile({
            content: result.content,
            fileName: activeNodeBrowserTab.nodeName,
            mimeType: nodeBrowserMimeType || undefined,
            serverId: activeNodeBrowserTab.serverId,
            nodeId: activeNodeBrowserTab.nodeId,
          });
          navigate('text-editor');
          notifications.show({
            title: t('submenu:textEditor'),
            message: t('submenu:openInTextEditorSuccess'),
            color: 'green',
          });
        } catch (error) {
          notifications.show({
            title: t('common:error'),
            message: error instanceof Error ? error.message : 'Failed to open file',
            color: 'red',
          });
        }
      },
      onOpenInJsConsole: async () => {
        if (!activeNodeBrowserTab) {
          return;
        }

        // Set as document context (don't load content into editor)
        const nodeRef = `workspace://SpacesStore/${activeNodeBrowserTab.nodeId}`;
        setDocumentContext(nodeRef, activeNodeBrowserTab.nodeName);
        navigate('jsconsole');
        notifications.show({
          title: 'Document Set',
          message: `${activeNodeBrowserTab.nodeName} set as document context`,
          color: 'green',
        });
      },
      onSaveSearch: () => {
        openSaveSearchModal({
          query: searchQuery,
          serverId: activeServerId ?? selectedServerIds[0] ?? null,
        });
      },
      onEditSavedSearch: () => {
        if (!activeSavedSearchId) {
          return;
        }
        openSaveSearchModal({
          mode: 'edit',
          savedSearchId: activeSavedSearchId,
        });
      },
      onCreateFolder: () => {
        triggerCreateFolder();
      },
    }),
    [
      activeServerId,
      setJsConsoleCode,
      jsConsoleCode,
      setDocumentContext,
      clearDocumentContext,
      setLoadedScript,
      loadedScriptNodeId,
      loadedScriptName,
      formatCode,
      setTextEditorWordWrap,
      textEditorWordWrap,
      textEditorServerId,
      textEditorNodeId,
      textEditorContent,
      textEditorFileName,
      loadRemoteTextFile,
      navigate,
      t,
      activeNodeBrowserTab,
      nodeBrowserMimeType,
      openSaveSearchModal,
      searchQuery,
      selectedServerIds,
      activeSavedSearchId,
      triggerCreateFolder,
      textEditorLocalFileId,
      updateLocalFileInStore,
    ]
  );

  return actionHandlers;
}
