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

import { ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconSettings, IconUserPlus, IconLogout } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface ServerMenuProps {
  disabled?: boolean;
}

export function ServerMenu({ disabled }: ServerMenuProps) {
  const { t } = useTranslation('server');

  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" disabled={disabled}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('status')}</Menu.Label>
        <Menu.Item leftSection={<IconSettings size={14} />}>{t('serverSettings')}</Menu.Item>
        <Menu.Item leftSection={<IconUserPlus size={14} />}>{t('invitePeople')}</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconLogout size={14} />}>
          {t('leaveServer')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
