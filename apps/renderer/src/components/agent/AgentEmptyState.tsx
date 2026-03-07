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

import { backendRpc } from '@/core/ipc/backend';
import { Box, Button, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../BrandLogo';

interface AgentEmptyStateProps {
  chatId?: number | null;
  aiUnavailable?: boolean;
  noServerSelected?: boolean;
  onOpenSettings?: () => void;
}

export function AgentEmptyState({
  chatId,
  aiUnavailable = false,
  noServerSelected = false,
  onOpenSettings,
}: AgentEmptyStateProps) {
  const { t } = useTranslation('agent');
  const [currentUser, setCurrentUser] = useState<{
    fullName: string | null;
    username: string;
  } | null>(null);
  const [newChatWelcomeVariant, setNewChatWelcomeVariant] = useState(1);

  useEffect(() => {
    if (typeof chatId === 'number') {
      return;
    }
    setNewChatWelcomeVariant(Math.floor(Math.random() * 3) + 1);
  }, [chatId]);

  const welcomeVariant = useMemo(() => {
    if (typeof chatId === 'number') {
      const seed = Math.abs(chatId);
      return (seed % 3) + 1;
    }
    return newChatWelcomeVariant;
  }, [chatId, newChatWelcomeVariant]);

  useEffect(() => {
    backendRpc.user.get().then(setCurrentUser).catch(console.error);
  }, []);

  const getGreetingData = () => {
    const hour = new Date().getHours();
    let timeOfDay = 'Evening';
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'Morning';
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = 'Afternoon';
    }

    const name = currentUser?.fullName || currentUser?.username;
    const hasName = Boolean(name && name.toLowerCase() !== 'system');
    const greeting = hasName
      ? t(`greeting${timeOfDay}_name` as any, { name })
      : t(`greeting${timeOfDay}` as any);
    const variantKey = `welcomeVariant${welcomeVariant}${hasName ? '_name' : ''}`;

    return t(variantKey as any, { greeting });
  };

  return (
    <Box
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '15vh',
        height: '100%',
      }}
    >
      <BrandLogo size={42} color="var(--mantine-color-text)" />
      {aiUnavailable ? (
        <Box mt="md" style={{ textAlign: 'center' }}>
          <Text size="xl" fw={600} mb={4}>
            {t('aiUnavailableTitle')}
          </Text>
          <Text size="md" c="dimmed" maw={560}>
            {t('aiUnavailableSubtitle')}
          </Text>
          <Button mt="md" variant="light" onClick={onOpenSettings}>
            {t('openSettings')}
          </Button>
        </Box>
      ) : (
        <>
          <Text size="xl" fw={600} mt="md" mb={4}>
            {getGreetingData()}
          </Text>
          <Text size="md" c="dimmed">
            {t('howCanIHelp')}
          </Text>
          {noServerSelected ? (
            <Text size="sm" c="dimmed" mt={6}>
              {t('selectServerHint')}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  );
}
