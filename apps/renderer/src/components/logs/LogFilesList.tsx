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
  Badge,
  Group,
  Paper,
  Stack,
  Text,
  Loader,
  Center,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconFile, IconRefresh, IconDownload, IconFileText } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export interface LogFile {
  name: string;
  path: string;
  directoryPath: string;
  size: string;
  lastModified: {
    raw: string;
    iso8601: string;
    nice: string;
  };
}

interface LogFilesListProps {
  logFiles: LogFile[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onFileSelect?: (logFile: LogFile) => void;
  onFileDownload?: (logFile: LogFile) => void;
  onOpenInTextEditor?: (logFile: LogFile) => void;
  selectedFile?: LogFile | null;
  downloadingFile?: string | null;
  openingFile?: string | null;
}

export function LogFilesList({
  logFiles,
  loading,
  error,
  onRefresh,
  onFileSelect,
  onFileDownload,
  onOpenInTextEditor,
  selectedFile,
  downloadingFile,
  openingFile,
}: LogFilesListProps) {
  const { t } = useTranslation('logs');

  const formatSize = (bytes: string) => {
    const num = parseInt(bytes, 10);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (loading) {
    return (
      <Center h="100%">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">
            {t('loadingLogFiles')}
          </Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="100%">
        <Stack align="center" gap="md">
          <Text c="red" size="sm">
            {t('errorLoadingLogFiles')}: {error}
          </Text>
          <ActionIcon onClick={onRefresh} variant="light" size="lg">
            <IconRefresh size={18} />
          </ActionIcon>
        </Stack>
      </Center>
    );
  }

  if (!logFiles || logFiles.length === 0) {
    return (
      <Center h="100%">
        <Text c="dimmed" size="sm">
          {t('noLogFiles')}
        </Text>
      </Center>
    );
  }

  return (
    <Stack gap="xs" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between" px="sm" pt="xs">
        <Text size="sm" fw={600}>
          {t('logFiles')} ({logFiles.length})
        </Text>
        <Tooltip label={t('refresh')}>
          <ActionIcon onClick={onRefresh} variant="subtle" size="sm">
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {logFiles.map(logFile => {
        const isSelected = selectedFile?.path === logFile.path;
        const isDownloading = downloadingFile === logFile.path;
        const isOpening = openingFile === logFile.path;
        return (
          <Paper
            key={logFile.path}
            p="sm"
            withBorder
            radius="md"
            style={{
              backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
              borderColor: isSelected ? 'var(--mantine-color-blue-filled)' : undefined,
            }}
          >
            <Stack gap="xs">
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <Group
                  gap="xs"
                  wrap="nowrap"
                  style={{
                    flex: 1,
                    cursor: onFileSelect ? 'pointer' : 'default',
                  }}
                  onClick={() => onFileSelect?.(logFile)}
                >
                  <IconFile size={18} style={{ flexShrink: 0 }} />
                  <Text size="sm" fw={500} style={{ wordBreak: 'break-word', flex: 1 }}>
                    {logFile.name}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {onOpenInTextEditor && (
                    <Tooltip label={t('openInTextEditor')}>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenInTextEditor(logFile);
                        }}
                        loading={isOpening}
                      >
                        <IconFileText size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {onFileDownload && (
                    <Tooltip label={t('downloadLogFile')}>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={e => {
                          e.stopPropagation();
                          onFileDownload(logFile);
                        }}
                        loading={isDownloading}
                      >
                        <IconDownload size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
              <Group gap="xs" wrap="wrap">
                <Badge size="xs" variant="light" color="gray">
                  {formatSize(logFile.size)}
                </Badge>
                <Text size="xs" c="dimmed">
                  {logFile.lastModified.nice}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1} title={logFile.path}>
                {logFile.path}
              </Text>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
