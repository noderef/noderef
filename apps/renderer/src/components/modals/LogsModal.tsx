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

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useActiveServerId } from '@/hooks/useNavigation';
import { useServersStore } from '@/core/store/servers';
import { LogFilesList, type LogFile } from '@/components/logs/LogFilesList';
import { downloadLogFile, fetchLogFiles } from '@/core/api/logs';
import { notifications } from '@mantine/notifications';
import type { NotificationsProps } from '@mantine/notifications';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { filesystem, os } from '@neutralinojs/lib';
import { useModal } from '@/hooks/useModal';
import { MODAL_KEYS } from '@/core/store/keys';
import { TextEditorPane } from '@/components/text-editor/TextEditorPane';
import { detectLanguageFromMetadata } from '@/features/text-editor/language';
import { IconTextWrap, IconTextWrapDisabled } from '@tabler/icons-react';

type LogsModalTab = 'logs' | 'editor';

export function LogsModal() {
  const { t } = useTranslation('logs');
  const { isOpen, close } = useModal(MODAL_KEYS.LOGS);
  const activeServerId = useActiveServerId();
  const servers = useServersStore(state => state.servers);
  const activeServer = servers.find(s => s.id === activeServerId);

  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [logFilesLoading, setLogFilesLoading] = useState(false);
  const [logFilesError, setLogFilesError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<LogFile | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<LogsModalTab>('logs');
  const [editorContent, setEditorContent] = useState('');
  const [editorFileName, setEditorFileName] = useState<string | null>(null);
  const [editorLanguage, setEditorLanguage] = useState('plaintext');
  const [editorFilePath, setEditorFilePath] = useState<string | null>(null);
  const [editorWordWrap, setEditorWordWrap] = useState<'on' | 'off'>('off');
  const [editorLoading, setEditorLoading] = useState(false);
  const notificationPosition: NotificationsProps['position'] = 'bottom-center';
  const showNotification = (args: Parameters<typeof notifications.show>[0]) =>
    notifications.show({
      position: notificationPosition,
      withCloseButton: true,
      autoClose: 6000,
      ...args,
    });

  const resetEditorState = useCallback(() => {
    setEditorContent('');
    setEditorFileName(null);
    setEditorLanguage('plaintext');
    setEditorFilePath(null);
    setEditorWordWrap('off');
    setEditorLoading(false);
  }, []);

  const loadLogFiles = useCallback(async () => {
    if (!isOpen || !activeServer?.baseUrl || !activeServerId) return;

    setLogFilesLoading(true);
    setLogFilesError(null);
    try {
      const files = await fetchLogFiles(activeServer.baseUrl, activeServerId);
      setLogFiles(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setLogFilesError(message);
      notifications.show({
        title: t('errorLoadingLogFiles'),
        message,
        color: 'red',
      });
    } finally {
      setLogFilesLoading(false);
    }
  }, [activeServer?.baseUrl, activeServerId, isOpen, t]);

  const handleDownloadLogFile = useCallback(
    async (logFile: LogFile) => {
      if (!activeServer?.baseUrl || !activeServerId) return;

      setDownloadingFile(logFile.path);
      try {
        const content = await downloadLogFile(activeServer.baseUrl, activeServerId, logFile.path);

        const safeFileName = logFile.name && logFile.name.trim() ? logFile.name.trim() : 'log.txt';
        const neutralinoAvailable =
          isNeutralinoMode() &&
          typeof (window as any).Neutralino?.os?.showSaveDialog === 'function';

        if (neutralinoAvailable) {
          await ensureNeutralinoReady();
          let defaultPath = safeFileName;
          try {
            const downloadsDir = await os.getPath('downloads');
            if (downloadsDir) {
              defaultPath = `${downloadsDir}/${safeFileName}`;
            }
          } catch {
            // ignore path lookup failures
          }

          const savePath = await os.showSaveDialog(t('downloadLogFile'), { defaultPath });

          if (!savePath) {
            showNotification({
              title: t('downloadFailed'),
              message: t('downloadCancelled'),
              color: 'yellow',
              autoClose: 4000,
            });
            return;
          }

          const encoded = new TextEncoder().encode(content);
          await filesystem.writeBinaryFile(
            savePath,
            encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
          );

          showNotification({
            title: t('downloadSuccess'),
            message: t('logFileDownloaded', { fileName: safeFileName }),
            color: 'green',
          });
          return;
        }

        // Browser / fallback
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const file = new File([blob], safeFileName, { type: blob.type });
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = safeFileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        showNotification({
          title: t('downloadSuccess'),
          message: t('logFileDownloaded', { fileName: safeFileName }),
          color: 'green',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        showNotification({
          title: t('downloadFailed'),
          message,
          color: 'red',
        });
      } finally {
        setDownloadingFile(null);
      }
    },
    [activeServer?.baseUrl, activeServerId, t]
  );

  const handleOpenInTextEditor = useCallback(
    async (logFile: LogFile) => {
      if (!activeServer?.baseUrl || !activeServerId) return;

      setOpeningFile(logFile.path);
      setEditorLoading(true);
      setActiveTab('editor');
      try {
        const content = await downloadLogFile(activeServer.baseUrl, activeServerId, logFile.path);

        setEditorContent(content);
        setEditorFileName(logFile.name);
        setEditorLanguage(detectLanguageFromMetadata(logFile.name, 'text/plain') ?? 'plaintext');
        setEditorFilePath(logFile.path);

        notifications.show({
          title: t('openInTextEditorSuccess'),
          message: t('logFileOpened', { fileName: logFile.name }),
          color: 'green',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        notifications.show({
          title: t('openInTextEditorFailed'),
          message,
          color: 'red',
        });
        setActiveTab('logs');
      } finally {
        setOpeningFile(null);
        setEditorLoading(false);
      }
    },
    [activeServer?.baseUrl, activeServerId, t]
  );

  useEffect(() => {
    if (isOpen && activeServer?.baseUrl && activeServerId) {
      loadLogFiles();
    }
  }, [isOpen, activeServer?.baseUrl, activeServerId, loadLogFiles]);

  useEffect(() => {
    if (!isOpen) {
      setLogFiles([]);
      setLogFilesError(null);
      setSelectedFile(null);
      setDownloadingFile(null);
      setOpeningFile(null);
      setActiveTab('logs');
      resetEditorState();
    }
  }, [isOpen, resetEditorState]);

  useEffect(() => {
    if (isOpen) {
      setLogFiles([]);
      setLogFilesError(null);
      setSelectedFile(null);
      setDownloadingFile(null);
      setOpeningFile(null);
      setActiveTab('logs');
      resetEditorState();
    }
  }, [activeServerId, isOpen, resetEditorState]);

  const renderEditorPanel = () => {
    if (editorLoading) {
      return (
        <Center h="70vh">
          <Stack align="center" gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              {t('loadingEditor')}
            </Text>
          </Stack>
        </Center>
      );
    }

    if (!editorFileName) {
      return (
        <Center h="70vh" p="md">
          <Stack align="center" gap="xs">
            <Title order={4}>{t('textEditorTabTitle')}</Title>
            <Text size="sm" c="dimmed" ta="center">
              {t('textEditorEmptyState')}
            </Text>
          </Stack>
        </Center>
      );
    }

    return (
      <Stack gap="sm" style={{ height: '70vh' }}>
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="xs"
                  c="dimmed"
                  title={editorFilePath ?? undefined}
                  style={{ wordBreak: 'break-all', lineHeight: 1.2 }}
                >
                  {editorFilePath || t('activeLogFile')}
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <Title order={4}>{editorFileName}</Title>
                  {editorFileName.includes('.') && (
                    <Badge size="xs" variant="light">
                      {editorFileName.split('.').pop()?.toUpperCase()}
                    </Badge>
                  )}
                </Group>
              </Stack>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Text size="xs" c="dimmed">
                    {t('wrapLabel')}
                  </Text>
                  <SegmentedControl
                    value={editorWordWrap}
                    size="xs"
                    aria-label={t('wrapLabel')}
                    onChange={value => setEditorWordWrap(value as 'on' | 'off')}
                    data={[
                      {
                        label: <IconTextWrapDisabled size={16} stroke={1.5} title={t('wrapOff')} />,
                        value: 'off',
                      },
                      {
                        label: <IconTextWrap size={16} stroke={1.5} title={t('wrapOn')} />,
                        value: 'on',
                      },
                    ]}
                  />
                </Stack>
              </Group>
            </Group>
          </Stack>
        </Paper>
        <Paper withBorder radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <TextEditorPane
            value={editorContent}
            language={editorLanguage}
            wordWrap={editorWordWrap}
            onChange={setEditorContent}
          />
        </Paper>
      </Stack>
    );
  };

  const renderLogsPanel = () => (
    <Box
      style={{
        width: '100%',
        height: '70vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <LogFilesList
          logFiles={logFiles}
          loading={logFilesLoading}
          error={logFilesError}
          onRefresh={loadLogFiles}
          onFileSelect={setSelectedFile}
          onFileDownload={handleDownloadLogFile}
          onOpenInTextEditor={handleOpenInTextEditor}
          selectedFile={selectedFile}
          downloadingFile={downloadingFile}
          openingFile={openingFile}
        />
      </Box>
    </Box>
  );

  const renderModalBody = () => {
    if (!activeServerId || !activeServer) {
      return (
        <Center h={200} p="md">
          <Stack align="center" gap="md">
            <Title order={3}>{t('title')}</Title>
            <Text c="dimmed" size="sm">
              {t('noServerSelected')}
            </Text>
          </Stack>
        </Center>
      );
    }

    return (
      <Tabs
        value={activeTab}
        onChange={value => value && setActiveTab(value as LogsModalTab)}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="logs">{t('logsTabLabel')}</Tabs.Tab>
          <Tabs.Tab value="editor" disabled={!editorFileName && !editorLoading}>
            {t('textEditorTabTitle')}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="logs" style={{ marginTop: 'var(--mantine-spacing-md)' }}>
          {renderLogsPanel()}
        </Tabs.Panel>
        <Tabs.Panel value="editor" style={{ marginTop: 'var(--mantine-spacing-md)' }}>
          {renderEditorPanel()}
        </Tabs.Panel>
      </Tabs>
    );
  };

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      size="90vw"
      radius="lg"
      trapFocus
      returnFocus
      closeOnEscape
      closeOnClickOutside
      title={
        <Group gap="xs">
          <Title order={4}>{t('title')}</Title>
          {activeServer && (
            <Text size="sm" c="dimmed">
              {activeServer.name}
            </Text>
          )}
        </Group>
      }
    >
      {renderModalBody()}
    </Modal>
  );
}
