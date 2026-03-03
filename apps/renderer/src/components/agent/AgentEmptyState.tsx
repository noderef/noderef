import { backendRpc } from '@/core/ipc/backend';
import { Box, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../BrandLogo';

export function AgentEmptyState() {
  const { t } = useTranslation('agent');
  const [currentUser, setCurrentUser] = useState<{
    fullName: string | null;
    username: string;
  } | null>(null);

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
    if (name && name.toLowerCase() !== 'system') {
      return t(`greeting${timeOfDay}_name` as any, { name });
    }
    return t(`greeting${timeOfDay}` as any);
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
      <Text size="xl" fw={600} mt="md" mb={4}>
        {getGreetingData()}
      </Text>
      <Text size="md" c="dimmed">
        {t('howCanIHelp')}
      </Text>
    </Box>
  );
}
