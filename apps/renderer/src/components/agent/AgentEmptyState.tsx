import { backendRpc } from '@/core/ipc/backend';
import { Box, Button, Text } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../BrandLogo';

interface AgentEmptyStateProps {
  chatId?: number | null;
  aiUnavailable?: boolean;
  onOpenSettings?: () => void;
}

export function AgentEmptyState({
  chatId,
  aiUnavailable = false,
  onOpenSettings,
}: AgentEmptyStateProps) {
  const { t } = useTranslation('agent');
  const [currentUser, setCurrentUser] = useState<{
    fullName: string | null;
    username: string;
  } | null>(null);
  const fallbackVariantRef = useRef(Math.floor(Math.random() * 3) + 1);
  const welcomeVariant = useMemo(() => {
    if (typeof chatId === 'number') {
      const seed = Math.abs(chatId);
      return (seed % 3) + 1;
    }
    // No active chat yet: pick one random variant per mounted empty-state session.
    return fallbackVariantRef.current;
  }, [chatId]);

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
        </>
      )}
    </Box>
  );
}
