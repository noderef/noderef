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

import {
  backendRpc,
  type RepositoryNode,
  type RepositoryPaginationInfo,
  type SiteVisibility,
} from '@/core/ipc/backend';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useTextEditorStore } from '@/core/store/textEditor';
import { isTextLikeFile } from '@/features/text-editor/language';
import { useActiveServerId, useNavigation } from '@/hooks/useNavigation';
import { DeleteConfirmationForm } from '@/components/common/DeleteConfirmationForm';
import { markNodesTemporary } from '@/utils/markNodesTemporary';
import {
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  TextInput,
  Tree,
  UnstyledButton,
  Switch,
  useTree,
} from '@mantine/core';
import { useDisclosure, useIntersection } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconArchive,
  IconChevronRight,
  IconCode,
  IconDots,
  IconEdit,
  IconFileSearch,
  IconFolder,
  IconFolderOpen,
  IconTextWrap,
  IconTrash,
  IconWorld,
  IconWorldPlus,
  IconWorldX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getFileIconByMimeType } from './fileIconUtils';
import { CreateSiteForm } from './CreateSiteForm';
import { getAvailableActions, type NodeActionContext } from './nodeActionEvaluators';

interface RepositorySectionProps {
  label: string;
  icon?: React.ReactNode;
  initiallyOpened?: boolean;
  onOpenedChange?: (opened: boolean) => void;
}

// Convert RepositoryNode to Tree format
interface TreeNode {
  value: string;
  label: string;
  nodeType?: string;
  isFolder?: boolean;
  isFile?: boolean;
  mimeType?: string;
  path?: string;
  children?: TreeNode[];
  isLoadMorePlaceholder?: boolean;
  parentId?: string;
}

const MAX_ROOT_LOAD_ATTEMPTS = 3;
const NODE_CHILD_PAGE_SIZE = 50;
const ROOT_NODE_ID = '-root-';

interface NodePaginationState {
  hasMore: boolean;
  nextSkipCount: number;
  totalItems?: number;
}

type TreeElementProps = ComponentPropsWithoutRef<'div'> & { ref?: React.Ref<HTMLDivElement> };

const createLoadMoreNode = (parentId: string): TreeNode => ({
  value: `load-more-placeholder-${parentId}`,
  label: '__load_more__',
  isLoadMorePlaceholder: true,
  parentId,
});

const stripLoadMorePlaceholder = (children: TreeNode[] | undefined, parentId: string) => {
  if (!children) {
    return [];
  }
  return children.filter(child => !(child.isLoadMorePlaceholder && child.parentId === parentId));
};

const applyRootChildrenUpdate = (
  currentNodes: TreeNode[],
  newChildren: TreeNode[],
  options?: { append?: boolean; hasMore?: boolean }
) => {
  const baseNodes = options?.append ? stripLoadMorePlaceholder(currentNodes, ROOT_NODE_ID) : [];
  const mergedNodes = options?.append ? [...baseNodes, ...newChildren] : [...newChildren];
  if (options?.hasMore) {
    return [...mergedNodes, createLoadMoreNode(ROOT_NODE_ID)];
  }
  return mergedNodes;
};

const updateTreeNodeChildren = (
  nodes: TreeNode[],
  targetNodeId: string,
  newChildren: TreeNode[],
  options?: { append?: boolean; hasMore?: boolean }
): TreeNode[] => {
  return nodes.map(node => {
    if (node.value === targetNodeId) {
      const baseChildren = options?.append
        ? stripLoadMorePlaceholder(node.children, targetNodeId)
        : [];
      const mergedChildren = options?.append ? [...baseChildren, ...newChildren] : [...newChildren];
      const finalChildren = options?.hasMore
        ? [...mergedChildren, createLoadMoreNode(targetNodeId)]
        : mergedChildren;
      return { ...node, children: finalChildren };
    }
    if (node.children) {
      return {
        ...node,
        children: updateTreeNodeChildren(node.children, targetNodeId, newChildren, options),
      };
    }
    return node;
  });
};

const findTreeNodeChildren = (nodes: TreeNode[], targetNodeId: string): TreeNode[] | null => {
  for (const node of nodes) {
    if (node.value === targetNodeId) {
      return node.children ?? null;
    }
    if (node.children) {
      const result = findTreeNodeChildren(node.children, targetNodeId);
      if (result) {
        return result;
      }
    }
  }
  return null;
};

