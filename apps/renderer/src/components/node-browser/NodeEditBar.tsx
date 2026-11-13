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

import { Button, Group, Paper, Text } from '@mantine/core';
import { IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface NodeEditBarProps {
  changeCount: number;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function NodeEditBar({ changeCount, saving, onSave, onCancel }: NodeEditBarProps) {
  const { t } = useTranslation(['nodeBrowser', 'common']);

  return (
    <Paper
      withBorder
      p="sm"
      radius={0}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">{t('nodeBrowser:unsavedChanges', { count: changeCount })}</Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            variant="default"
            size="xs"
            leftSection={<IconX size={14} />}
            onClick={onCancel}
            disabled={saving}
          >
            {t('nodeBrowser:cancelEdits')}
          </Button>
          <Button
            size="xs"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={onSave}
            loading={saving}
          >
            {t('nodeBrowser:saveChanges')}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
