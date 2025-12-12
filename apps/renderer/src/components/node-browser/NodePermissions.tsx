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

import { Table, Text, Paper, Stack, Title, Badge, Group } from '@mantine/core';
import type { AlfrescoNodeDetails } from '@/core/ipc/backend';
import { useTranslation } from 'react-i18next';

interface NodePermissionsProps {
  permissions: AlfrescoNodeDetails['permissions'];
}

export function NodePermissions({ permissions }: NodePermissionsProps) {
  const { t } = useTranslation(['nodeBrowser']);

  return (
    <Stack gap="md" p="md">
      {/* Permission Entries */}
      <Paper withBorder p="md">
        <Title order={5} mb="md">
          {t('nodeBrowser:rights')}
        </Title>
        <Group gap="xs" mb="md">
          <Text size="sm">
            <strong>{t('nodeBrowser:inherits')}:</strong> {permissions.inherit ? 'true' : 'false'}
          </Text>
          <Text size="sm">
            <strong>{t('nodeBrowser:owner')}:</strong> {permissions.owner}
          </Text>
        </Group>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('nodeBrowser:right')}</Table.Th>
              <Table.Th>{t('nodeBrowser:authority')}</Table.Th>
              <Table.Th>{t('nodeBrowser:access')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {permissions.entries.map((entry, idx) => (
              <Table.Tr key={idx}>
                <Table.Td>
                  <Text size="sm">{entry.permission}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{entry.authority}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={entry.rel === 'ALLOWED' ? 'green' : 'red'} size="sm">
                    {entry.rel}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Permission Masks */}
      {permissions.masks && permissions.masks.length > 0 && (
        <Paper withBorder p="md">
          <Title order={5} mb="md">
            {t('nodeBrowser:accessMasks')}
          </Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('nodeBrowser:permission')}</Table.Th>
                <Table.Th>{t('nodeBrowser:authority')}</Table.Th>
                <Table.Th>{t('nodeBrowser:access')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {permissions.masks.map((mask, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td>
                    <Text size="sm">{mask.permission}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{mask.authority}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="gray" size="sm">
                      {mask.rel}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
