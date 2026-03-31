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

import { backendFetch, getRpcBaseUrl, waitForBackend } from '@/core/ipc/rpc';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Text,
  useComputedColorScheme,
} from '@mantine/core';
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

type Phase = 'checking' | 'prompt' | 'submitting' | 'ready' | 'error';

interface WebAuthStatusResponse {
  required: boolean;
  authenticated: boolean;
}

interface WebPasswordGateProps {
  children: ReactNode;
}

export function WebPasswordGate({ children }: WebPasswordGateProps) {
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const neutralino = useMemo(() => isNeutralinoMode(), []);

  const readStatus = useCallback(async (): Promise<WebAuthStatusResponse> => {
    await waitForBackend(60, 250);

    const response = await backendFetch(`${getRpcBaseUrl()}/web-auth/status`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to check web auth status (${response.status})`);
    }

    return (await response.json()) as WebAuthStatusResponse;
  }, []);

  const refreshGateStatus = useCallback(async () => {
    if (neutralino) {
      setPhase('ready');
      return;
    }

    setError(null);
    setPhase('checking');

    try {
      const status = await readStatus();
      if (!status.required || status.authenticated) {
        setPhase('ready');
        return;
      }
      setPhase('prompt');
    } catch (statusError) {
      const message =
        statusError instanceof Error ? statusError.message : 'Unable to reach backend.';
      setError(message);
      setPhase('error');
    }
  }, [neutralino, readStatus]);

  useEffect(() => {
    void refreshGateStatus();
  }, [refreshGateStatus]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!password.trim()) {
        setError('Password is required.');
        return;
      }

      setError(null);
      setPhase('submitting');

      try {
        const response = await backendFetch(`${getRpcBaseUrl()}/web-auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message || 'Login failed.');
        }

        setPassword('');
        await refreshGateStatus();
      } catch (loginError) {
        const message = loginError instanceof Error ? loginError.message : 'Login failed.';
        setError(message);
        setPhase('prompt');
      }
    },
    [password, refreshGateStatus]
  );

  if (phase === 'ready') {
    return <>{children}</>;
  }

  return (
    <Center h="100%" w="100%">
      <Paper p="lg" w={420} withBorder>
        <Stack gap="md">
          <Group align="center" gap="sm">
            <img
              src="/assets/logo2.svg"
              alt="NodeRef"
              style={{
                display: 'block',
                height: 32,
                filter: computedColorScheme === 'dark' ? 'invert(1)' : 'none',
              }}
            />
          </Group>

          {(phase === 'checking' || phase === 'submitting') && (
            <Group gap="sm" align="center">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                {phase === 'submitting' ? 'Signing in...' : 'Checking access...'}
              </Text>
            </Group>
          )}

          {phase === 'error' && (
            <>
              <Alert variant="light" color="red" icon={<IconAlertTriangle size={16} />}>
                <Text fw={600}>Access check failed</Text>
                <Text size="sm">{error || 'Unable to reach backend.'}</Text>
              </Alert>
              <Button onClick={() => void refreshGateStatus()}>Retry</Button>
            </>
          )}

          {phase === 'prompt' && (
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  This NodeRef web deployment is password protected.
                </Text>
                <PasswordInput
                  label="Password"
                  placeholder="Enter deployment password"
                  value={password}
                  onChange={event => setPassword(event.currentTarget.value)}
                  leftSection={<IconLock size={16} />}
                  autoFocus
                />
                {error && (
                  <Alert variant="light" color="red" icon={<IconAlertTriangle size={16} />}>
                    <Text size="sm">{error}</Text>
                  </Alert>
                )}
                <Button type="submit">Unlock NodeRef</Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
