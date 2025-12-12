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
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@/hooks/useNavigation';
import { BrandLogo } from '@/components/BrandLogo';
import classes from './sidebarIcon.module.css';

interface NodeRefSpaceProps {
  active: boolean;
  onSelect: () => void;
}

export function NodeRefSpace({ active, onSelect }: NodeRefSpaceProps) {
  const { t } = useTranslation('submenu');
  const { navigate } = useNavigation();

  const handleClick = () => {
    onSelect();
    navigate('dashboard');
  };

  return (
    <Tooltip label={t('nodeRefSpace')} position="right" withArrow>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <ActionIcon
          variant={active ? 'filled' : 'light'}
          color="blue"
          radius="xl"
          size={56}
          onClick={handleClick}
          aria-label={t('nodeRefSpace')}
          className={classes.icon}
        >
          <BrandLogo size={20} color={active ? 'white' : 'var(--mantine-color-blue-6)'} />
        </ActionIcon>
      </div>
    </Tooltip>
  );
}
