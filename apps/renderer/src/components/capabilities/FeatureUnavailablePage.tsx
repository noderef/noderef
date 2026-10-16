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

import { refreshCapabilitiesDebounced } from '@/core/capabilities';
import { useActiveServerId } from '@/hooks/useNavigation';
import { Feature } from '@app/contracts';
import { Alert, Center, Stack, Text } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeatureUnavailableLabel } from './FeatureGate';

export function FeatureUnavailablePage({ feature }: { feature: Feature }) {
  const { t } = useTranslation('common');
  const activeServerId = useActiveServerId();
  const message = useFeatureUnavailableLabel(feature);

  useEffect(() => {
    if (activeServerId) {
      void refreshCapabilitiesDebounced(activeServerId);
    }
  }, [activeServerId, feature]);

  return (
    <Center h="100%" p="xl">
      <Stack gap="sm" maw={480} align="center">
        <Alert icon={<IconLock size={16} />} color="gray" title={t(`features.${feature}`)}>
          <Text size="sm">{message}</Text>
        </Alert>
      </Stack>
    </Center>
  );
}
