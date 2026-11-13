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

import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { ActionIcon, Badge, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { IconPlus, IconRestore, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface NodeAspectsProps {
  aspects: AlfrescoNodeDetails['aspects'];
  compact?: boolean;
  editable?: boolean;
  pendingAdd?: string[];
  pendingRemove?: string[];
  availableAspects?: string[];
  aspectsLoading?: boolean;
  onRequestAspects?: () => void;
  onAdd?: (name: string) => void;
  onRemove?: (name: string) => void;
}

export function NodeAspects({
  aspects,
  compact = false,
  editable = false,
  pendingAdd = [],
  pendingRemove = [],
  availableAspects = [],
  aspectsLoading = false,
  onRequestAspects,
  onAdd,
  onRemove,
}: NodeAspectsProps) {
  const { t } = useTranslation(['nodeBrowser', 'common']);

  const currentNames = aspects.map(aspect => aspect.prefixedName);
  const visibleCurrent = currentNames.filter(name => !pendingRemove.includes(name));
  const addable = availableAspects.filter(
    name => !currentNames.includes(name) && !pendingAdd.includes(name)
  );

  const content =
    visibleCurrent.length === 0 && pendingAdd.length === 0 ? (
      <Text size={compact ? 'sm' : undefined} c="dimmed">
        {t('nodeBrowser:noAspects')}
      </Text>
    ) : (
      <Group gap="xs">
        {visibleCurrent.map(name => (
          <Badge
            key={name}
            variant="light"
            color="blue"
            size="lg"
            radius="sm"
            title={name}
            rightSection={
              editable ? (
                <ActionIcon
                  size="xs"
                  color="blue"
                  variant="transparent"
                  aria-label={t('nodeBrowser:removeAspect')}
                  onClick={() => onRemove?.(name)}
                >
                  <IconX size={12} />
                </ActionIcon>
              ) : undefined
            }
            style={{ textTransform: 'none', maxWidth: '100%' }}
          >
            {name}
          </Badge>
        ))}
        {pendingAdd.map(name => (
          <Badge
            key={`add-${name}`}
            variant="outline"
            color="teal"
            size="lg"
            radius="sm"
            title={name}
            rightSection={
              editable ? (
                <ActionIcon
                  size="xs"
                  color="teal"
                  variant="transparent"
                  aria-label={t('nodeBrowser:removeAspect')}
                  onClick={() => onRemove?.(name)}
                >
                  <IconX size={12} />
                </ActionIcon>
              ) : undefined
            }
            style={{ textTransform: 'none', maxWidth: '100%' }}
          >
            {name}
          </Badge>
        ))}
        {pendingRemove.map(name => (
          <Badge
            key={`remove-${name}`}
            variant="light"
            color="red"
            size="lg"
            radius="sm"
            title={name}
            rightSection={
              editable ? (
                <ActionIcon
                  size="xs"
                  color="red"
                  variant="transparent"
                  aria-label={t('nodeBrowser:undoRemoveAspect')}
                  onClick={() => onAdd?.(name)}
                >
                  <IconRestore size={12} />
                </ActionIcon>
              ) : undefined
            }
            style={{ textTransform: 'none', maxWidth: '100%', textDecoration: 'line-through' }}
          >
            {name}
          </Badge>
        ))}
      </Group>
    );

  const editor = editable ? (
    <Select
      placeholder={t('nodeBrowser:addAspectPlaceholder')}
      data={addable.map(name => ({ value: name, label: name }))}
      searchable
      clearable
      value={null}
      onDropdownOpen={() => onRequestAspects?.()}
      onChange={value => {
        if (value) {
          onAdd?.(value);
        }
      }}
      leftSection={<IconPlus size={14} />}
      nothingFoundMessage={t('common:nothingFound')}
      disabled={aspectsLoading && addable.length === 0}
      style={{ maxWidth: 360 }}
    />
  ) : null;

  if (compact) {
    return (
      <Stack gap="sm" p="sm">
        {content}
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      <Paper withBorder p="md">
        <Stack gap="md">
          {editor}
          {content}
        </Stack>
      </Paper>
    </Stack>
  );
}
