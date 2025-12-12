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

import { BrandLogo } from '@/components/BrandLogo';
import { Box, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation('notFound');

  return (
    <Box
      style={{
        flex: 1,
        width: '100%',
        minHeight: 'calc(100vh - 160px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        paddingTop: '4rem',
        position: 'relative',
      }}
    >
      <Stack align="center" gap="md" style={{ zIndex: 1 }}>
        <Title order={2}>{t('title')}</Title>
        <Text c="dimmed" size="sm">
          {t('description')}
        </Text>
      </Stack>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <div style={{ opacity: 0.08 }}>
          <BrandLogo size={240} color="var(--mantine-color-gray-6)" />
        </div>
      </div>
    </Box>
  );
}
