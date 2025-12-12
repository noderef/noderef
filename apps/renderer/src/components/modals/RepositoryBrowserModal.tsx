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

import { Modal, ScrollArea, Stack, Text, Loader, Group } from '@mantine/core';
import { useModal } from '@/hooks/useModal';
import { MODAL_KEYS } from '@/core/store/keys';
import { useActiveServerId } from '@/hooks/useNavigation';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useNavigationStore } from '@/core/store/navigation';
import { backendRpc, type RepositoryNode } from '@/core/ipc/backend';
import { IconFolder, IconFolderOpen } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, useCallback, useRef } from 'react';

interface TreeNode {
  id: string;
  name: string;
  isFolder: boolean;
  children?: TreeNode[];
  isLoading?: boolean;
  isExpanded?: boolean;
}

const NODE_CHILD_PAGE_SIZE = 50;

export function RepositoryBrowserModal() {
  const { isOpen, close } = useModal(MODAL_KEYS.REPOSITORY_BROWSER);
  const { t } = useTranslation(['fileFolderBrowser', 'common']);
  const activeServerId = useActiveServerId();
  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);
  const navigate = useNavigationStore(state => state.navigate);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadedNodes, setLoadedNodes] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const convertNodesToTree = useCallback((nodes: RepositoryNode[]): TreeNode[] => {
    return nodes
      .filter(node => node.isFolder)
      .map(node => ({
        id: node.id,
        name: node.name,
        isFolder: node.isFolder,
        children: [],
        isExpanded: false,
      }));
  }, []);

  const loadRootNodes = useCallback(async () => {
    if (!activeServerId) return;

    setLoading(true);
    try {
      const result = await backendRpc.repository.getNodeChildren(activeServerId, undefined, {
        maxItems: NODE_CHILD_PAGE_SIZE,
      });
      const nodes = convertNodesToTree(result.nodes);
      setTreeData(nodes);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Failed to load root nodes:', error);
    } finally {
      setLoading(false);
    }
  }, [activeServerId, convertNodesToTree]);

  const loadNodeChildren = useCallback(
    async (nodeId: string, parentPath: string[] = []): Promise<void> => {
      if (!activeServerId || loadedNodes.has(nodeId)) return;

      // Mark as loading
      setTreeData(prev => updateNodeLoading(prev, nodeId, true, parentPath));

      try {
        const result = await backendRpc.repository.getNodeChildren(activeServerId, nodeId, {
          maxItems: NODE_CHILD_PAGE_SIZE,
        });
        const childNodes = convertNodesToTree(result.nodes);

        setTreeData(prev => updateNodeChildren(prev, nodeId, childNodes, parentPath));
        setLoadedNodes(prev => new Set(prev).add(nodeId));
      } catch (error) {
        console.error(`Failed to load children for node ${nodeId}:`, error);
      } finally {
        setTreeData(prev => updateNodeLoading(prev, nodeId, false, parentPath));
      }
    },
    [activeServerId, convertNodesToTree, loadedNodes]
  );

  const updateNodeLoading = (
    nodes: TreeNode[],
    nodeId: string,
    isLoading: boolean,
    path: string[] = []
  ): TreeNode[] => {
    if (path.length === 0) {
      return nodes.map(node => (node.id === nodeId ? { ...node, isLoading } : node));
    }

    const [first, ...rest] = path;
    return nodes.map(node => {
      if (node.id === first) {
        return {
          ...node,
          children: node.children ? updateNodeLoading(node.children, nodeId, isLoading, rest) : [],
        };
      }
      return node;
    });
  };

  const updateNodeChildren = (
    nodes: TreeNode[],
    nodeId: string,
    children: TreeNode[],
    path: string[] = []
  ): TreeNode[] => {
    if (path.length === 0) {
      return nodes.map(node =>
        node.id === nodeId ? { ...node, children, isExpanded: true } : node
      );
    }

    const [first, ...rest] = path;
    return nodes.map(node => {
      if (node.id === first) {
        return {
          ...node,
          children: node.children ? updateNodeChildren(node.children, nodeId, children, rest) : [],
        };
      }
      return node;
    });
  };

  const toggleNode = useCallback(
    (node: TreeNode, path: string[] = []) => {
      if (!node.isFolder) return;

      const isExpanded = expandedNodes.has(node.id);
      if (isExpanded) {
        setExpandedNodes(prev => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        setTreeData(prev => updateNodeExpanded(prev, node.id, false, path));
      } else {
        setExpandedNodes(prev => new Set(prev).add(node.id));
        setTreeData(prev => updateNodeExpanded(prev, node.id, true, path));
        if (!loadedNodes.has(node.id)) {
          loadNodeChildren(node.id, path);
        }
      }
    },
    [expandedNodes, loadedNodes, loadNodeChildren]
  );

  const updateNodeExpanded = (
    nodes: TreeNode[],
    nodeId: string,
    isExpanded: boolean,
    path: string[] = []
  ): TreeNode[] => {
    if (path.length === 0) {
      return nodes.map(node => (node.id === nodeId ? { ...node, isExpanded } : node));
    }

    const [first, ...rest] = path;
    return nodes.map(node => {
      if (node.id === first) {
        return {
          ...node,
          children: node.children
            ? updateNodeExpanded(node.children, nodeId, isExpanded, rest)
            : [],
        };
      }
      return node;
    });
  };

  const selectNode = useCallback(
    (node: TreeNode) => {
      openFolderTab({
        nodeId: node.id,
        nodeName: node.name,
        serverId: activeServerId!,
      });
      navigate('file-folder-browser');
      close();
    },
    [openFolderTab, navigate, close, activeServerId]
  );

  // Flatten tree for keyboard navigation
  const flattenTree = useCallback(
    (
      nodes: TreeNode[],
      path: string[] = []
    ): Array<{ node: TreeNode; path: string[]; level: number }> => {
      const result: Array<{ node: TreeNode; path: string[]; level: number }> = [];
      nodes.forEach(node => {
        result.push({ node, path, level: path.length });
        if (node.isExpanded && node.children) {
          result.push(...flattenTree(node.children, [...path, node.id]));
        }
      });
      return result;
    },
    []
  );

  const flatNodes = flattenTree(treeData);
  const maxIndex = flatNodes.length - 1;

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, maxIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const current = flatNodes[selectedIndex];
        if (current && current.node.isFolder && !current.node.isExpanded) {
          toggleNode(current.node, current.path);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const current = flatNodes[selectedIndex];
        if (current && current.node.isFolder && current.node.isExpanded) {
          toggleNode(current.node, current.path);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const current = flatNodes[selectedIndex];
        if (current) {
          selectNode(current.node);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, maxIndex, flatNodes, toggleNode, selectNode, close]);

  // Scroll selected item into view
  useEffect(() => {
    const current = flatNodes[selectedIndex];
    if (current) {
      const element = itemRefs.current.get(current.node.id);
      if (element && scrollRef.current) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, flatNodes]);

  // Load root nodes when modal opens
  useEffect(() => {
    if (isOpen && activeServerId) {
      setTreeData([]);
      setExpandedNodes(new Set());
      setLoadedNodes(new Set());
      setSelectedIndex(0);
      loadRootNodes();
    }
  }, [isOpen, activeServerId, loadRootNodes]);

  const renderNode = (node: TreeNode, path: string[], level: number, index: number) => {
    const isSelected = index === selectedIndex;
    const Icon = node.isExpanded ? IconFolderOpen : IconFolder;

    return (
      <div
        key={node.id}
        ref={el => {
          if (el) {
            itemRefs.current.set(node.id, el);
          } else {
            itemRefs.current.delete(node.id);
          }
        }}
        style={{
          padding: '8px 12px',
          paddingLeft: `${12 + level * 20}px`,
          cursor: 'pointer',
          backgroundColor: isSelected ? 'var(--mantine-color-blue-1)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onClick={() => {
          setSelectedIndex(index);
          if (node.isFolder) {
            toggleNode(node, path);
          } else {
            selectNode(node);
          }
        }}
        onDoubleClick={() => {
          if (node.isFolder) {
            toggleNode(node, path);
          } else {
            selectNode(node);
          }
        }}
      >
        <Icon size={18} stroke={1.5} color="var(--mantine-color-blue-6)" />
        <Text size="sm" style={{ flex: 1 }}>
          {node.name}
        </Text>
        {node.isLoading && <Loader size="xs" />}
      </div>
    );
  };

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title={t('fileFolderBrowser:browseRepository')}
      size="lg"
      centered
      trapFocus={false}
      closeOnClickOutside
      closeOnEscape
    >
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          {t('fileFolderBrowser:browseRepositoryHint')}
        </Text>
        <ScrollArea h={500} viewportRef={scrollRef}>
          {loading ? (
            <Group justify="center" p="xl">
              <Loader size="sm" />
            </Group>
          ) : flatNodes.length === 0 ? (
            <Group justify="center" p="xl">
              <Text size="sm" c="dimmed">
                {t('fileFolderBrowser:noFolders')}
              </Text>
            </Group>
          ) : (
            flatNodes.map((item, index) => renderNode(item.node, item.path, item.level, index))
          )}
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
