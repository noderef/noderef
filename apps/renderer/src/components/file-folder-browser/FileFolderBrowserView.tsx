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

import { getFileIconByMimeType } from '@/components/submenu/fileIconUtils';
import { alfrescoRpc } from '@/core/ipc/alfresco';
import {
  backendRpc,
  type RepositoryBreadcrumbItem,
  type RepositoryNode,
  type RepositoryPaginationInfo,
} from '@/core/ipc/backend';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { useFileFolderBrowserActionsStore } from '@/core/store/fileFolderBrowserActions';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useNavigationStore } from '@/core/store/navigation';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { useTextEditorStore } from '@/core/store/textEditor';
import { isTextLikeFile } from '@/features/text-editor/language';
import { markNodesTemporary as markNodesTemporaryRpc } from '@/utils/markNodesTemporary';
import {
  ActionIcon,
  Anchor,
  Breadcrumbs,
  Button,
  Checkbox,
  Combobox,
  Group,
  Loader,
  Menu,
  Paper,
  Pill,
  PillsInput,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Switch,
  useCombobox,
} from '@mantine/core';
import { Dropzone, type FileRejection } from '@mantine/dropzone';
import { useIntersection, useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { filesystem, os } from '@neutralinojs/lib';
import {
  IconArchive,
  IconCode,
  IconDots,
  IconEdit,
  IconFileSearch,
  IconFolder,
  IconPhoto,
  IconRefresh,
  IconTextWrap,
  IconTrash,
  IconUpload,
  IconX,
  IconWorld,
  IconWorldPlus,
  IconWorldX,
} from '@tabler/icons-react';
import { fromEvent } from 'file-selector';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DropEvent, FileWithPath } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { CreateSiteForm } from '@/components/submenu/CreateSiteForm';

interface FileFolderBrowserViewProps {
  serverId: number;
  nodeId: string;
  nodeName: string;
  tabId: string;
  isActive: boolean;
}

const PAGE_SIZE = 50;

const getFileNameFromPath = (path: string): string => {
  if (!path) return 'file';
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || 'file';
};

interface FileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

interface FileSystemDirectoryReader {
  readEntries: (
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader: () => FileSystemDirectoryReader;
}

function addPathToFile(file: File, path: string): FileWithPath {
  const fileWithPath = file as FileWithPath;
  Object.defineProperty(fileWithPath, 'path', {
    value: path,
    configurable: true,
  });
  return fileWithPath;
}

async function readFileEntry(
  entry: FileSystemFileEntry,
  pathPrefix: string
): Promise<FileWithPath[]> {
  const file = await new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });
  const relativePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
  return [addPathToFile(file, relativePath)];
}

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];

  async function readBatch(): Promise<void> {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      return;
    }

    entries.push(...batch);
    await readBatch();
  }

  await readBatch();
  return entries;
}

async function readDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  pathPrefix: string
): Promise<FileWithPath[]> {
  const newPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
  const reader = entry.createReader();
  const entries = await readAllDirectoryEntries(reader);
  const files: FileWithPath[] = [];
  for (const child of entries) {
    if ((child as FileSystemDirectoryEntry).isDirectory) {
      files.push(...(await readDirectoryEntry(child as FileSystemDirectoryEntry, newPrefix)));
    } else if ((child as FileSystemFileEntry).isFile) {
      files.push(...(await readFileEntry(child as FileSystemFileEntry, newPrefix)));
    }
  }
  return files;
}

async function getFilesFromDataTransferItem(item: DataTransferItem): Promise<FileWithPath[]> {
  const entry = (
    item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }
  ).webkitGetAsEntry?.();
  if (entry) {
    if ((entry as unknown as FileSystemDirectoryEntry).isDirectory) {
      return readDirectoryEntry(entry as unknown as FileSystemDirectoryEntry, '');
    }
    if ((entry as unknown as FileSystemFileEntry).isFile) {
      return readFileEntry(entry as unknown as FileSystemFileEntry, '');
    }
  }

  if (item.kind === 'file') {
    const file = item.getAsFile();
    if (file) {
      return [addPathToFile(file, file.name)];
    }
  }

  return [];
}

const dropzoneGetFilesFromEvent = async (event: DropEvent) => {
  const dragEvent = event as unknown as DragEvent;
  const items = dragEvent?.dataTransfer?.items;
  if (!items) {
    return fromEvent(event);
  }

  const filePromises = Array.from(items as DataTransferItemList).map((item: DataTransferItem) =>
    getFilesFromDataTransferItem(item)
  );
  const collected = (await Promise.all(filePromises)).flat();
  if (collected.length === 0) {
    return fromEvent(event);
  }
  return collected;
};

interface LoadMoreRowProps {
  isLoading: boolean;
  onLoadMore: () => void;
  idleLabel: string;
  loadingLabel: string;
  colSpan: number;
}

