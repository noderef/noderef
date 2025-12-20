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

import { DeleteConfirmationForm } from '@/components/common/DeleteConfirmationForm';
import { backendRpc } from '@/core/ipc/backend';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useNodeBrowserTabsStore } from '@/core/store/nodeBrowserTabs';
import { useServersStore } from '@/core/store/servers';
import { useTextEditorStore } from '@/core/store/textEditor';
import { useUIStore } from '@/core/store/ui';
import { isTextLikeFile } from '@/features/text-editor/language';
import { useActiveServerId, useNavigation } from '@/hooks/useNavigation';
import { isAuthenticationError } from '@/utils/errorDetection';
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
  useTree,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconArchive,
  IconChevronRight,
  IconCode,
  IconDownload,
  IconEdit,
  IconFileSearch,
  IconFolder,
  IconFolderCog,
  IconFolderOpen,
  IconKey,
  IconMap2,
  IconRefresh,
  IconSitemap,
  IconTextWrap,
  IconTrash,
  IconUser,
  IconUsers,
  IconUsersGroup,
  IconWorld,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFileIconByMimeType } from './fileIconUtils';
import { getAvailableActions, type NodeActionContext } from './nodeActionEvaluators';

// ... (lines 38-430 remain unchanged)

// ... (lines 452-501 remain unchanged)

interface SystemTreeSectionProps {
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
}

const MAX_ROOT_LOAD_ATTEMPTS = 3;

