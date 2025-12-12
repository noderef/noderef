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
import { TextEditorPane } from '@/components/text-editor/TextEditorPane';
import { backendRpc, type RepositoryBreadcrumbItem } from '@/core/ipc/backend';
import { useFileFolderBrowserTabsStore } from '@/core/store/fileFolderBrowserTabs';
import { useNavigationStore } from '@/core/store/navigation';
import { useTextEditorStore } from '@/core/store/textEditor';
import { TEXT_FILE_ACCEPT, detectLanguageFromMetadata } from '@/features/text-editor/language';
import { Anchor, Badge, Box, Breadcrumbs, Group, Paper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function TextEditorPage() {
  const content = useTextEditorStore(state => state.content);
  const language = useTextEditorStore(state => state.language);
  const fileName = useTextEditorStore(state => state.fileName);
  const mimeType = useTextEditorStore(state => state.mimeType);
  const wordWrap = useTextEditorStore(state => state.wordWrap);
  const serverId = useTextEditorStore(state => state.serverId);
  const nodeId = useTextEditorStore(state => state.nodeId);
  const localFileId = useTextEditorStore(state => state.localFileId);
  const setContent = useTextEditorStore(state => state.setContent);
  // Note: setFileName and setLanguage reserved for future use
  // const setFileName = useTextEditorStore((state) => state.setFileName);
  // const setLanguage = useTextEditorStore((state) => state.setLanguage);
  const setEditorInstance = useTextEditorStore(state => state.setEditorInstance);
  const registerFileDialogOpener = useTextEditorStore(state => state.registerFileDialogOpener);
  const setRemoteSource = useTextEditorStore(state => state.setRemoteSource);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const breadcrumbContainerRef = useRef<HTMLDivElement>(null);
  const breadcrumbContentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<RepositoryBreadcrumbItem[]>([]);
  const [visibleBreadcrumbStart, setVisibleBreadcrumbStart] = useState(0);
  const visibleBreadcrumbStartRef = useRef(0);

  const openFolderTab = useFileFolderBrowserTabsStore(state => state.openTab);
  const navigate = useNavigationStore(state => state.navigate);

  // Load breadcrumb when a repository file is opened
  useEffect(() => {
    if (serverId && nodeId && !localFileId) {
      backendRpc.repository
        .getNodeChildren(serverId, nodeId, { maxItems: 1, skipCount: 0 })
        .then(response => {
          setBreadcrumb(response.breadcrumb || []);
        })
        .catch(error => {
          console.error('Failed to load breadcrumb:', error);
          setBreadcrumb([]);
        });
    } else {
      setBreadcrumb([]);
    }
  }, [serverId, nodeId, localFileId]);

  useEffect(() => {
    registerFileDialogOpener(() => {
      fileInputRef.current?.click();
    });
    return () => registerFileDialogOpener(null);
  }, [registerFileDialogOpener]);

  const handleFileLoad = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        setContent(text);
        // Detect language using both filename and mimetype for better accuracy
        const detectedLanguage = detectLanguageFromMetadata(file.name, file.type);
        // Store mimetype for icon display
        useTextEditorStore.setState({
          fileName: file.name,
          mimeType: file.type || null,
          language: detectedLanguage,
        });
      };
      reader.onerror = () => {
        notifications.show({
          title: 'Failed to open file',
          message: reader.error?.message ?? 'Unable to read file',
          color: 'red',
        });
      };
      setRemoteSource(null, null);
      reader.readAsText(file);
    },
    [setContent, setRemoteSource]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileLoad(file);
    }
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const withinX = event.clientX >= rect.left && event.clientX <= rect.right;
    const withinY = event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!withinX || !withinY) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileLoad(file);
    }
  };

  // Get language display name for badge
  const languageDisplayName = fileName
    ? (() => {
        const ext = fileName.split('.').pop()?.toUpperCase();
        if (ext) return ext;
        // Fallback to language name if no extension
        return language === 'plaintext' ? 'TEXT' : language.toUpperCase();
      })()
    : null;

  // Get file icon component - use the same logic as repository tree
  const FileIcon = getFileIconByMimeType(mimeType || undefined);

  // Build effective breadcrumb - backend already includes the current node in breadcrumb
  const effectiveBreadcrumb = useMemo(() => {
    if (breadcrumb.length > 0) {
      return breadcrumb;
    }
    // Fallback: if no breadcrumb but we have file info, show just the filename
    if (serverId && nodeId && fileName) {
      return [{ id: nodeId, name: fileName }];
    }
    return [];
  }, [breadcrumb, nodeId, fileName, serverId]);

  // Only show breadcrumb for repository files (not local files)
  const showBreadcrumb = serverId && nodeId && !localFileId && effectiveBreadcrumb.length > 0;

  useEffect(() => {
    visibleBreadcrumbStartRef.current = visibleBreadcrumbStart;
  }, [visibleBreadcrumbStart]);

  useEffect(() => {
    if (
      !showBreadcrumb ||
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
  }, [showBreadcrumb, effectiveBreadcrumb.length]);

  const visibleBreadcrumb = useMemo(() => {
    if (visibleBreadcrumbStart === 0) {
      return effectiveBreadcrumb;
    }
    return effectiveBreadcrumb.slice(visibleBreadcrumbStart);
  }, [effectiveBreadcrumb, visibleBreadcrumbStart]);

  const handleBreadcrumbClick = useCallback(
    (item: RepositoryBreadcrumbItem, index: number) => {
      if (index === effectiveBreadcrumb.length - 1) {
        return; // Don't navigate if clicking on current file
      }

      if (!item.id || !serverId) {
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

  // Get visible breadcrumb items (truncated from left)
  const breadcrumbItems = useMemo(() => {
    const items: React.ReactNode[] = [];

    // Add ellipsis if items are hidden from the left
    if (visibleBreadcrumbStart > 0) {
      items.push(
        <Text key="ellipsis" size="sm" c="dimmed">
          ...
        </Text>
      );
    }

    // Add visible breadcrumb items
    visibleBreadcrumb.forEach((crumb, visibleIndex) => {
      const originalIndex = visibleBreadcrumbStart + visibleIndex;
      const isLast = originalIndex === effectiveBreadcrumb.length - 1;
      const label = crumb.name || 'Unknown';

      if (isLast) {
        // Last item: show file icon, filename, and badge
        items.push(
          <Group key={crumb.id || `${label}-${originalIndex}`} gap="xs" align="center">
            <FileIcon size={16} stroke={1.5} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="sm" fw={500} c="blue">
              {label}
            </Text>
            {languageDisplayName && (
              <Badge size="sm" variant="light" color="blue" radius="xs">
                {languageDisplayName}
              </Badge>
            )}
          </Group>
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
  }, [
    visibleBreadcrumb,
    visibleBreadcrumbStart,
    effectiveBreadcrumb,
    handleBreadcrumbClick,
    FileIcon,
    languageDisplayName,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--mantine-spacing-md)',
        position: 'relative',
        gap: 'var(--mantine-spacing-sm)',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--mantine-radius-md)',
            pointerEvents: 'none',
          }}
        >
          <Text fw={600}>Drop file to load into editor</Text>
        </Box>
      )}

      <Paper withBorder p="md" radius="md">
        {showBreadcrumb ? (
          <div
            ref={breadcrumbContainerRef}
            style={{
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div ref={breadcrumbContentRef} style={{ width: 'max-content' }}>
              <Breadcrumbs>{breadcrumbItems}</Breadcrumbs>
            </div>
          </div>
        ) : (
          <Group gap="xs" align="center">
            <FileIcon size={20} stroke={1.5} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {fileName ?? 'Untitled document'}
              </Text>
              {languageDisplayName && (
                <Badge size="sm" variant="light" color="blue" radius="xs">
                  {languageDisplayName}
                </Badge>
              )}
            </Group>
          </Group>
        )}
      </Paper>

      <Paper withBorder radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TextEditorPane
          value={content}
          language={language}
          wordWrap={wordWrap}
          onChange={setContent}
          onEditorMount={setEditorInstance}
        />
      </Paper>

      <input
        type="file"
        ref={fileInputRef}
        accept={TEXT_FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </div>
  );
}

export default TextEditorPage;
