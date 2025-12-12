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

import { Menu } from '@mantine/core';
import {
  IconCopy,
  IconCut,
  IconDeviceFloppy,
  IconDots,
  IconFilePlus,
  IconHelp,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { MenuButton } from './MenuButton';

export function AppMenu() {
  const { t } = useTranslation('menu');

  return (
    <Menu withinPortal shadow="md" width={200}>
      <Menu.Target>
        <MenuButton>{t('file')}</MenuButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('file')}</Menu.Label>
        <Menu.Item leftSection={<IconFilePlus size={14} />}>{t('newFile')}</Menu.Item>
        <Menu.Item leftSection={<IconDeviceFloppy size={14} />}>{t('save')}</Menu.Item>
        <Menu.Divider />
        <Menu.Label>{t('edit')}</Menu.Label>
        <Menu.Item leftSection={<IconCut size={14} />}>{t('cut')}</Menu.Item>
        <Menu.Item leftSection={<IconCopy size={14} />}>{t('copy')}</Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconDots size={14} />}>{t('view')}</Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconHelp size={14} />}>{t('help')}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