interface LoadMoreTreeRowProps {
  elementProps: TreeElementProps;
  idleLabel: string;
  isLoading: boolean;
  loadingLabel: string;
  onLoadMore: () => void;
}

const LoadMoreTreeRow = ({
  elementProps,
  idleLabel,
  isLoading,
  loadingLabel,
  onLoadMore,
}: LoadMoreTreeRowProps) => {
  const { ref, onClick, onMouseEnter, onMouseLeave, style, ...restElementProps } = elementProps;
  const { ref: observerRef, entry } = useIntersection({ threshold: 0.25 });
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

  const assignRef = (node: HTMLDivElement | null) => {
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref && typeof ref === 'object') {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
    observerRef(node);
  };

  const handleManualLoad = () => {
    if (!isLoading) {
      setCanAutoLoad(false);
      onLoadMore();
    }
  };

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    onMouseEnter?.(event);
    event.currentTarget.style.backgroundColor = 'var(--submenu-item-hover-bg)';
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    onMouseLeave?.(event);
    event.currentTarget.style.backgroundColor = 'transparent';
  };

  return (
    <Group
      {...restElementProps}
      ref={assignRef}
      gap={8}
      wrap="nowrap"
      onClick={event => {
        onClick?.(event);
        handleManualLoad();
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        ...(style || {}),
        paddingTop: '6px',
        paddingBottom: '6px',
        borderRadius: 'var(--mantine-radius-sm)',
        cursor: isLoading ? 'default' : 'pointer',
        transition: 'background-color 150ms ease',
        color: 'var(--submenu-item-text-color)',
      }}
    >
      {isLoading ? <Loader size="sm" /> : <IconDots size={16} stroke={1.5} />}
      <Text size="sm" c="dimmed">
        {isLoading ? loadingLabel : idleLabel}
      </Text>
    </Group>
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

export function RepositorySection({
  label,
  icon,
  initiallyOpened = false,
  onOpenedChange,
}: RepositorySectionProps) {
  const { t } = useTranslation(['common', 'submenu', 'fileFolderBrowser']);
  const { navigate } = useNavigation();
  const [opened, { toggle }] = useDisclosure(initiallyOpened);
  const activeServerId = useActiveServerId();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootLoadAttempts, setRootLoadAttempts] = useState(0);
  const [loadedNodes, setLoadedNodes] = useState<Set<string>>(new Set());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [paginationState, setPaginationState] = useState<Record<string, NodePaginationState>>({});
  const [loadingMoreNodes, setLoadingMoreNodes] = useState<Set<string>>(new Set());
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [renamingNode, setRenamingNode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [headerHovered, setHeaderHovered] = useState(false);
  const openNodeTab = useNodeBrowserTabsStore(state => state.openTab);
  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);
  const setLoadedScript = useJsConsoleStore(state => state.setLoadedScript);
  const setDocumentContext = useJsConsoleStore(state => state.setDocumentContext);
  const loadRemoteTextFile = useTextEditorStore(state => state.loadRemoteFile);

  useEffect(() => {
    onOpenedChange?.(opened);
  }, [opened, onOpenedChange]);

  const tree = useTree({
    onNodeExpand: async nodeValue => {
      // Load children when a node is expanded (only fires for nodes with children)
      if (!loadedNodes.has(nodeValue)) {
        await loadNodeChildren(nodeValue);
      }
    },
  });

  // Reset tree when server changes
  useEffect(() => {
    setTreeData([]);
    setLoadedNodes(new Set());
    setError(null);
    setRootLoadAttempts(0);
    setPaginationState({});
    setLoadingMoreNodes(new Set());
  }, [activeServerId]);

  // Load root nodes when section opens or server changes
  useEffect(() => {
    if (
      opened &&
      activeServerId &&
      treeData.length === 0 &&
      !loading &&
      rootLoadAttempts < MAX_ROOT_LOAD_ATTEMPTS
    ) {
      loadRootNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, activeServerId, treeData.length, loading, rootLoadAttempts]);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingNode && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingNode]);

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setSelectedNode(node);
    setContextMenuOpened(true);
  };

  const handleRenameStart = () => {
    if (selectedNode) {
      setRenameValue(selectedNode.label);
      setRenamingNode(selectedNode.value);
      setContextMenuOpened(false);
    }
  };

  const isJavaScriptFile = (node: TreeNode): boolean => {
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
    const fileName = node.label.toLowerCase();
    return jsExtensions.some(ext => fileName.endsWith(ext));
  };

  const isTextFile = (node: TreeNode): boolean => {
    return isTextLikeFile(node.label, node.mimeType);
  };

  const handleOpenInJsConsole = async () => {
    if (!selectedNode || !activeServerId) return;
    setContextMenuOpened(false);

    const isJsFile = isJavaScriptFile(selectedNode);

    if (isJsFile) {
      // For JavaScript files: load content into editor
      try {
        const { rpc } = await import('@/core/ipc/rpc');
        const result = await rpc<{ content: string }>('backend.jsconsole.loadScriptFile', {
          serverId: activeServerId,
          nodeId: selectedNode.value,
        });
        setLoadedScript(selectedNode.label, selectedNode.value, result.content);
        navigate('jsconsole');
        notifications.show({
          title: 'Script Loaded',
          message: `${selectedNode.label} loaded successfully`,
          color: 'green',
        });
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: error instanceof Error ? error.message : 'Failed to load JavaScript file',
          color: 'red',
        });
      }
    } else {
      // For non-JavaScript files: set as document context only (don't load content)
      const nodeRef = `workspace://SpacesStore/${selectedNode.value}`;
      setDocumentContext(nodeRef, selectedNode.label);
      navigate('jsconsole');
      notifications.show({
        title: 'Document Set',
        message: `${selectedNode.label} set as document context`,
        color: 'green',
      });
    }
  };

  const handleOpenInNodeBrowser = () => {
    if (!selectedNode || !activeServerId) return;
    setContextMenuOpened(false);
    openNodeTab(
      {
        nodeId: selectedNode.value,
        nodeName: selectedNode.label,
        serverId: activeServerId,
      },
      { pinned: true }
    );
    navigate('node-browser');
  };

  const handleOpenInTextEditor = async () => {
    if (!selectedNode || !activeServerId) return;
    setContextMenuOpened(false);
    try {
      const { rpc } = await import('@/core/ipc/rpc');
      const result = await rpc<{ content: string }>('backend.jsconsole.loadScriptFile', {
        serverId: activeServerId,
        nodeId: selectedNode.value,
      });
      loadRemoteTextFile({
        content: result.content,
        fileName: selectedNode.label,
        mimeType: selectedNode.mimeType,
        serverId: activeServerId,
        nodeId: selectedNode.value,
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
  };

  const handleRenameSave = async () => {
    if (!selectedNode || !activeServerId || !renameValue.trim()) {
      setRenamingNode(null);
      return;
    }

    if (renameValue.trim() === selectedNode.label) {
      setRenamingNode(null);
      return;
    }

    try {
      await backendRpc.repository.renameNode(
        activeServerId,
        selectedNode.value,
        renameValue.trim()
      );

      // Update tree data
      setTreeData(prevData => updateNodeName(prevData, selectedNode.value, renameValue.trim()));

      notifications.show({
        title: t('common:success'),
        message: t('submenu:nodeRenamed'),
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('submenu:nodeRenameError'),
        color: 'red',
      });
    } finally {
      setRenamingNode(null);
    }
  };

  const handleRenameCancel = () => {
    setRenamingNode(null);
    setRenameValue('');
  };

  const handleRetryRepositoryLoad = () => {
    setRootLoadAttempts(0);
    setTreeData([]);
    setLoadedNodes(new Set());
    setPaginationState({});
    setLoadingMoreNodes(new Set());
    setError(null);
  };

  const handleCreateSite = () => {
    if (!selectedNode || selectedNode.nodeType !== 'st:sites' || !activeServerId) return;

    setContextMenuOpened(false);

    const modalId = modals.open({
      title: t('submenu:createSiteTitle'),
      children: (
        <CreateSiteForm
          onCancel={() => modals.close(modalId)}
          onSubmit={async values => {
            try {
              const response = await backendRpc.repository.createSite(activeServerId, {
                parentNodeId: selectedNode.value,
                id: values.siteId,
                title: values.title,
                description: values.description,
                visibility: values.visibility,
                skipAddToFavorites: values.skipAddToFavorites,
              });

              const createdNode = response.node ? convertNodesToTree([response.node])[0] : null;

              if (createdNode) {
                setTreeData(prevData => {
                  const existingChildren = findTreeNodeChildren(prevData, selectedNode.value) || [];
                  const hasMore = paginationState[selectedNode.value]?.hasMore ?? false;
                  const mergedChildren = [
                    ...stripLoadMorePlaceholder(existingChildren, selectedNode.value).filter(
                      child => child.value !== createdNode.value
                    ),
                    createdNode,
                  ].sort((a, b) =>
                    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
                  );
                  return updateTreeNodeChildren(prevData, selectedNode.value, mergedChildren, {
                    hasMore,
                  });
                });
                setLoadedNodes(prev => new Set(prev).add(selectedNode.value));
              } else {
                await loadNodeChildren(selectedNode.value, { forceReload: true });
              }

              notifications.show({
                title: t('common:success'),
                message: t('submenu:createSiteSuccess', { name: values.title }),
                color: 'green',
              });
              modals.close(modalId);
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

  const handleDelete = () => {
    if (!selectedNode || !activeServerId) return;

    setContextMenuOpened(false);

    const modalId = modals.open({
      title: t('submenu:deleteNode'),
      children: (
        <DeleteConfirmationForm
          message={
            <Text size="sm">
              {t('submenu:deleteNodeConfirm', {
                name: selectedNode.label,
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
                await markNodesTemporary(activeServerId, [selectedNode.value]);
              }
              await backendRpc.repository.deleteNode(activeServerId, selectedNode.value, skipTrash);

              setTreeData(prevData => removeNodeFromTree(prevData, selectedNode.value));

              notifications.show({
                title: t('common:success'),
                message: t('submenu:nodeDeleted'),
                color: 'green',
              });
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

  const handleEditSite = async () => {
    if (!selectedNode || selectedNode.nodeType !== 'st:site' || !activeServerId) return;
    setContextMenuOpened(false);
    const siteId = selectedNode.label;

    try {
      const { site } = await backendRpc.repository.getSite(activeServerId, siteId);
      const initialTitle = site?.title || siteId;
      const modalId = modals.open({
        title: t('submenu:editSiteTitle'),
        children: (
          <CreateSiteForm
            mode="edit"
            initialValues={{
              title: initialTitle,
              siteId: site?.id || siteId,
              description: site?.description || '',
              visibility: (site?.visibility as SiteVisibility) || 'PUBLIC',
            }}
            onCancel={() => modals.close(modalId)}
            onSubmit={async values => {
              try {
                await backendRpc.repository.updateSite(activeServerId, siteId, {
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
                await loadNodeChildren(selectedNode.value, { forceReload: true });
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
  };

  const handleDeleteSite = () => {
    if (!selectedNode || selectedNode.nodeType !== 'st:site' || !activeServerId) return;

    setContextMenuOpened(false);
    const siteId = selectedNode.label;
    const confirmMessage = (
      <Text size="sm">
        {t('submenu:deleteSiteConfirm', {
          name: siteId,
        })}
      </Text>
    );

    const modalId = modals.open({
      title: t('submenu:deleteSite'),
      children: (
        <DeleteSiteModalContent
          message={confirmMessage}
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          permanentLabel={t('submenu:deleteSitePermanent')}
          permanentHint={t('submenu:deleteSitePermanentHint')}
          onCancel={() => modals.close(modalId)}
          onConfirm={async permanent => {
            modals.close(modalId);
            try {
              await backendRpc.repository.deleteSite(activeServerId, siteId, permanent);
              setTreeData(prevData => removeNodeFromTree(prevData, selectedNode.value));
              notifications.show({
                title: t('common:success'),
                message: t('submenu:deleteSiteSuccess', { name: siteId }),
                color: 'green',
              });
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
  };

  const updateNodeName = (nodes: TreeNode[], nodeId: string, newName: string): TreeNode[] => {
    return nodes.map(node => {
      if (node.value === nodeId) {
        return { ...node, label: newName };
      }
      if (node.children) {
        return { ...node, children: updateNodeName(node.children, nodeId, newName) };
      }
      return node;
    });
  };

  const removeNodeFromTree = (nodes: TreeNode[], nodeId: string): TreeNode[] => {
    return nodes
      .filter(node => node.value !== nodeId)
      .map(node => {
        if (node.children) {
          return { ...node, children: removeNodeFromTree(node.children, nodeId) };
        }
        return node;
      });
  };

  const loadRootNodes = async () => {
    if (!activeServerId) return;

    setLoading(true);
    setError(null);
    const attemptNumber = rootLoadAttempts + 1;
    setRootLoadAttempts(attemptNumber);

    try {
      const result = await backendRpc.repository.getNodeChildren(activeServerId, undefined, {
        maxItems: NODE_CHILD_PAGE_SIZE,
      });
      const nodes = convertNodesToTree(result.nodes);
      const hasMoreChildren = (result.pagination?.hasMoreItems ?? false) && nodes.length > 0;
      updatePaginationState(ROOT_NODE_ID, result.pagination, nodes.length);
      setTreeData(prevData =>
        applyRootChildrenUpdate(prevData, nodes, {
          append: false,
          hasMore: hasMoreChildren,
        })
      );
      setLoadedNodes(new Set([ROOT_NODE_ID]));
    } catch (err) {
      console.error('Failed to load root nodes:', err);
      if (attemptNumber >= MAX_ROOT_LOAD_ATTEMPTS) {
        const baseMessage = err instanceof Error ? err.message : t('submenu:loadError');
        setError(
          t('submenu:loadErrorMaxAttempts', {
            count: MAX_ROOT_LOAD_ATTEMPTS,
            error: baseMessage,
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const convertNodesToTree = useCallback((nodes: RepositoryNode[]): TreeNode[] => {
    return nodes.map(node => ({
      value: node.id,
      label: node.name,
      nodeType: node.nodeType,
      isFolder: node.isFolder,
      isFile: node.isFile,
      mimeType: node.mimeType,
      path: node.path,
      children: node.isFolder ? [] : undefined, // Empty array for folders to show expand icon
    }));
  }, []);

  const updatePaginationState = useCallback(
    (targetId: string, pagination: RepositoryPaginationInfo | undefined, loadedCount: number) => {
      setPaginationState(prev => {
        const next = { ...prev };
        const count = pagination?.count ?? loadedCount;

        if (pagination?.hasMoreItems && count > 0) {
          next[targetId] = {
            hasMore: true,
            nextSkipCount: (pagination.skipCount ?? 0) + count,
            totalItems: pagination.totalItems,
          };
        } else {
          delete next[targetId];
        }

        return next;
      });
    },
    []
  );

  const loadNodeChildren = async (
    nodeId: string,
    options?: { forceReload?: boolean }
  ): Promise<TreeNode[]> => {
    if (!activeServerId) return [];

    // If already loaded, return empty (tree already has the data)
    if (!options?.forceReload && loadedNodes.has(nodeId)) {
      return [];
    }

    if (options?.forceReload) {
      setPaginationState(prev => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    }

    // Mark node as loading
    setLoadingNodes(prev => new Set(prev).add(nodeId));

    try {
      const result = await backendRpc.repository.getNodeChildren(activeServerId, nodeId, {
        maxItems: NODE_CHILD_PAGE_SIZE,
      });
      const childNodes = convertNodesToTree(result.nodes);

      // Update tree data by finding and replacing the node's children
      const hasMoreChildren = (result.pagination?.hasMoreItems ?? false) && childNodes.length > 0;

      setTreeData(prevData =>
        updateTreeNodeChildren(prevData, nodeId, childNodes, {
          append: false,
          hasMore: hasMoreChildren,
        })
      );
      updatePaginationState(nodeId, result.pagination, childNodes.length);
      setLoadedNodes(prev => new Set(prev).add(nodeId));

      return childNodes;
    } catch (err) {
      console.error(`Failed to load children for node ${nodeId}:`, err);
      return [];
    } finally {
      // Remove from loading
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const handleLoadMore = useCallback(
    async (targetNodeId: string) => {
      if (!activeServerId) {
        return;
      }

      const paginationInfo = paginationState[targetNodeId];
      if (!paginationInfo || !paginationInfo.hasMore) {
        return;
      }

      if (loadingMoreNodes.has(targetNodeId)) {
        return;
      }

      setLoadingMoreNodes(prev => new Set(prev).add(targetNodeId));

      try {
        const result = await backendRpc.repository.getNodeChildren(
          activeServerId,
          targetNodeId === ROOT_NODE_ID ? undefined : targetNodeId,
          {
            skipCount: paginationInfo.nextSkipCount,
            maxItems: NODE_CHILD_PAGE_SIZE,
          }
        );
        const childNodes = convertNodesToTree(result.nodes);

        const hasMoreChildren = (result.pagination?.hasMoreItems ?? false) && childNodes.length > 0;

        if (targetNodeId === ROOT_NODE_ID) {
          setTreeData(prevData =>
            applyRootChildrenUpdate(prevData, childNodes, {
              append: true,
              hasMore: hasMoreChildren,
            })
          );
        } else {
          setTreeData(prevData =>
            updateTreeNodeChildren(prevData, targetNodeId, childNodes, {
              append: true,
              hasMore: hasMoreChildren,
            })
          );
        }

        updatePaginationState(targetNodeId, result.pagination, childNodes.length);
      } catch (err) {
        console.error(`Failed to load more children for node ${targetNodeId}:`, err);
      } finally {
        setLoadingMoreNodes(prev => {
          const next = new Set(prev);
          next.delete(targetNodeId);
          return next;
        });
      }
    },
    [activeServerId, convertNodesToTree, loadingMoreNodes, paginationState, updatePaginationState]
  );

  const renderTreeIcon = (node: TreeNode, expanded: boolean) => {
    // Check if it's a folder based on isFolder property
    const isFolder = node.isFolder === true;
    const isFile = node.isFile === true;
    const isSite = node.nodeType === 'st:site' || node.nodeType === 'st:sites';
    const isRmSite = node.nodeType === 'rma:rmsite';
    const isLoading = loadingNodes.has(node.value);

    // Show loading indicator if node is currently loading children
    if (isLoading && isFolder) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <Loader size={16} />
        </div>
      );
    }

    // If it's a records management site, show archive icon
    if (isRmSite) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <IconArchive size={20} stroke={1.5} />
        </div>
      );
    }

    // If it's a site, show world icon
    if (isSite) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <IconWorld size={20} stroke={1.5} />
        </div>
      );
    }

    // If it's explicitly a folder, show folder icon (open/closed based on expanded state)
    if (isFolder) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          {expanded ? (
            <IconFolderOpen size={20} stroke={1.5} />
          ) : (
            <IconFolder size={20} stroke={1.5} />
          )}
        </div>
      );
    }

    // If it's a file, determine icon based on mimetype
    if (isFile) {
      const FileIcon = getFileIconByMimeType(node.mimeType);
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          <FileIcon size={20} stroke={1.5} />
        </div>
      );
    }

    // Fallback: if has children, treat as folder, otherwise as file
    if (node.children && node.children.length > 0) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          {expanded ? (
            <IconFolderOpen size={20} stroke={1.5} />
          ) : (
            <IconFolder size={20} stroke={1.5} />
          )}
        </div>
      );
    }

    // Default file icon
    const DefaultFileIcon = getFileIconByMimeType();
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        <DefaultFileIcon size={20} stroke={1.5} />
      </div>
    );
  };

  return (
    <Box>
      {/* Section Header */}
      <UnstyledButton
        onClick={toggle}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          width: '100%',
          padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
          borderRadius: 'var(--mantine-radius-sm)',
          cursor: 'pointer',
          transition: 'background-color 150ms ease',
          backgroundColor: headerHovered ? 'var(--submenu-section-hover-bg)' : 'transparent',
          border: 'none',
        }}
      >
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
            {icon && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  color: 'var(--submenu-section-icon-color)',
                }}
              >
                {icon}
              </div>
            )}
            <Text
              fw={500}
              size="sm"
              style={{ flex: 1, color: 'var(--submenu-section-text-color)' }}
            >
              {label}
            </Text>
          </Group>
          <IconChevronRight
            size={16}
            style={{
              transform: opened ? 'rotate(90deg)' : undefined,
              transition: 'transform 200ms ease',
              color: 'var(--submenu-section-chevron-color)',
              flexShrink: 0,
            }}
          />
        </Group>
      </UnstyledButton>

      {/* Tree Content */}
      <Collapse in={opened}>
        <Box
          style={{
            position: 'relative',
            paddingLeft: 'var(--mantine-spacing-xs)',
            marginLeft: 'calc(var(--mantine-spacing-sm) + 10px)',
          }}
        >
          {/* Vertical line - aligned with parent icon */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: 'var(--submenu-section-border-color)',
            }}
          />
          <Box pl="md">
            {loading && treeData.length === 0 ? (
              <Group gap="xs" p="sm">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  {t('submenu:loading')}
                </Text>
              </Group>
            ) : error ? (
              <Stack gap={6} p="sm">
                <Text size="sm" c="red">
                  {error}
                </Text>
                <Button
                  variant="light"
                  size="xs"
                  onClick={handleRetryRepositoryLoad}
                  disabled={loading}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {t('common:retry')}
                </Button>
              </Stack>
            ) : treeData.length === 0 ? (
              <Text size="sm" c="dimmed" p="sm">
                {t('submenu:noItems')}
              </Text>
            ) : (
              <>
                <Tree
                  data={treeData}
                  tree={tree}
                  levelOffset={20}
                  renderNode={({ node, expanded, elementProps, hasChildren }) => {
                    const treeNode = node as unknown as TreeNode;
                    const isRenaming = renamingNode === treeNode.value;

                    if (treeNode.isLoadMorePlaceholder) {
                      const parentId = treeNode.parentId || ROOT_NODE_ID;
                      return (
                        <LoadMoreTreeRow
                          elementProps={elementProps}
                          idleLabel={t('submenu:loadMoreHint')}
                          isLoading={loadingMoreNodes.has(parentId)}
                          loadingLabel={t('submenu:loadingMore')}
                          onLoadMore={() => handleLoadMore(parentId)}
                        />
                      );
                    }

                    // Get available actions for this node
                    const context: NodeActionContext = {
                      nodeId: treeNode.value,
                      nodeName: treeNode.label,
                      nodeType: treeNode.nodeType || '',
                      isFolder: treeNode.isFolder || false,
                      isFile: treeNode.isFile || false,
                      path: treeNode.path,
                    };
                    const actions = getAvailableActions(context);
                    const canOpenContextMenu =
                      actions.length > 0 ||
                      treeNode.nodeType === 'st:sites' ||
                      treeNode.nodeType === 'st:site';

                    if (isRenaming) {
                      return (
                        <Group
                          gap={8}
                          wrap="nowrap"
                          style={{ paddingTop: '6px', paddingBottom: '6px' }}
                        >
                          {renderTreeIcon(treeNode, expanded)}
                          <TextInput
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleRenameSave();
                              } else if (e.key === 'Escape') {
                                handleRenameCancel();
                              }
                            }}
                            onBlur={handleRenameSave}
                            size="xs"
                            styles={{
                              input: {
                                minHeight: 'unset',
                                height: '24px',
                                fontSize: 'var(--mantine-font-size-sm)',
                              },
                            }}
                            style={{ flex: 1 }}
                          />
                        </Group>
                      );
                    }

                    const handleNodeClick = (e: React.MouseEvent) => {
                      if (elementProps.onClick) {
                        elementProps.onClick(e);
                      }

                      if (!activeServerId) {
                        return;
                      }

                      const isFolderNode = treeNode.isFolder ?? hasChildren;

                      if (isFolderNode) {
                        openFolderTab({
                          nodeId: treeNode.value,
                          nodeName: treeNode.label,
                          serverId: activeServerId,
                        });
                        navigate('file-folder-browser');
                        return;
                      }

                      openNodeTab({
                        nodeId: treeNode.value,
                        nodeName: treeNode.label,
                        serverId: activeServerId,
                      });
                      navigate('node-browser');
                    };

                    const handleNodeMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
                      // elementProps.onMouseEnter?.(event);
                      event.currentTarget.style.backgroundColor = 'var(--submenu-item-hover-bg)';
                    };

                    const handleNodeMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
                      // elementProps.onMouseLeave?.(event);
                      event.currentTarget.style.backgroundColor = 'transparent';
                    };

                    return (
                      <Group
                        gap={8}
                        {...elementProps}
                        wrap="nowrap"
                        onContextMenu={e =>
                          canOpenContextMenu ? handleContextMenu(e, treeNode) : undefined
                        }
                        onClick={handleNodeClick}
                        style={{
                          ...elementProps.style,
                          paddingTop: '6px',
                          paddingBottom: '6px',
                          borderRadius: 'var(--mantine-radius-sm)',
                          cursor: 'pointer',
                          transition: 'background-color 150ms ease',
                          color: 'var(--submenu-item-text-color)',
                        }}
                        onMouseEnter={handleNodeMouseEnter}
                        onMouseLeave={handleNodeMouseLeave}
                      >
                        {renderTreeIcon(treeNode, expanded)}
                        <Text
                          size="sm"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {node.label}
                        </Text>
                      </Group>
                    );
                  }}
                />
                {/* Context Menu */}
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
                    {selectedNode &&
                      (() => {
                        const isSitesRoot = selectedNode.nodeType === 'st:sites';
                        const isSiteNode = selectedNode.nodeType === 'st:site';
                        const sections: React.ReactNode[][] = [];

                        if (!selectedNode.isFolder && !isSitesRoot && !isSiteNode) {
                          const fileSection: React.ReactNode[] = [];
                          if (isTextFile(selectedNode)) {
                            fileSection.push(
                              <Menu.Item
                                key="open-text"
                                leftSection={<IconTextWrap size={14} />}
                                onClick={handleOpenInTextEditor}
                              >
                                {t('submenu:textEditor')}
                              </Menu.Item>
                            );
                          }
                          fileSection.push(
                            <Menu.Item
                              key="open-js"
                              leftSection={<IconCode size={14} />}
                              onClick={handleOpenInJsConsole}
                            >
                              {t('submenu:jsConsole')}
                            </Menu.Item>
                          );
                          fileSection.push(
                            <Menu.Item
                              key="open-node-browser"
                              leftSection={<IconFileSearch size={14} />}
                              onClick={handleOpenInNodeBrowser}
                            >
                              {t('submenu:nodeBrowser')}
                            </Menu.Item>
                          );
                          sections.push(fileSection);
                        }

                        if (selectedNode.isFolder && !isSitesRoot && !isSiteNode) {
                          sections.push([
                            <Menu.Item
                              key="folder-node-browser"
                              leftSection={<IconFileSearch size={14} />}
                              onClick={handleOpenInNodeBrowser}
                            >
                              {t('submenu:nodeBrowser')}
                            </Menu.Item>,
                            <Menu.Item
                              key="folder-js"
                              leftSection={<IconCode size={14} />}
                              onClick={handleOpenInJsConsole}
                            >
                              {t('submenu:jsConsole')}
                            </Menu.Item>,
                          ]);
                        }

                        if (isSitesRoot) {
                          sections.push([
                            <Menu.Item
                              key="create-site"
                              leftSection={<IconWorldPlus size={14} />}
                              onClick={handleCreateSite}
                            >
                              {t('submenu:createSiteAction')}
                            </Menu.Item>,
                          ]);
                        }

                        if (isSiteNode) {
                          sections.push([
                            <Menu.Item
                              key="edit-site"
                              leftSection={<IconEdit size={14} />}
                              onClick={handleEditSite}
                            >
                              {t('submenu:editSiteAction')}
                            </Menu.Item>,
                            <Menu.Item
                              key="delete-site"
                              leftSection={<IconWorldX size={14} />}
                              color="red"
                              onClick={handleDeleteSite}
                            >
                              {t('submenu:deleteSiteAction')}
                            </Menu.Item>,
                          ]);
                        }

                        const availableActions = getAvailableActions({
                          nodeId: selectedNode.value,
                          nodeName: selectedNode.label,
                          nodeType: selectedNode.nodeType || '',
                          isFolder: selectedNode.isFolder || false,
                          isFile: selectedNode.isFile || false,
                          path: selectedNode.path,
                          mimeType: selectedNode.mimeType,
                        });

                        const otherActions = availableActions.filter(
                          action =>
                            action.id !== 'openInJsConsole' && action.id !== 'openInTextEditor'
                        );

                        if (otherActions.length > 0) {
                          sections.push(
                            otherActions.map(action => {
                              const getIcon = () => {
                                switch (action.id) {
                                  case 'rename':
                                    return <IconEdit size={14} />;
                                  case 'delete':
                                    return <IconTrash size={14} />;
                                  default:
                                    return null;
                                }
                              };

                              const getHandler = () => {
                                switch (action.id) {
                                  case 'rename':
                                    return handleRenameStart;
                                  case 'delete':
                                    return handleDelete;
                                  default:
                                    return () => {};
                                }
                              };

                              return (
                                <Menu.Item
                                  key={action.id}
                                  leftSection={getIcon()}
                                  color={action.id === 'delete' ? 'red' : undefined}
                                  onClick={getHandler()}
                                >
                                  {t(`submenu:${action.label}`)}
                                </Menu.Item>
                              );
                            })
                          );
                        }

                        const flattened = sections.flatMap((section, index) => {
                          const divider =
                            index > 0 ? [<Menu.Divider key={`divider-${index}`} />] : [];
                          return [...divider, ...section];
                        });

                        return <>{flattened}</>;
                      })()}
                  </Menu.Dropdown>
                </Menu>
              </>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