const LoadMoreRow = ({
  isLoading,
  onLoadMore,
  idleLabel,
  loadingLabel,
  colSpan,
}: LoadMoreRowProps) => {
  const { ref, entry } = useIntersection({ threshold: 0.25 });
  const [canAutoLoad, setCanAutoLoad] = useState(true);

  useEffect(() => {
    if (!entry) {
      return;
    }
    if (!entry.isIntersecting) {
      setCanAutoLoad(true);
      return;
    }

    if (!isLoading && canAutoLoad) {
      setCanAutoLoad(false);
      onLoadMore();
    }
  }, [entry, isLoading, canAutoLoad, onLoadMore]);

  const handleManualLoad = () => {
    if (!isLoading) {
      setCanAutoLoad(false);
      onLoadMore();
    }
  };

  return (
    <Table.Tr
      ref={ref}
      onClick={handleManualLoad}
      style={{
        cursor: isLoading ? 'default' : 'pointer',
        backgroundColor: 'transparent',
        transition: 'background-color 150ms ease',
      }}
      onMouseEnter={e => {
        if (!isLoading) {
          e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <Table.Td colSpan={colSpan}>
        <Group
          gap="sm"
          wrap="nowrap"
          justify="center"
          style={{ padding: 'var(--mantine-spacing-xs)' }}
        >
          {isLoading ? (
            <Loader
              size="sm"
              style={{
                padding: '4px',
              }}
            />
          ) : (
            <IconDots size={16} stroke={1.5} />
          )}
          <Text size="sm" c="dimmed">
            {isLoading ? loadingLabel : idleLabel}
          </Text>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
};

interface DeleteSiteModalContentProps {
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  permanentLabel: string;
  permanentHint: string;
  onConfirm: (permanent: boolean) => void | Promise<void>;
  onCancel: () => void;
}

const DeleteSiteModalContent = ({
  message,
  confirmLabel,
  cancelLabel,
  permanentLabel,
  permanentHint,
  onConfirm,
  onCancel,
}: DeleteSiteModalContentProps) => {
  const [permanent, setPermanent] = useState(true);

  return (
    <Stack gap="sm">
      <div>{typeof message === 'string' ? <Text size="sm">{message}</Text> : message}</div>
      <Switch
        label={permanentLabel}
        description={permanentHint}
        checked={permanent}
        onChange={event => setPermanent(event.currentTarget.checked)}
      />
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button color="red" onClick={() => onConfirm(permanent)}>
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
};

interface PaginationState {
  hasMore: boolean;
  nextSkipCount: number;
  totalItems?: number;
}

export function FileFolderBrowserView({
  serverId,
  nodeId,
  nodeName,
  tabId,
  isActive,
}: FileFolderBrowserViewProps) {
  const { t, i18n } = useTranslation(['common', 'fileFolderBrowser', 'submenu']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<RepositoryNode[]>([]);
  const breadcrumbContainerRef = useRef<HTMLDivElement>(null);
  const breadcrumbContentRef = useRef<HTMLDivElement>(null);
  const [breadcrumb, setBreadcrumb] = useState<RepositoryBreadcrumbItem[]>([]);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    hasMore: false,
    nextSkipCount: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const requestIdRef = useRef(0);
  const dropzoneOpenRef = useRef<() => void>(null);
  const isMountedRef = useRef(true);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState<RepositoryNode | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(
    null
  );
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ completed: number; total: number } | null>(
    null
  );
  const server = useServersStore(state => state.servers.find(s => s.id === serverId) || null);
  const [visibleBreadcrumbStart, setVisibleBreadcrumbStart] = useState(0);
  const visibleBreadcrumbStartRef = useRef(0);
  useEffect(() => {
    visibleBreadcrumbStartRef.current = visibleBreadcrumbStart;
  }, [visibleBreadcrumbStart]);

  const markNodesTemporary = useCallback(
    async (nodeIds: string[]) => {
      if (!server) {
        throw new Error(t('fileFolderBrowser:uploadServerMissing'));
      }
      await markNodesTemporaryRpc(serverId, nodeIds);
    },
    [server, serverId, t]
  );
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const navigate = useNavigationStore(state => state.navigate);
  const setLoadedScript = useJsConsoleStore(state => state.setLoadedScript);
  const setDocumentContext = useJsConsoleStore(state => state.setDocumentContext);
  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);
  const loadRemoteTextFile = useTextEditorStore(state => state.loadRemoteFile);
  const isCompact = useMediaQuery('(max-width: 1024px)');
  const tableColumnCount = isCompact ? 4 : 5;
  const setCreateFolderHandler = useFileFolderBrowserActionsStore(
    state => state.setCreateFolderHandler
  );

  const updatePaginationState = useCallback(
    (pagination: RepositoryPaginationInfo | undefined, loadedCount: number) => {
      if (!pagination) {
        setPaginationState({
          hasMore: false,
          nextSkipCount: 0,
        });
        return;
      }

      const nextSkipCount = pagination.skipCount + loadedCount;
      const hasMore = pagination.hasMoreItems && loadedCount > 0;

      setPaginationState({
        hasMore,
        nextSkipCount,
        totalItems: pagination.totalItems,
      });
    },
    []
  );

  const loadChildren = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await backendRpc.repository.getNodeChildren(serverId, nodeId, {
        maxItems: PAGE_SIZE,
        skipCount: 0,
      });
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setChildren(response.nodes);
      setBreadcrumb(response.breadcrumb || []);
      updatePaginationState(response.pagination, response.nodes.length);
    } catch (err) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : t('fileFolderBrowser:loadError'));
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [nodeId, serverId, t, updatePaginationState]);

  const handleLoadMore = useCallback(async () => {
    if (!paginationState.hasMore || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const response = await backendRpc.repository.getNodeChildren(serverId, nodeId, {
        maxItems: PAGE_SIZE,
        skipCount: paginationState.nextSkipCount,
      });

      if (!isMountedRef.current) return;

      setChildren(prev => [...prev, ...response.nodes]);
      updatePaginationState(response.pagination, response.nodes.length);
    } catch (err) {
      console.error('Failed to load more children:', err);
      // Don't show error notification for load more failures, just log it
    } finally {
      if (isMountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [nodeId, serverId, paginationState, loadingMore, updatePaginationState]);

  useEffect(() => {
    isMountedRef.current = true;
    loadChildren();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadChildren]);

  useEffect(() => {
    setSelectedNodeIds(prev => {
      const childIds = new Set(children.map(child => child.id));
      return prev.filter(id => childIds.has(id));
    });
  }, [children]);

  const uploadFileToFolder = useCallback(
    async (file: File, targetFolderId?: string) => {
      if (!server) {
        throw new Error(t('fileFolderBrowser:uploadServerMissing'));
      }

      await alfrescoRpc.rpcBinary('upload.uploadFile', server.baseUrl, file, {
        serverId,
        args: [
          null, // relativePath
          targetFolderId ?? nodeId, // rootFolderId
          { name: file.name, nodeType: 'cm:content' }, // nodeBody
          { autoRename: true }, // opts
        ],
      });
    },
    [nodeId, server, serverId, t]
  );

  const createFolderNode = useCallback(
    async (parentNodeId: string, folderName: string, nodeType = 'cm:folder') => {
      if (!server) {
        throw new Error(t('fileFolderBrowser:uploadServerMissing'));
      }
      const attemptCreate = async () => {
        const result = (await alfrescoRpc.call(
          'nodes.createNode',
          [
            parentNodeId,
            {
              name: folderName,
              nodeType,
            },
            {
              autoRename: false,
            },
          ],
          server.baseUrl,
          serverId
        )) as { entry?: { id?: string } } | undefined;
        return result?.entry?.id;
      };

      try {
        const createdId = await attemptCreate();
        if (createdId) {
          return createdId;
        }
      } catch (error) {
        const existingId = await (async () => {
          try {
            const response = (await alfrescoRpc.call(
              'nodes.listNodeChildren',
              [
                parentNodeId,
                {
                  maxItems: 2000,
                  skipCount: 0,
                  include: [],
                },
              ],
              server.baseUrl,
              serverId
            )) as {
              list?: {
                entries?: Array<{ entry?: { id?: string; name?: string; isFolder?: boolean } }>;
              };
            };
            return (
              response?.list?.entries?.find(
                entry => entry.entry?.isFolder && entry.entry?.name === folderName
              )?.entry?.id ?? null
            );
          } catch {
            return null;
          }
        })();

        if (existingId) {
          return existingId;
        }

        throw error;
      }
      throw new Error(
        t('fileFolderBrowser:createFolderError', {
          name: folderName,
        })
      );
    },
    [server, serverId, t]
  );

  const handleDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      if (rejections.length === 0) {
        return;
      }

      const firstReason =
        rejections[0]?.errors?.[0]?.message || t('fileFolderBrowser:uploadRejectedDefault');

      notifications.show({
        title: t('fileFolderBrowser:uploadRejectedTitle'),
        message: t('fileFolderBrowser:uploadRejectedMessage', {
          count: rejections.length,
          reason: firstReason,
        }),
        color: 'orange',
      });
    },
    [t]
  );

  const handleDrop = useCallback(
    async (acceptedFiles: FileWithPath[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      if (!server) {
        notifications.show({
          title: t('common:error'),
          message: t('fileFolderBrowser:uploadServerMissing'),
          color: 'red',
        });
        return;
      }

      const parentCache = new Map<string, string>();
      parentCache.set('', nodeId);

      const getOrCreateFolderId = async (relativeDir: string): Promise<string> => {
        if (!relativeDir) return nodeId;
        if (parentCache.has(relativeDir)) {
          return parentCache.get(relativeDir)!;
        }

        const segments = relativeDir.split('/').filter(segment => segment.length > 0);
        let currentPath = '';
        let currentParentId = nodeId;
        for (const segment of segments) {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;
          if (parentCache.has(currentPath)) {
            currentParentId = parentCache.get(currentPath)!;
            continue;
          }
          const newFolderId = await createFolderNode(currentParentId, segment);
          parentCache.set(currentPath, newFolderId);
          currentParentId = newFolderId;
        }

        return parentCache.get(relativeDir)!;
      };

      setUploadingFiles(true);
      setUploadProgress({ completed: 0, total: acceptedFiles.length });
      try {
        const succeeded: string[] = [];
        const failed: Array<{ name: string; error: string }> = [];

        for (const file of acceptedFiles) {
          const relativePath = (file.path || file.webkitRelativePath || '')
            .replace(/\\/g, '/')
            .trim();
          const dirPath = relativePath.includes('/')
            ? relativePath.split('/').slice(0, -1).join('/')
            : '';

          try {
            const parentFolderId = dirPath ? await getOrCreateFolderId(dirPath) : nodeId;
            await uploadFileToFolder(file, parentFolderId);
            succeeded.push(file.name);
          } catch (err) {
            failed.push({
              name: file.name,
              error: err instanceof Error ? err.message : t('fileFolderBrowser:uploadUnknownError'),
            });
          }
          setUploadProgress(prev =>
            prev ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) } : prev
          );
        }

        if (succeeded.length > 0) {
          notifications.show({
            title: t('fileFolderBrowser:uploadSuccessTitle'),
            message:
              succeeded.length === 1
                ? t('fileFolderBrowser:uploadSingleSuccess', {
                    name: succeeded[0],
                  })
                : t('fileFolderBrowser:uploadMultiSuccess', {
                    count: succeeded.length,
                  }),
            color: 'green',
          });
          await loadChildren();
        }

        if (failed.length > 0) {
          const [first, second] = failed;
          const summaryParts = [first];
          if (second) summaryParts.push(second);
          const summaryMessage = summaryParts.map(item => `${item.name}: ${item.error}`).join('\n');

          notifications.show({
            title: t('fileFolderBrowser:uploadFailedTitle'),
            message:
              failed.length > 2
                ? `${summaryMessage}\n${t('fileFolderBrowser:uploadMoreFailures', {
                    count: failed.length - 2,
                  })}`
                : summaryMessage,
            color: 'red',
          });
        }
      } finally {
        setUploadingFiles(false);
        setUploadProgress(null);
      }
    },
    [createFolderNode, loadChildren, nodeId, server, t, uploadFileToFolder]
  );

  const handleBrowseFiles = useCallback(async () => {
    if (!isNeutralinoMode()) {
      dropzoneOpenRef.current?.();
      return;
    }

    try {
      await ensureNeutralinoReady();
      const selection = await os.showOpenDialog(t('fileFolderBrowser:browseFilesDialogTitle'), {
        multiSelections: true,
      });
      const selected = Array.isArray(selection) ? selection : selection ? [selection] : [];
      if (selected.length === 0) {
        return;
      }

      const files: FileWithPath[] = [];
      for (const selectedPath of selected) {
        if (!selectedPath) continue;
        const buffer = await filesystem.readBinaryFile(selectedPath);
        const fileName = getFileNameFromPath(selectedPath);
        files.push(addPathToFile(new File([buffer], fileName), fileName));
      }

      if (files.length > 0) {
        await handleDrop(files);
      }
    } catch (error) {
      console.error('Failed to pick files via Neutralino', error);
      notifications.show({
        title: t('common:error'),
        message:
          error instanceof Error ? error.message : t('fileFolderBrowser:browseFilesNativeError'),
        color: 'red',
      });
    }
  }, [handleDrop, t]);

  const handleCreateFolderClick = useCallback(() => {
    if (!server) {
      notifications.show({
        title: t('common:error'),
        message: t('fileFolderBrowser:uploadServerMissing'),
        color: 'red',
      });
      return;
    }

    const modalId = modals.open({
      title: t('fileFolderBrowser:createFolderTitle'),
      children: (
        <CreateFolderForm
          defaultType="cm:folder"
          serverId={serverId}
          baseUrl={server.baseUrl}
          onCancel={() => modals.close(modalId)}
          onSubmit={async (folderName, nodeType) => {
            try {
              await createFolderNode(nodeId, folderName, nodeType);
              notifications.show({
                title: t('common:success'),
                message: t('fileFolderBrowser:createFolderSuccess', {
                  name: folderName,
                }),
                color: 'green',
              });
              modals.close(modalId);
              await loadChildren();
            } catch (error) {
              notifications.show({
                title: t('common:error'),
                message:
                  error instanceof Error
                    ? error.message
                    : t('fileFolderBrowser:createFolderError', {
                        name: folderName,
                      }),
                color: 'red',
              });
            }
          }}
        />
      ),
      withCloseButton: false,
    });
  }, [createFolderNode, loadChildren, nodeId, server, serverId, t]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    setCreateFolderHandler(handleCreateFolderClick, tabId);
    return () => {
      setCreateFolderHandler(null, tabId);
    };
  }, [handleCreateFolderClick, isActive, setCreateFolderHandler, tabId]);

  const sortedChildren = useMemo(() => {
    return [...children].sort((a, b) => {
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [children]);
  const visibleNodeIds = useMemo(() => sortedChildren.map(child => child.id), [sortedChildren]);
  const visibleSelectedCount = useMemo(
    () => visibleNodeIds.filter(id => selectedNodeIds.includes(id)).length,
    [selectedNodeIds, visibleNodeIds]
  );
  const allVisibleSelected =
    visibleNodeIds.length > 0 && visibleSelectedCount === visibleNodeIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const handleRowCheckboxChange = useCallback((nodeId: string, checked: boolean) => {
    setSelectedNodeIds(prev => {
      if (checked) {
        if (prev.includes(nodeId)) {
          return prev;
        }
        return [...prev, nodeId];
      }
      return prev.filter(id => id !== nodeId);
    });
  }, []);

  const handleSelectAllVisible = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedNodeIds(prev => {
          const set = new Set(prev);
          visibleNodeIds.forEach(id => set.add(id));
          return Array.from(set);
        });
      } else {
        setSelectedNodeIds(prev => prev.filter(id => !visibleNodeIds.includes(id)));
      }
    },
    [visibleNodeIds]
  );

  const deleteSelectedNodes = useCallback(
    async (skipTrash = false) => {
      if (selectedNodeIds.length === 0) {
        return;
      }
      setBulkDeleting(true);
      setDeleteProgress({ completed: 0, total: selectedNodeIds.length });
      const nodesMap = new Map(children.map(node => [node.id, node]));
      const successIds: string[] = [];
      const failures: Array<{ name: string; error: string }> = [];
      try {
        for (const nodeId of selectedNodeIds) {
          try {
            if (skipTrash) {
              await markNodesTemporary([nodeId]);
            }
            await backendRpc.repository.deleteNode(serverId, nodeId, skipTrash);
            successIds.push(nodeId);
          } catch (error) {
            failures.push({
              name: nodesMap.get(nodeId)?.name || nodeId,
              error:
                error instanceof Error ? error.message : t('fileFolderBrowser:deleteSelectedError'),
            });
          }
          setDeleteProgress(prev =>
            prev ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) } : prev
          );
        }

        if (successIds.length > 0) {
          notifications.show({
            title: t('common:success'),
            message: t('fileFolderBrowser:deleteSelectedSuccess', {
              count: successIds.length,
            }),
            color: 'green',
          });
          const successSet = new Set(successIds);
          setSelectedNodeIds(prev => prev.filter(id => !successSet.has(id)));
          await loadChildren();
        }

        if (failures.length > 0) {
          const summary = failures
            .slice(0, 2)
            .map(item => `${item.name}: ${item.error}`)
            .join('\n');
          const extra =
            failures.length > 2
              ? `\n${t('fileFolderBrowser:deleteSelectedPartial', {
                  count: failures.length - 2,
                })}`
              : '';
          notifications.show({
            title: t('common:error'),
            message: `${summary}${extra}`,
            color: 'red',
          });
        }
      } finally {
        setBulkDeleting(false);
        setDeleteProgress(null);
      }
    },
    [children, loadChildren, markNodesTemporary, selectedNodeIds, serverId, t]
  );

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedNodeIds.length === 0 || bulkDeleting) {
      return;
    }
    const modalId = modals.open({
      title: t('fileFolderBrowser:deleteSelectedTitle'),
      children: (
        <DeleteConfirmationContent
          message={
            <Text size="sm">
              {t('fileFolderBrowser:deleteSelectedMessage', {
                count: selectedNodeIds.length,
              })}
            </Text>
          }
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          skipLabel={t('fileFolderBrowser:skipTrashLabel')}
          onCancel={() => modals.close(modalId)}
          onConfirm={skipTrash => {
            modals.close(modalId);
            void deleteSelectedNodes(skipTrash);
          }}
        />
      ),
      withCloseButton: false,
    });
  }, [bulkDeleting, deleteSelectedNodes, selectedNodeIds.length, t]);

  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language || undefined, { numeric: 'auto' }),
    [i18n.language]
  );

  const formatRelativeDate = useCallback(
    (value?: string) => {
      if (!value) {
        return t('fileFolderBrowser:unknownDate');
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
        { amount: 60, unit: 'second' },
        { amount: 60, unit: 'minute' },
        { amount: 24, unit: 'hour' },
        { amount: 7, unit: 'day' },
        { amount: 4.34524, unit: 'week' },
        { amount: 12, unit: 'month' },
        { amount: Infinity, unit: 'year' },
      ];

      let duration = (date.getTime() - Date.now()) / 1000;
      for (const division of divisions) {
        if (Math.abs(duration) < division.amount) {
          return relativeTimeFormatter.format(Math.round(duration), division.unit);
        }
        duration /= division.amount;
      }
      return relativeTimeFormatter.format(Math.round(duration), 'year');
    },
    [relativeTimeFormatter, t]
  );

  const renderNodeIcon = (node: RepositoryNode) => {
    const isSite = node.nodeType === 'st:site' || node.nodeType === 'st:sites';
    const isRmSite = node.nodeType === 'rma:rmsite';

    if (isRmSite) {
      return (
        <IconArchive
          size={20}
          stroke={1.5}
          style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }}
        />
      );
    }

    if (isSite) {
      return (
        <IconWorld
          size={20}
          stroke={1.5}
          style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }}
        />
      );
    }

    if (node.isFolder) {
      return (
        <IconFolder
          size={20}
          stroke={1.5}
          style={{ color: 'var(--mantine-color-blue-6)', flexShrink: 0 }}
        />
      );
    }
    const FileIcon = getFileIconByMimeType(node.mimeType);
    return (
      <FileIcon
        size={20}
        stroke={1.5}
        style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}
      />
    );
  };

  const getDescription = (node: RepositoryNode) => {
    if (node.description && node.description.trim().length > 0) {
      return node.description;
    }
    return t('fileFolderBrowser:noDescription');
  };

  const getModifier = (node: RepositoryNode) => {
    return node.modifiedBy || t('fileFolderBrowser:unknownModifier');
  };

  const handleOpenNode = (node: RepositoryNode) => {
    if (node.isFolder) {
      openFolderTab({
        nodeId: node.id,
        nodeName: node.name,
        serverId,
      });
      navigate('file-folder-browser');
      return;
    }

    openNodeTab({
      nodeId: node.id,
      nodeName: node.name,
      serverId,
    });
    navigate('node-browser');
  };

  const handleRowKeyDown = (event: React.KeyboardEvent, node: RepositoryNode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenNode(node);
    }
  };

  const handleRowContextMenu = (event: React.MouseEvent, node: RepositoryNode) => {
    event.preventDefault();
    setSelectedItem(node);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setContextMenuOpened(true);
  };

  const handleOpenSelectionInNewTab = () => {
    if (!selectedItem || !selectedItem.isFolder) {
      return;
    }

    openFolderTab(
      {
        nodeId: selectedItem.id,
        nodeName: selectedItem.name,
        serverId,
      },
      { pinned: true }
    );
    navigate('file-folder-browser');
    setContextMenuOpened(false);
  };

  const handleOpenInNodeBrowser = () => {
    if (!selectedItem || !selectedItem.isFolder) {
      return;
    }

    openNodeTab(
      {
        nodeId: selectedItem.id,
        nodeName: selectedItem.name,
        serverId,
      },
      { pinned: true }
    );
    navigate('node-browser');
    setContextMenuOpened(false);
  };

  const handleRenameClick = () => {
    if (!selectedItem) return;
    setContextMenuOpened(false);

    const modalId = modals.open({
      title: t('submenu:renameAction'),
      children: (
        <RenameItemForm
          initialValue={selectedItem.name}
          confirmLabel={t('common:save')}
          cancelLabel={t('common:cancel')}
          onCancel={() => modals.close(modalId)}
          onSubmit={async newName => {
            try {
              await backendRpc.repository.renameNode(serverId, selectedItem.id, newName);
              notifications.show({
                title: t('common:success'),
                message: t('submenu:nodeRenamed'),
                color: 'green',
              });
              modals.close(modalId);
              setSelectedItem(null);
              loadChildren();
            } catch (error) {
              notifications.show({
                title: t('common:error'),
                message: error instanceof Error ? error.message : t('submenu:nodeRenameError'),
                color: 'red',
              });
            }
          }}
        />
      ),
    });
  };

  const handleDeleteClick = () => {
    if (!selectedItem) return;
    setContextMenuOpened(false);
    const item = selectedItem;

    const modalId = modals.open({
      title: t('submenu:deleteNode'),
      children: (
        <DeleteConfirmationContent
          message={
            <Text size="sm">
              {t('submenu:deleteNodeConfirm', {
                name: item.name,
              })}
            </Text>
          }
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          skipLabel={t('fileFolderBrowser:skipTrashLabel')}
          onCancel={() => modals.close(modalId)}
          onConfirm={async skipTrash => {
            modals.close(modalId);
            try {
              if (skipTrash) {
                await markNodesTemporary([item.id]);
              }
              await backendRpc.repository.deleteNode(serverId, item.id, skipTrash);
              notifications.show({
                title: t('common:success'),
                message: t('submenu:nodeDeleted'),
                color: 'green',
              });
              setSelectedItem(null);
              loadChildren();
            } catch (error) {
              notifications.show({
                title: t('common:error'),
                message: error instanceof Error ? error.message : t('submenu:nodeDeleteError'),
                color: 'red',
              });
            }
          }}
        />
      ),
      withCloseButton: false,
    });
  };

  const handleCreateSite = () => {
    if (!selectedItem || selectedItem.nodeType !== 'st:sites') return;
    setContextMenuOpened(false);

    const modalId = modals.open({
      title: t('submenu:createSiteTitle'),
      children: (
        <CreateSiteForm
          onCancel={() => modals.close(modalId)}
          onSubmit={async values => {
            try {
              await backendRpc.repository.createSite(serverId, {
                parentNodeId: selectedItem.id,
                id: values.siteId,
                title: values.title,
                description: values.description,
                visibility: values.visibility,
                skipAddToFavorites: values.skipAddToFavorites,
              });
              notifications.show({
                title: t('common:success'),
                message: t('submenu:createSiteSuccess', { name: values.title }),
                color: 'green',
              });
              modals.close(modalId);
              await loadChildren();
            } catch (error) {
              notifications.show({
                title: t('common:error'),
                message: error instanceof Error ? error.message : t('submenu:createSiteError'),
                color: 'red',
              });
            }
          }}
        />
      ),
      withCloseButton: false,
    });
  };

  const handleEditSite = useCallback(async () => {
    if (!selectedItem || selectedItem.nodeType !== 'st:site') return;
    setContextMenuOpened(false);
    const siteId = selectedItem.name;
    try {
      const { site } = await backendRpc.repository.getSite(serverId, siteId);
      const modalId = modals.open({
        title: t('submenu:editSiteTitle'),
        children: (
          <CreateSiteForm
            mode="edit"
            initialValues={{
              title: site?.title || siteId,
              siteId: site?.id || siteId,
              description: site?.description || '',
              visibility: (site?.visibility as any) || 'PUBLIC',
            }}
            onCancel={() => modals.close(modalId)}
            onSubmit={async values => {
              try {
                await backendRpc.repository.updateSite(serverId, siteId, {
                  title: values.title,
                  description: values.description,
                  visibility: values.visibility,
                });
                notifications.show({
                  title: t('common:success'),
                  message: t('submenu:editSiteSuccess', { name: values.title }),
                  color: 'green',
                });
                modals.close(modalId);
                await loadChildren();
              } catch (error) {
                notifications.show({
                  title: t('common:error'),
                  message: error instanceof Error ? error.message : t('submenu:editSiteError'),
                  color: 'red',
                });
              }
            }}
          />
        ),
        withCloseButton: false,
      });
    } catch (error) {
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('submenu:editSiteError'),
        color: 'red',
      });
    }
  }, [backendRpc.repository, loadChildren, modals, notifications, selectedItem, serverId, t]);

  const handleDeleteSite = useCallback(() => {
    if (!selectedItem || selectedItem.nodeType !== 'st:site') return;
    setContextMenuOpened(false);
    const siteId = selectedItem.name;
    const modalId = modals.open({
      title: t('submenu:deleteSite'),
      children: (
        <DeleteSiteModalContent
          message={<Text size="sm">{t('submenu:deleteSiteConfirm', { name: siteId })}</Text>}
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          permanentLabel={t('submenu:deleteSitePermanent')}
          permanentHint={t('submenu:deleteSitePermanentHint')}
          onCancel={() => modals.close(modalId)}
          onConfirm={async permanent => {
            modals.close(modalId);
            try {
              await backendRpc.repository.deleteSite(serverId, siteId, permanent);
              setSelectedItem(null);
              setSelectedNodeIds([]);
              notifications.show({
                title: t('common:success'),
                message: t('submenu:deleteSiteSuccess', { name: siteId }),
                color: 'green',
              });
              await loadChildren();
            } catch (error) {
              notifications.show({
                title: t('common:error'),
                message: error instanceof Error ? error.message : t('submenu:deleteSiteError'),
                color: 'red',
              });
            }
          }}
        />
      ),
      withCloseButton: false,
    });
  }, [backendRpc.repository, loadChildren, modals, notifications, selectedItem, serverId, t]);

  const isJavaScriptFile = (node: RepositoryNode): boolean => {
    // Check mimeType for JavaScript files
    if (node.mimeType) {
      const jsMimeTypes = [
        'application/javascript',
        'text/javascript',
        'application/x-javascript',
        'text/x-javascript',
        'application/ecmascript',
        'text/ecmascript',
      ];

      if (jsMimeTypes.includes(node.mimeType.toLowerCase())) {
        return true;
      }
    }

    // Fallback: check file extension
    const jsExtensions = ['.js', '.jsx', '.mjs', '.cjs'];
    const fileName = node.name.toLowerCase();
    return jsExtensions.some(ext => fileName.endsWith(ext));
  };

  const isTextFile = (node: RepositoryNode): boolean => {
    return isTextLikeFile(node.name, node.mimeType);
  };

  const handleOpenInJsConsole = async () => {
    if (!selectedItem) return;
    setContextMenuOpened(false);

    const isJsFile = isJavaScriptFile(selectedItem);

    if (isJsFile) {
      // For JavaScript files: load content into editor
      try {
        // Dynamically import rpc
        const { rpc } = await import('@/core/ipc/rpc');

        // Fetch the JavaScript file content
        const result = await rpc<{ content: string }>('backend.jsconsole.loadScriptFile', {
          serverId,
          nodeId: selectedItem.id,
        });

        // Load the script into the JS console editor
        setLoadedScript(selectedItem.name, selectedItem.id, result.content);

        // Navigate to JS console
        navigate('jsconsole');

        notifications.show({
          title: t('common:success'),
          message: t('fileFolderBrowser:jsConsoleLoadSuccess', {
            name: selectedItem.name,
          }),
          color: 'green',
        });
      } catch (error) {
        notifications.show({
          title: t('common:error'),
          message:
            error instanceof Error ? error.message : t('fileFolderBrowser:jsConsoleLoadError'),
          color: 'red',
        });
      }
    } else {
      // For non-JavaScript files: set as document context only (don't load content)
      const nodeRef = `workspace://SpacesStore/${selectedItem.id}`;
      setDocumentContext(nodeRef, selectedItem.name);

      // Navigate to JS console
      navigate('jsconsole');

      notifications.show({
        title: t('fileFolderBrowser:documentContextTitle'),
        message: t('fileFolderBrowser:documentContextMessage', {
          name: selectedItem.name,
        }),
        color: 'green',
      });
    }
  };

  const handleOpenInTextEditor = async () => {
    if (!selectedItem) return;
    setContextMenuOpened(false);
    try {
      const { rpc } = await import('@/core/ipc/rpc');
      const result = await rpc<{ content: string }>('backend.jsconsole.loadScriptFile', {
        serverId,
        nodeId: selectedItem.id,
      });
      loadRemoteTextFile({
        content: result.content,
        fileName: selectedItem.name,
        mimeType: selectedItem.mimeType,
        serverId,
        nodeId: selectedItem.id,
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
        message:
          error instanceof Error ? error.message : t('fileFolderBrowser:openInTextEditorError'),
        color: 'red',
      });
    }
  };

  const effectiveBreadcrumb = useMemo(() => {
    if (breadcrumb.length > 0) {
      return breadcrumb;
    }
    return [{ id: nodeId, name: nodeName }];
  }, [breadcrumb, nodeId, nodeName]);

  useEffect(() => {
    if (
      effectiveBreadcrumb.length === 0 ||
      !breadcrumbContainerRef.current ||
      !breadcrumbContentRef.current
    ) {
      setVisibleBreadcrumbStart(0);
      return;
    }

    const shrinkMargin = 16;
    const expandMargin = 96;

    const adjustVisibleItems = () => {
      if (
        !breadcrumbContainerRef.current ||
        !breadcrumbContentRef.current ||
        effectiveBreadcrumb.length === 0
      ) {
        return;
      }

      const containerWidth = breadcrumbContainerRef.current.offsetWidth;
      const contentWidth = breadcrumbContentRef.current.scrollWidth;
      const maxStart = Math.max(0, effectiveBreadcrumb.length - 1);
      const currentStart = visibleBreadcrumbStartRef.current;
      const availableSpace = containerWidth - contentWidth;

      if (availableSpace < -shrinkMargin && currentStart < maxStart) {
        setVisibleBreadcrumbStart(prev => Math.min(maxStart, prev + 1));
      } else if (availableSpace > expandMargin && currentStart > 0) {
        setVisibleBreadcrumbStart(prev => Math.max(0, prev - 1));
      }
    };

    adjustVisibleItems();
    const resizeObserver = new ResizeObserver(adjustVisibleItems);
    resizeObserver.observe(breadcrumbContainerRef.current);
    window.addEventListener('resize', adjustVisibleItems);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', adjustVisibleItems);
    };
  }, [effectiveBreadcrumb]);

  const visibleBreadcrumb = useMemo(() => {
    if (visibleBreadcrumbStart === 0) {
      return effectiveBreadcrumb;
    }
    return effectiveBreadcrumb.slice(visibleBreadcrumbStart);
  }, [effectiveBreadcrumb, visibleBreadcrumbStart]);

  const handleBreadcrumbClick = useCallback(
    (item: RepositoryBreadcrumbItem, index: number) => {
      if (index === effectiveBreadcrumb.length - 1) {
        return;
      }

      if (!item.id) {
        return;
      }

      openFolderTab({
        nodeId: item.id,
        nodeName: item.name,
        serverId,
      });
      navigate('file-folder-browser');
    },
    [effectiveBreadcrumb, navigate, openFolderTab, serverId]
  );

  const renderContent = () => {
    if (loading) {
      return (
        <Stack align="center" justify="center" style={{ flex: 1 }}>
          <Loader
            size="lg"
            style={{
              padding: '8px',
            }}
          />
          <Text c="dimmed">{t('common:loading')}</Text>
        </Stack>
      );
    }

    if (error) {
      return (
        <Stack align="center" justify="center" style={{ flex: 1 }}>
          <Text c="red">{error}</Text>
          <Button variant="light" onClick={loadChildren}>
            {t('common:retry')}
          </Button>
        </Stack>
      );
    }

    if (sortedChildren.length === 0) {
      return (
        <Stack
          align="center"
          justify="center"
          style={{
            flex: 1,
            height: '100%',
            textAlign: 'center',
            padding: 'var(--mantine-spacing-xl)',
          }}
          gap="sm"
        >
          <Dropzone.Accept>
            <IconUpload size={56} stroke={1.5} color="var(--mantine-color-blue-6)" />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX size={56} stroke={1.5} color="var(--mantine-color-red-6)" />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconPhoto size={56} stroke={1.5} color="var(--mantine-color-gray-5)" />
          </Dropzone.Idle>
          <Text size="lg" fw={600}>
            {t('fileFolderBrowser:dropzoneTitle')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('fileFolderBrowser:dropzoneSubtitle')}
          </Text>
          <Button variant="subtle" onClick={handleBrowseFiles}>
            {t('fileFolderBrowser:browseFiles')}
          </Button>
        </Stack>
      );
    }

    return (
      <ScrollArea style={{ flex: 1 }}>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 32 }}>
                <Checkbox
                  size="xs"
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onChange={event => handleSelectAllVisible(event.currentTarget.checked)}
                  aria-label={t('fileFolderBrowser:selectAll')}
                />
              </Table.Th>
              <Table.Th style={{ width: isCompact ? 'auto' : '30%' }}>
                {t('fileFolderBrowser:name')}
              </Table.Th>
              {!isCompact && (
                <Table.Th style={{ width: '35%' }}>{t('fileFolderBrowser:description')}</Table.Th>
              )}
              <Table.Th style={{ width: '20%' }}>{t('fileFolderBrowser:modified')}</Table.Th>
              <Table.Th style={{ width: '20%' }}>{t('fileFolderBrowser:modifiedBy')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedChildren.map(child => (
              <Table.Tr
                key={child.id}
                onClick={() => handleOpenNode(child)}
                onKeyDown={event => handleRowKeyDown(event, child)}
                tabIndex={0}
                onContextMenu={event => handleRowContextMenu(event, child)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td style={{ width: 32 }}>
                  <Checkbox
                    size="xs"
                    checked={selectedNodeIds.includes(child.id)}
                    onChange={event =>
                      handleRowCheckboxChange(child.id, event.currentTarget.checked)
                    }
                    onClick={event => event.stopPropagation()}
                    aria-label={t('fileFolderBrowser:selectItem', {
                      name: child.name,
                    })}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    {renderNodeIcon(child)}
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {child.name}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {child.nodeType}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                {!isCompact && (
                  <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {getDescription(child)}
                    </Text>
                  </Table.Td>
                )}
                <Table.Td>
                  <Text
                    size="sm"
                    title={
                      child.modifiedAt && !Number.isNaN(new Date(child.modifiedAt).getTime())
                        ? new Date(child.modifiedAt).toISOString()
                        : undefined
                    }
                  >
                    {formatRelativeDate(child.modifiedAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{getModifier(child)}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
            {paginationState.hasMore && (
              <LoadMoreRow
                isLoading={loadingMore}
                onLoadMore={handleLoadMore}
                idleLabel={t('fileFolderBrowser:loadMore')}
                loadingLabel={t('fileFolderBrowser:loadingMore')}
                colSpan={tableColumnCount}
              />
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
  };

  const breadcrumbItems = useMemo(() => {
    const items: ReactNode[] = [];

    if (visibleBreadcrumbStart > 0) {
      items.push(
        <Text key="ellipsis" size="sm" c="dimmed">
          ...
        </Text>
      );
    }

    visibleBreadcrumb.forEach((crumb, visibleIndex) => {
      const label = crumb.name || t('fileFolderBrowser:unknownFolder');
      const originalIndex = visibleBreadcrumbStart + visibleIndex;
      const isLast = originalIndex === effectiveBreadcrumb.length - 1;

      if (isLast) {
        items.push(
          <Text key={crumb.id || `${label}-${originalIndex}`} size="sm" fw={500} c="blue">
            {label}
          </Text>
        );
      } else {
        items.push(
          <Anchor
            key={crumb.id || `${label}-${originalIndex}`}
            size="sm"
            onClick={() => handleBreadcrumbClick(crumb, originalIndex)}
          >
            {label}
          </Anchor>
        );
      }
    });

    return items;
  }, [visibleBreadcrumb, visibleBreadcrumbStart, effectiveBreadcrumb, handleBreadcrumbClick, t]);

  return (
    <Stack gap="md" style={{ height: '100%', padding: 'var(--mantine-spacing-md)' }}>
      <Group justify="space-between" align="flex-start">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            ref={breadcrumbContainerRef}
            style={{
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
              paddingTop: 'calc(var(--mantine-spacing-xs) / 2)',
            }}
          >
            <div ref={breadcrumbContentRef} style={{ width: 'max-content' }}>
              <Breadcrumbs>{breadcrumbItems}</Breadcrumbs>
            </div>
          </div>
          <Title order={4} mt="xs">
            {nodeName}
          </Title>
          <Text size="sm" c="dimmed">
            {paginationState.totalItems !== undefined
              ? t('fileFolderBrowser:itemsCount', {
                  count: paginationState.totalItems,
                })
              : t('fileFolderBrowser:itemsCount', {
                  count: sortedChildren.length,
                })}
          </Text>
        </div>
        <Group gap="xs" align="center">
          {selectedNodeIds.length > 1 && (
            <Text size="sm" c="red">
              ({selectedNodeIds.length})
            </Text>
          )}
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={handleBulkDeleteClick}
            disabled={selectedNodeIds.length === 0 || bulkDeleting}
            loading={bulkDeleting}
            aria-label={t('fileFolderBrowser:deleteSelected', {
              count: selectedNodeIds.length,
            })}
          >
            <IconTrash size={18} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            onClick={loadChildren}
            loading={loading && !loadingMore}
            disabled={loading}
            aria-label={t('fileFolderBrowser:refreshList')}
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {deleteProgress && deleteProgress.total > 0 && (
        <>
          <Text size="sm" mb={4}>
            {t('fileFolderBrowser:deleteProgressLabel', {
              completed: deleteProgress.completed,
              total: deleteProgress.total,
            })}
          </Text>
          <Progress
            value={Math.min(100, (deleteProgress.completed / deleteProgress.total) * 100)}
            mt={-8}
            mb={4}
            color="red"
            radius="lg"
            striped
            animated
          />
        </>
      )}

      <Dropzone
        onDrop={handleDrop}
        onReject={handleDropRejected}
        getFilesFromEvent={dropzoneGetFilesFromEvent}
        loading={uploadingFiles}
        disabled={!server || uploadingFiles}
        multiple
        activateOnClick={false}
        openRef={dropzoneOpenRef}
        styles={{
          root: {
            flex: 1,
            border: 'none',
            padding: 0,
            background: 'transparent',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {uploadingFiles && uploadProgress && uploadProgress.total > 0 && (
          <div style={{ padding: 'var(--mantine-spacing-sm)' }}>
            <Text size="sm" mb={4}>
              {uploadProgress.completed}/{uploadProgress.total}
            </Text>
            <Progress
              value={Math.min(100, (uploadProgress.completed / uploadProgress.total) * 100)}
              radius="lg"
              striped
              animated
            />
          </div>
        )}
        <Paper
          withBorder
          radius="md"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {renderContent()}
        </Paper>
      </Dropzone>

      <Menu
        opened={contextMenuOpened}
        onChange={setContextMenuOpened}
        withinPortal
        shadow="md"
        width={200}
        position="bottom-start"
        offset={0}
        transitionProps={{ duration: 0 }}
      >
        <Menu.Target>
          <div
            style={{
              position: 'fixed',
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          {selectedItem && !selectedItem.isFolder && (
            <>
              {isTextFile(selectedItem) && (
                <Menu.Item
                  leftSection={<IconTextWrap size={14} />}
                  onClick={handleOpenInTextEditor}
                >
                  {t('submenu:textEditor')}
                </Menu.Item>
              )}
              <Menu.Item leftSection={<IconCode size={14} />} onClick={handleOpenInJsConsole}>
                {t('submenu:jsConsole')}
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {selectedItem?.isFolder && (
            <>
              <Menu.Item
                leftSection={<IconFileSearch size={14} />}
                onClick={handleOpenSelectionInNewTab}
              >
                {t('submenu:openInNewTab')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileSearch size={14} />}
                onClick={handleOpenInNodeBrowser}
              >
                {t('submenu:nodeBrowser')}
              </Menu.Item>
            </>
          )}
          {selectedItem?.nodeType === 'st:sites' && (
            <>
              <Menu.Divider />
              <Menu.Item leftSection={<IconWorldPlus size={14} />} onClick={handleCreateSite}>
                {t('submenu:createSiteAction')}
              </Menu.Item>
            </>
          )}
          {selectedItem?.nodeType === 'st:site' && (
            <>
              <Menu.Divider />
              <Menu.Item leftSection={<IconEdit size={14} />} onClick={handleEditSite}>
                {t('submenu:editSiteAction')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconWorldX size={14} />}
                color="red"
                onClick={handleDeleteSite}
              >
                {t('submenu:deleteSiteAction')}
              </Menu.Item>
            </>
          )}
          {selectedItem &&
            !['st:site', 'st:sites', 'rma:rmsite'].includes(selectedItem.nodeType) && (
              <>
                <Menu.Item
                  leftSection={<IconEdit size={14} />}
                  onClick={handleRenameClick}
                  disabled={!selectedItem}
                >
                  {t('submenu:renameAction')}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={handleDeleteClick}
                  disabled={!selectedItem}
                >
                  {t('submenu:deleteAction')}
                </Menu.Item>
              </>
            )}
          {selectedNodeIds.length > 1 && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={() => {
                  setContextMenuOpened(false);
                  handleBulkDeleteClick();
                }}
              >
                {t('fileFolderBrowser:deleteSelected', {
                  count: selectedNodeIds.length,
                })}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Stack>
  );
}

interface RenameItemFormProps {
  initialValue: string;
  confirmLabel: string;
  cancelLabel: string;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

function RenameItemForm({
  initialValue,
  confirmLabel,
  cancelLabel,
  onSubmit,
  onCancel,
}: RenameItemFormProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    if (!value.trim()) return;
    void onSubmit(value.trim());
  };

  return (
    <Stack gap="sm">
      <TextInput
        ref={inputRef}
        value={value}
        onChange={event => setValue(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            handleSubmit();
          } else if (event.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button onClick={handleSubmit} disabled={!value.trim()}>
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}

interface CreateFolderFormProps {
  defaultType: string;
  serverId: number;
  baseUrl: string;
  onSubmit: (name: string, nodeType: string) => Promise<void> | void;
  onCancel: () => void;
}

function CreateFolderForm({
  defaultType,
  serverId,
  baseUrl,
  onSubmit,
  onCancel,
}: CreateFolderFormProps) {
  const { t } = useTranslation(['fileFolderBrowser', 'common']);
  const [name, setName] = useState('');
  const [typeInput, setTypeInput] = useState(defaultType);
  const [typeOptions, setTypeOptions] = useState<string[]>([defaultType]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const cacheRef = useRef<Record<string, string[]>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input when the form mounts
  // Use a small delay to ensure the modal is fully rendered and Mantine's focus trap is initialized
  // This is especially important when the modal is opened from spotlight (cmd+k)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  const normalizePrefix = useCallback((value: string) => {
    const match = value.match(/^([a-z0-9_-]+:)/i);
    return match ? match[1].toLowerCase() : null;
  }, []);

  const typePrefix = useMemo(() => normalizePrefix(typeInput), [normalizePrefix, typeInput]);

  useEffect(() => {
    if (!typePrefix) {
      setTypeOptions([]);
      return;
    }
    if (cacheRef.current[typePrefix]) {
      setTypeOptions(cacheRef.current[typePrefix]);
      return;
    }
    let cancelled = false;
    setLoadingTypes(true);
    backendRpc.alfresco.search
      .classesByPrefix(serverId, baseUrl, typePrefix)
      .then(result => {
        if (cancelled) return;
        const containers = Array.from(new Set(result?.containers ?? [])).sort();
        cacheRef.current[typePrefix] = containers;
        setTypeOptions(containers);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load container types', error);
        setTypeOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTypes(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, serverId, typePrefix]);

  const hasOption = useCallback(
    (value: string) => {
      const normalized = value.trim().toLowerCase();
      return typeOptions.some(option => option.toLowerCase() === normalized);
    },
    [typeOptions]
  );
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const normalizedType = typeInput.trim();
  const nameIsValid = name.trim().length > 0;
  const typeIsValid = normalizedType.length > 0 && hasOption(normalizedType);
  const canSubmit = nameIsValid && typeIsValid;
  const filteredOptions = useMemo(() => {
    const query = normalizedType.toLowerCase();
    if (!query) {
      return typeOptions;
    }
    return typeOptions.filter(option => option.toLowerCase().includes(query));
  }, [normalizedType, typeOptions]);

  const handleTypeSelect = (value: string) => {
    setTypeInput(value);
    setTypeError(null);
    combobox.closeDropdown();
  };

  const displayTypeInput = typeIsValid ? '' : typeInput;

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    let hasErrors = false;
    if (!trimmedName) {
      setNameError(t('fileFolderBrowser:createFolderNameRequired'));
      hasErrors = true;
    } else {
      setNameError(null);
    }

    const trimmedInput = typeInput.trim();
    if (!trimmedInput || !hasOption(trimmedInput)) {
      setTypeError(t('fileFolderBrowser:createFolderTypeInvalid'));
      hasErrors = true;
    } else {
      setTypeError(null);
    }

    if (hasErrors) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(trimmedName, trimmedInput);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (!canSubmit || submitting) {
          return;
        }
        void handleSubmit();
      }}
    >
      <Stack gap="md">
        <TextInput
          ref={nameInputRef}
          value={name}
          label={t('fileFolderBrowser:createFolderNameLabel')}
          onChange={event => setName(event.currentTarget.value)}
          error={nameError}
          autoFocus
        />
        <div>
          <Text size="sm" fw={500}>
            {t('fileFolderBrowser:createFolderTypeLabel')}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {t('fileFolderBrowser:createFolderTypeHelper')}
          </Text>
          <Combobox store={combobox} withinPortal onOptionSubmit={handleTypeSelect}>
            <Combobox.DropdownTarget>
              <PillsInput onClick={() => combobox.openDropdown()} style={{ minHeight: 42 }}>
                <Pill.Group>
                  {typeIsValid && (
                    <Pill
                      radius="sm"
                      withRemoveButton
                      onRemove={() => {
                        setTypeInput('');
                        setTypeError(null);
                        combobox.openDropdown();
                      }}
                    >
                      {normalizedType}
                    </Pill>
                  )}
                  <Combobox.EventsTarget>
                    <PillsInput.Field
                      value={displayTypeInput}
                      placeholder={t('fileFolderBrowser:createFolderTypePlaceholder')}
                      onFocus={() => combobox.openDropdown()}
                      onChange={event => {
                        setTypeInput(event.currentTarget.value);
                        if (typeError) {
                          setTypeError(null);
                        }
                        if (!combobox.dropdownOpened) {
                          combobox.openDropdown();
                        }
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (filteredOptions.length > 0) {
                            handleTypeSelect(filteredOptions[0]);
                          }
                        }
                      }}
                    />
                  </Combobox.EventsTarget>
                </Pill.Group>
              </PillsInput>
            </Combobox.DropdownTarget>
            <Combobox.Dropdown>
              <Combobox.Options mah={200} style={{ overflowY: 'auto' }}>
                {loadingTypes && <Combobox.Empty>{t('common:loading')}</Combobox.Empty>}
                {!loadingTypes && filteredOptions.length === 0 && (
                  <Combobox.Empty>{t('fileFolderBrowser:createFolderNoTypes')}</Combobox.Empty>
                )}
                {!loadingTypes &&
                  filteredOptions.map(option => (
                    <Combobox.Option value={option} key={option}>
                      {option}
                    </Combobox.Option>
                  ))}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
          {typeError && (
            <Text size="xs" c="red" mt={4}>
              {typeError}
            </Text>
          )}
        </div>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={submitting}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" loading={submitting} disabled={!canSubmit || submitting}>
            {t('fileFolderBrowser:createFolderConfirm')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

interface DeleteConfirmationContentProps {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  skipLabel: string;
  onConfirm: (skipTrash: boolean) => void;
  onCancel: () => void;
}

function DeleteConfirmationContent({
  message,
  confirmLabel,
  cancelLabel,
  skipLabel,
  onConfirm,
  onCancel,
}: DeleteConfirmationContentProps) {
  const [skipTrash, setSkipTrash] = useState(false);

  return (
    <Stack gap="sm">
      {message}
      <Group gap={8} align="center">
        <Checkbox
          size="xs"
          aria-label={skipLabel}
          checked={skipTrash}
          onChange={event => setSkipTrash(event.currentTarget.checked)}
        />
        <Text size="sm" c="dimmed">
          {skipLabel}
        </Text>
      </Group>
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button color="red" onClick={() => onConfirm(skipTrash)}>
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}
