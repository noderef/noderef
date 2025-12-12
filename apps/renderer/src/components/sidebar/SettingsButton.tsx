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

import { ActionIcon, Tooltip } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useModal } from '@/hooks/useModal';
import { MODAL_KEYS } from '@/core/store/keys';
import classes from './sidebarIcon.module.css';

export function SettingsButton() {
  const { t } = useTranslation('spotlight');
  const { open } = useModal(MODAL_KEYS.SETTINGS);

  return (
    <Tooltip label={t('settings')} position="right" withArrow>
      <ActionIcon
        variant="light"
        size={56}
        radius="xl"
        aria-label={t('settings')}
        color="slate"
        className={classes.icon}
        onClick={open}
      >
        <IconSettings size={20} className={classes.settingsIcon} />
      </ActionIcon>
    </Tooltip>
  );
}
