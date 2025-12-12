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

import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface NodeAspectsProps {
  aspects: AlfrescoNodeDetails['aspects'];
}

export function NodeAspects({ aspects }: NodeAspectsProps) {
  const { t } = useTranslation(['nodeBrowser']);

  return (
    <Stack gap="md" p="md">
      <Paper withBorder p="md">
        {aspects.length === 0 ? (
          <Text c="dimmed">{t('nodeBrowser:noAspects')}</Text>
        ) : (
          <Group gap="xs">
            {aspects.map((aspect, idx) => (
              <Badge
                key={idx}
                variant="light"
                color="blue"
                size="lg"
                radius="sm"
                style={{ textTransform: 'none' }}
              >
                {aspect.prefixedName}
              </Badge>
            ))}
          </Group>
        )}
      </Paper>
    </Stack>
  );
}
