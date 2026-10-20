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

import { useServerCapabilities } from '@/core/store/servers';
import { useActiveServerId } from '@/hooks/useNavigation';
import { Feature, isFeatureAvailable } from '@app/contracts';
import { Menu } from '@mantine/core';
import type { MouseEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function useFeatureUnavailableLabel(feature: Feature): string {
  const { t } = useTranslation('common');
  return t('featureUnavailable', { feature: t(`features.${feature}`) });
}

export function FeatureMenuItem({
  feature,
  children,
  leftSection,
  rightSection,
  onClick,
  disabled,
  color,
}: {
  feature: Feature;
  children: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  onClick?: (() => void) | MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  color?: string;
}) {
  const activeServerId = useActiveServerId();
  const profile = useServerCapabilities(activeServerId);
  if (!isFeatureAvailable(profile, feature)) {
    return null;
  }

  return (
    <Menu.Item
      leftSection={leftSection}
      rightSection={rightSection}
      onClick={onClick}
      disabled={disabled}
      color={color}
    >
      {children}
    </Menu.Item>
  );
}
