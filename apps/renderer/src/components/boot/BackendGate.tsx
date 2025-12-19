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

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Anchor,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  useComputedColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import { IconAlertTriangle, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';

import { isBackendReady, startBackend, waitForBackend } from '@/core/ipc/rpc';

import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { os } from '@neutralinojs/lib';

import { useTranslation } from 'react-i18next';
import { backendRpc } from '@/core/ipc/backend';
import { useServersStore } from '@/core/store/servers';
import { useLocalFilesStore } from '@/core/store/localFiles';
import { getDownloadUrl, useUpdateStore } from '@/core/store/updates';

type Phase = 'idle' | 'starting' | 'waiting' | 'ready' | 'error';

interface BackendGateProps {
  children: ReactNode;
  // Optional: how long to keep the loader before retry kicks in
  maxWaitMs?: number; // default: 15_000
  // Optional: polling interval while waiting
  pollIntervalMs?: number; // default: 400
}

function generateWorkspaceId() {
  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
}

export function BackendGate({
  children,
  maxWaitMs = 15000,
  pollIntervalMs = 400,
}: BackendGateProps) {
  const { t } = useTranslation('common');
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(5);
  const [message, setMessage] = useState<string>('');
  const [showChildren, setShowChildren] = useState(false);
  const timer = useRef<number | null>(null);
  const progressRef = useRef<number>(5);
  const animationFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const workspaceLoadedRef = useRef<boolean>(false);
  const [workspaceId, setWorkspaceId] = useState<string>(() => generateWorkspaceId());

  const neutralino = useMemo(() => isNeutralinoMode(), []);
  const setServers = useServersStore(state => state.setServers);
  const setLoading = useServersStore(state => state.setLoading);
  const setError = useServersStore(state => state.setError);
  const setLocalFilesPage = useLocalFilesStore(state => state.setPage);
  const setLocalFilesLoading = useLocalFilesStore(state => state.setLoading);
  const setLocalFilesError = useLocalFilesStore(state => state.setError);
  const setLocalFilesInitialized = useLocalFilesStore(state => state.setInitialized);
  const setLocalFilesLoadingMore = useLocalFilesStore(state => state.setLoadingMore);
  const checkForUpdates = useUpdateStore(state => state.checkForUpdates);
  const markNotified = useUpdateStore(state => state.markNotified);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Continuously refresh the display NodeRef while we're still booting/loading
  useEffect(() => {
    if (phase === 'ready') {
      return;
    }
    const intervalId = window.setInterval(() => {
      setWorkspaceId(generateWorkspaceId());
    }, 600);
    return () => window.clearInterval(intervalId);
  }, [phase]);

  const animateToComplete = useRef<((startValue: number, onComplete: () => void) => void) | null>(
    null
  );

  if (!animateToComplete.current) {
    animateToComplete.current = (startValue: number, onComplete: () => void) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const duration = 500;
      const startTime = Date.now();
      const startProgress = startValue;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progressRatio = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progressRatio, 3);
        const currentValue = startProgress + (100 - startProgress) * eased;

        setProgress(currentValue);

        if (progressRatio < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setProgress(100);
          animationFrameRef.current = null;
          onComplete();
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };
  }

  const completeProgress = useCallback(() => {
    const currentProgress = progressRef.current;
    animateToComplete.current!(currentProgress, () => {
      timeoutRef.current = window.setTimeout(() => {
        setShowChildren(true);
      }, 200);
    });
  }, []);

  // Load workspace data when backend is ready
  useEffect(() => {
    if (phase === 'ready' && isBackendReady() && !workspaceLoadedRef.current) {
      workspaceLoadedRef.current = true;
      setLoading(true);
      setError(null);
      setLocalFilesLoading(true);
      setLocalFilesError(null);
      backendRpc
        .loadWorkspace()
        .then(workspace => {
          setServers(workspace.servers || []);
          if (workspace.localFiles) {
            setLocalFilesPage(workspace.localFiles, true);
          } else {
            setLocalFilesPage(
              {
                items: [],
                pagination: { totalItems: 0, skipCount: 0, maxItems: 20, hasMoreItems: false },
              },
              true
            );
          }
          setLocalFilesInitialized(true);
          setLoading(false);
          setLocalFilesLoading(false);
          setLocalFilesLoadingMore(false);
        })
        .catch(err => {
          console.error('Failed to load workspace:', err);
          setError(err instanceof Error ? err.message : 'Failed to load workspace');
          setServers([]); // Set empty array on error
          setLoading(false);
          setLocalFilesPage(
            {
              items: [],
              pagination: { totalItems: 0, skipCount: 0, maxItems: 20, hasMoreItems: false },
            },
            true
          );
          setLocalFilesInitialized(true);
          setLocalFilesLoading(false);
          setLocalFilesLoadingMore(false);
          setLocalFilesError(err instanceof Error ? err.message : 'Failed to load workspace');
        });
    }
  }, [
    phase,
    setServers,
    setLoading,
    setError,
    setLocalFilesLoading,
    setLocalFilesError,
    setLocalFilesInitialized,
    setLocalFilesPage,
    setLocalFilesLoadingMore,
  ]);

  // Once the backend is up, quietly check for app updates
  useEffect(() => {
    if (phase !== 'ready') {
      return;
    }

    let cancelled = false;

    const runUpdateCheck = async () => {
      await checkForUpdates();
      if (cancelled) return;

      const state = useUpdateStore.getState();
      const latestVersion = state.latestRelease?.version;
      if (!state.hasUpdate || !latestVersion || state.lastNotifiedVersion === latestVersion) {
        return;
      }

      const downloadTarget = getDownloadUrl(state.latestRelease);

      const handleDownloadClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (isNeutralinoMode()) {
          try {
            await ensureNeutralinoReady();
            await os.open(downloadTarget);
            return;
          } catch (error) {
            console.warn('Neutralino open failed, falling back to window.open', error);
          }
        }
        window.open(downloadTarget, '_blank', 'noreferrer');
      };

      notifications.show({
        title: t('common:updateAvailable'),
        message: (
          <Anchor
            href={downloadTarget}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleDownloadClick}
          >
            {t('common:updateAvailableMessage', { version: latestVersion })}
          </Anchor>
        ),
        color: 'blue',
        withCloseButton: true,
        autoClose: 9000,
      });

      markNotified(latestVersion);
    };

    void runUpdateCheck();

    return () => {
      cancelled = true;
    };
  }, [phase, checkForUpdates, markNotified, t]);

  useEffect(() => {
    let cancelled = false;

    const tickProgress = () => {
      setProgress(p => {
        const newValue = Math.min(95, p + Math.max(1, (100 - p) * 0.07));
        progressRef.current = newValue;
        return newValue;
      });
    };

    const poll = async () => {
      if (isBackendReady()) {
        if (!cancelled) {
          setPhase('ready');
          completeProgress();
        }
        return;
      }

      setPhase('starting');
      setMessage(neutralino ? t('backendStartingLocal') : t('backendWaiting'));

      try {
        await startBackend();
      } catch {
        // Continue to waitForBackend even if startBackend fails
      }

      setPhase('waiting');
      setMessage(t('backendCheckingHealth'));

      const waitPromise = waitForBackend(60, pollIntervalMs);
      const uiTicker = window.setInterval(tickProgress, 300);
      timer.current = uiTicker;

      try {
        await waitPromise;
      } finally {
        if (timer.current) {
          window.clearInterval(timer.current);
          timer.current = null;
        }
      }

      if (!cancelled && isBackendReady()) {
        setMessage(t('backendReady'));
        setPhase('ready');
        completeProgress();
      } else if (!cancelled) {
        setPhase('error');
        setMessage(t('backendTimeout'));
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer.current) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [neutralino, pollIntervalMs, completeProgress, t]);

  useEffect(() => {
    if (!(phase === 'waiting' || phase === 'starting')) {
      return;
    }

    if (!maxWaitMs || maxWaitMs <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!isBackendReady()) {
        setMessage(neutralino ? t('backendSlowNeutralino') : t('backendSlowBrowser'));
      }
    }, maxWaitMs);

    return () => window.clearTimeout(timeoutId);
  }, [phase, maxWaitMs, neutralino, t]);

  if (showChildren && phase === 'ready' && isBackendReady()) {
    return <>{children}</>;
  }

  // Boot/Retry screen
  return (
    <Center h="100%" w="100%">
      <Paper p="lg" w={520} withBorder>
        <Stack gap="md">
          <Group align="center" gap="sm">
            <img
              src="/assets/logo2.svg"
              alt={t('appNameShort')}
              style={{
                display: 'block',
                height: 32,
                filter: computedColorScheme === 'dark' ? 'invert(1)' : 'none',
              }}
            />
          </Group>
          <Text size="sm" c="dimmed" lh={1.4}>
            workspace://SpacesStore/{workspaceId}
          </Text>

          {(phase === 'starting' || phase === 'waiting' || phase === 'ready') && (
            <>
              <Text size="sm" c="dimmed">
                {message || t('initializing')}
              </Text>
              <Progress value={progress} />
              <Group gap="sm">
                <Loader size="sm" />
                <Text size="sm">
                  {neutralino ? t('installerEnvironment') : t('browserEnvironment')}
                </Text>
              </Group>
            </>
          )}

          {phase === 'error' && (
            <>
              <Alert variant="light" color="red" icon={<IconAlertTriangle size={16} />}>
                <Text fw={600} mb={4}>
                  {t('backendUnreachable')}
                </Text>
                <Text size="sm">{message || t('backendUnreachableDescription')}</Text>
              </Alert>
              <Group justify="space-between">
                <Button
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={async () => {
                    setShowChildren(false);
                    setPhase('starting');
                    setProgress(5);
                    progressRef.current = 5;
                    setMessage(t('backendRetrying'));
                    try {
                      await startBackend();
                    } catch {
                      // Continue to waitForBackend
                    }
                    await waitForBackend(60, pollIntervalMs);
                    if (isBackendReady()) {
                      setPhase('ready');
                      completeProgress();
                    } else {
                      setPhase('error');
                      setMessage(t('backendStillUnhealthy'));
                    }
                  }}
                >
                  {t('retry')}
                </Button>
                <Button
                  variant="subtle"
                  leftSection={<IconRefresh size={16} />}
                  onClick={() => window.location.reload()}
                >
                  {t('reload')}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