export function SystemTreeSection({
  label,
  icon,
  initiallyOpened = false,
  onOpenedChange,
}: SystemTreeSectionProps) {
  const { t } = useTranslation(['common', 'submenu', 'fileFolderBrowser']);
  const { navigate } = useNavigation();
  const [opened, { toggle }] = useDisclosure(initiallyOpened);
  const activeServerId = useActiveServerId();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [rootLoadAttempts, setRootLoadAttempts] = useState(0);
  const [loadedNodes, setLoadedNodes] = useState<Set<string>>(new Set());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [renamingNode, setRenamingNode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const loadChildrenPromisesRef = useRef<Map<string, Promise<TreeNode[]>>>(new Map());
  const [headerHovered, setHeaderHovered] = useState(false);
  const { openTab: openNodeTab } = useNodeBrowserTabsStore();
  const setLoadedScript = useJsConsoleStore(state => state.setLoadedScript);
  const setDocumentContext = useJsConsoleStore(state => state.setDocumentContext);
  const loadRemoteTextFile = useTextEditorStore(state => state.loadRemoteFile);
  const activeServer = useServersStore(state =>
    activeServerId ? (state.servers.find(s => s.id === activeServerId) ?? null) : null
  );

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
    setIsAuthError(false);
    setRootLoadAttempts(0);
    setLoadingNodes(new Set());
    loadChildrenPromisesRef.current.clear();
  }, [activeServerId]);

  // Listen for re-authentication success and reload tree
  useEffect(() => {
    const handleReauthSuccess = (event: CustomEvent<{ serverId: number }>) => {
      if (event.detail.serverId === activeServerId && opened) {
        // Reset state and reload
        setTreeData([]);
        setLoadedNodes(new Set());
        setError(null);
        setIsAuthError(false);
        setRootLoadAttempts(0);
        setLoadingNodes(new Set());
        loadChildrenPromisesRef.current.clear();
        // Trigger reload will happen automatically via the useEffect that watches these states
      }
    };

    window.addEventListener('reauth-success', handleReauthSuccess as EventListener);
    return () => {
      window.removeEventListener('reauth-success', handleReauthSuccess as EventListener);
    };
  }, [activeServerId, opened]);

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
    setError(null);
    setIsAuthError(false);
  };

  const handleReauthenticate = () => {
    if (!activeServer || activeServer.authType !== 'openid_connect') return;
    const { openModal } = useUIStore.getState();
    openModal('reauth', { serverId: activeServerId, serverName: activeServer.name });
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
      const result = await backendRpc.repository.getSystemTreeRoot(activeServerId);
      const nodes = convertSlingshotChildrenToTree(result.children);
      setTreeData(nodes);
      setLoadedNodes(new Set([result.systemNodeId]));
    } catch (err) {
      console.error('Failed to load system tree:', err);
      // Check if this is an authentication error
      setIsAuthError(isAuthenticationError(err));

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

  const convertSlingshotChildrenToTree = (children: any[]): TreeNode[] => {
    if (!children) return [];

    return children.map((child: any) => {
      // Extract UUID from nodeRef "workspace://SpacesStore/UUID"
      const nodeRef = child.nodeRef;
      const uuid = nodeRef.split('/').pop() || '';
      const nodeType = child.type?.prefixedName || child.type?.name;
      const isPerson = nodeType === 'cm:person';

      return {
        value: uuid,
        label: child.name?.prefixedName || child.name?.name || 'Unknown',
        nodeType: nodeType,
        isFolder: !isPerson, // cm:person is not a folder
        isFile: false,
        mimeType: undefined,
        path: undefined, // Slingshot children response doesn't provide full path
        children: isPerson ? undefined : [], // Only folders have children array
      };
    });
  };

  const loadNodeChildren = async (nodeId: string): Promise<TreeNode[]> => {
    if (!activeServerId) return [];

    if (loadedNodes.has(nodeId)) {
      return [];
    }

    const existingPromise = loadChildrenPromisesRef.current.get(nodeId);
    if (existingPromise) {
      return existingPromise;
    }

    const loadPromise = (async () => {
      setLoadingNodes(prev => new Set(prev).add(nodeId));

      try {
        const result = await backendRpc.repository.getSlingshotChildren(activeServerId, nodeId);
        const childNodes = convertSlingshotChildrenToTree(result.children);

        setTreeData(prevData => updateTreeNodeChildren(prevData, nodeId, childNodes));
        setLoadedNodes(prev => new Set(prev).add(nodeId));

        return childNodes;
      } catch (err) {
        console.error(`Failed to load children for node ${nodeId}:`, err);
        return [];
      } finally {
        setLoadingNodes(prev => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
        loadChildrenPromisesRef.current.delete(nodeId);
      }
    })();

    loadChildrenPromisesRef.current.set(nodeId, loadPromise);
    return loadPromise;
  };

  const updateTreeNodeChildren = (
    nodes: TreeNode[],
    targetNodeId: string,
    children: TreeNode[]
  ): TreeNode[] => {
    return nodes.map(node => {
      if (node.value === targetNodeId) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeNodeChildren(node.children, targetNodeId, children) };
      }
      return node;
    });
  };

  const renderTreeIcon = (node: TreeNode, expanded: boolean) => {
    // Check if it's a folder based on isFolder property
    const isFolder = node.isFolder === true;
    const isFile = node.isFile === true;
    const isSite = node.nodeType === 'st:site' || node.nodeType === 'st:sites';
    const isRmSite = node.nodeType === 'rma:rmsite';
    const isPeople = node.label === 'sys:people';
    const isAuthorities = node.label === 'sys:authorities';
    const isWorkflow = node.label === 'sys:workflow';
    const isZones = node.label === 'sys:zones';
    const isRemoteCredentials = node.label === 'sys:remote_credentials';
    const isSyncsetDefinitions = node.label === 'sys:syncset_definitions';
    const isDownloads = node.label === 'sys:downloads';
    const isPerson = node.nodeType === 'cm:person';
    const isAuthorityContainer = node.nodeType === 'cm:authorityContainer';
    const isSystemFolder = node.nodeType === 'cm:systemfolder';
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

    // If it's a system folder, show folder-cog icon
    if (isSystemFolder) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <IconFolderCog size={20} stroke={1.5} />
        </div>
      );
    }

    // If it's the people container, show users icon
    if (isPeople) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <IconUsers size={20} stroke={1.5} />
        </div>
      );
    }

    // If it's the authorities container or an authority container type, show users group icon
    if (isAuthorities || isAuthorityContainer) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <IconUsersGroup size={20} stroke={1.5} />
        </div>
      );
    }

    // If it's a person, show user icon
    if (isPerson) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-blue-6)',
          }}
        >
          <IconUser size={20} stroke={1.5} />
        </div>
      );
    }

    // System root icons
    if (isWorkflow) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-blue-6)' }}
        >
          <IconSitemap size={20} stroke={1.5} />
        </div>
      );
    }
    if (isZones) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-blue-6)' }}
        >
          <IconMap2 size={20} stroke={1.5} />
        </div>
      );
    }
    if (isRemoteCredentials) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-blue-6)' }}
        >
          <IconKey size={20} stroke={1.5} />
        </div>
      );
    }
    if (isSyncsetDefinitions) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-blue-6)' }}
        >
          <IconRefresh size={20} stroke={1.5} />
        </div>
      );
    }
    if (isDownloads) {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-blue-6)' }}
        >
          <IconDownload size={20} stroke={1.5} />
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
                <Group gap="xs">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={handleRetryRepositoryLoad}
                    disabled={loading}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {t('common:retry')}
                  </Button>
                  {isAuthError && activeServer?.authType === 'openid_connect' && (
                    <Button
                      variant="filled"
                      size="xs"
                      color="orange"
                      onClick={handleReauthenticate}
                      disabled={loading}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {t('common:signIn')}
                    </Button>
                  )}
                </Group>
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
                  renderNode={({ node, expanded, elementProps }) => {
                    const treeNode = node as unknown as TreeNode;
                    const isRenaming = renamingNode === treeNode.value;

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

                      // For System Tree, ALWAYS open in Node Browser
                      openNodeTab({
                        nodeId: treeNode.value,
                        nodeName: treeNode.label,
                        serverId: activeServerId,
                      });
                      navigate('node-browser');
                    };

                    const handleNodeMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
                      // elementProps does not have onMouseEnter in the type definition, but we can cast it if needed
                      // or just ignore it if we don't need to pass it up.
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
                          actions.length > 0 ? handleContextMenu(e, treeNode) : undefined
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
                    {selectedNode && !selectedNode.isFolder && (
                      <>
                        {isTextFile(selectedNode) && (
                          <Menu.Item
                            leftSection={<IconTextWrap size={14} />}
                            onClick={handleOpenInTextEditor}
                          >
                            {t('submenu:textEditor')}
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconCode size={14} />}
                          onClick={handleOpenInJsConsole}
                        >
                          {t('submenu:jsConsole')}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconFileSearch size={14} />}
                          onClick={handleOpenInNodeBrowser}
                        >
                          {t('submenu:nodeBrowser')}
                        </Menu.Item>
                        <Menu.Divider />
                      </>
                    )}
                    {selectedNode?.isFolder && (
                      <>
                        <Menu.Item
                          leftSection={<IconFileSearch size={14} />}
                          onClick={handleOpenInNodeBrowser}
                        >
                          {t('submenu:nodeBrowser')}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconCode size={14} />}
                          onClick={handleOpenInJsConsole}
                        >
                          {t('submenu:jsConsole')}
                        </Menu.Item>
                        <Menu.Divider />
                      </>
                    )}
                    {selectedNode &&
                      (() => {
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

                        return (
                          <>
                            {otherActions.map(action => {
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
                            })}
                          </>
                        );
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
