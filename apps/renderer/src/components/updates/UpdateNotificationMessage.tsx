/**
 * Copyright 2025-2026 NodeRef
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

import { Group, Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { useUpdateStore } from '@/core/store/updates';
import { UpdateActionButton } from './UpdateActionButton';
import { formatUpdateProgressLabel } from './updateProgressLabel';

interface UpdateNotificationMessageProps {
  version: string;
}

export function UpdateNotificationMessage({ version }: UpdateNotificationMessageProps) {
  const { t } = useTranslation(['common', 'settings']);
  const status = useUpdateStore(state => state.status);
  const downloadProgress = useUpdateStore(state => state.downloadProgress);
  const downloadProgressDetails = useUpdateStore(state => state.downloadProgressDetails);
  const errorMessage = useUpdateStore(state => state.errorMessage);

  const phase = downloadProgressDetails?.phase ?? 'downloading';
  const isDownloading = status === 'downloading';
  const isWriting = isDownloading && phase === 'writing';
  const progressLabel = formatUpdateProgressLabel(t, {
    progress: downloadProgress,
    loaded: downloadProgressDetails?.loaded ?? null,
    total: downloadProgressDetails?.total ?? null,
    phase,
  });

  return (
    <Stack gap="xs">
      <Text size="sm">{t('common:updateAvailableMessage', { version })}</Text>

      {isDownloading && (
        <Stack gap={4}>
          <Progress
            value={isWriting ? 100 : (downloadProgress ?? 100)}
            striped={isWriting || downloadProgress === null}
            animated={isWriting || downloadProgress === null}
          />
          <Text size="xs" c="dimmed">
            {progressLabel}
          </Text>
        </Stack>
      )}

      {status === 'downloaded' && (
        <Text size="xs" c="green">
          {t('settings:updateDownloadedMessage')}
        </Text>
      )}

      {status === 'error' && errorMessage && (
        <Text size="xs" c="red">
          {errorMessage}
        </Text>
      )}

      <Group justify="flex-start">
        <UpdateActionButton size="xs" />
      </Group>
    </Stack>
  );
}
