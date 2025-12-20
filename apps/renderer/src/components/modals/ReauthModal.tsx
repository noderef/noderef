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

import { backendRpc } from '@/core/ipc/backend';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import {
  constructOidcAuthUrl,
  ensureProtocol,
  generatePKCE,
  generateState,
  monitorPopupClosure,
  OIDC_AUTH_TIMEOUT,
  openOidcPopup,
} from '@/utils/oidcAuth';
import { Alert, Button, Group, Loader, Modal, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconLock, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ReauthModalPayload {
  serverId: number;
  serverName?: string;
}

/**
 * Modal for re-authenticating with an OIDC server when tokens have expired.
 * Reuses the OIDC authentication flow from AddServerModal but for existing servers.
 */
export function ReauthModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.REAUTH);
  const { t } = useTranslation(['common', 'settings']);
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);
  const popupCheckIntervalRef = useRef<number | null>(null);
  const updateServer = useServersStore(state => state.updateServer);

  const modalPayload = payload as ReauthModalPayload | undefined;
  const serverId = modalPayload?.serverId;
  const serverName = modalPayload?.serverName || 'this server';

  // Cleanup intervals on unmount or close
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (popupCheckIntervalRef.current) {
        clearInterval(popupCheckIntervalRef.current);
      }
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAuthenticating(false);
      setAuthenticated(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (popupCheckIntervalRef.current) {
      clearInterval(popupCheckIntervalRef.current);
      popupCheckIntervalRef.current = null;
    }
    setAuthenticating(false);
    setAuthenticated(false);
    close();
  }, [close]);

  const handleReauthenticate = async () => {
    if (!serverId) {
      notifications.show({
        title: t('common:error'),
        message: 'Server ID not found',
        color: 'red',
      });
      return;
    }

    setAuthenticating(true);

    try {
      // Get server details from backend to retrieve OIDC config
      const server = await backendRpc.servers.get(serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      if (server.authType !== 'openid_connect') {
        throw new Error('Server does not use OIDC authentication');
      }

      if (!server.oidcHost || !server.oidcRealm || !server.oidcClientId) {
        throw new Error('Server is missing OIDC configuration');
      }

      // Import required modules
      const { alfrescoRpc } = await import('@/core/ipc/alfresco');
      const { getRpcBaseUrl } = await import('@/core/ipc/rpc');

      // Normalize OIDC host URL
      const normalizedOidcHost = ensureProtocol(server.oidcHost);

      const isDesktop = isNeutralinoMode();
      let popup: Window | null = null;

      // Open popup immediately in browser mode
      if (!isDesktop) {
        popup = openOidcPopup('oidc-reauth');
        if (!popup) {
          throw new Error('Please allow popups for this site and try again.');
        }
      }

      // Generate PKCE challenge
      const { codeVerifier, codeChallenge } = await generatePKCE();

      // Construct redirect URI from backend URL
      const rpcUrl = getRpcBaseUrl();
      const backendPort = parseInt(new URL(rpcUrl).port, 10);
      const redirectUri = `http://127.0.0.1:${backendPort}/auth/callback`;

      // Generate state and store session data
      const state = generateState();
      sessionStorage.setItem(`reauth_pkce_verifier_${state}`, codeVerifier);
      sessionStorage.setItem(`reauth_server_id_${state}`, serverId.toString());
      sessionStorage.setItem(`reauth_oidc_host_${state}`, normalizedOidcHost);
      sessionStorage.setItem(`reauth_oidc_realm_${state}`, server.oidcRealm);
      sessionStorage.setItem(`reauth_oidc_client_id_${state}`, server.oidcClientId);
      sessionStorage.setItem(`reauth_redirect_uri_${state}`, redirectUri);

      // Construct authorization URL
      const authUrl = constructOidcAuthUrl({
        oidcHost: normalizedOidcHost,
        oidcRealm: server.oidcRealm,
        clientId: server.oidcClientId,
        redirectUri,
        state,
        codeChallenge,
      });

      // eslint-disable-next-line no-console
      console.log('[ReauthModal] Re-authentication flow started:', {
        serverId,
        serverName: server.name,
        state,
        redirectUri,
        oidcHost: normalizedOidcHost,
        realm: server.oidcRealm,
        authUrl: authUrl.toString(),
      });

      // Open auth URL
      if (isDesktop) {
        const { os } = await import('@neutralinojs/lib');
        await os.open(authUrl.toString());
      } else if (popup && !popup.closed) {
        popup.location.href = authUrl.toString();
      }

      // Poll for authorization code
      const pollInterval = setInterval(async () => {
        try {
          const result = await alfrescoRpc.pollOAuth2Code({});
          if (result.code && result.state === state) {
            clearInterval(pollInterval);
            pollingIntervalRef.current = null;

            if (popupCheckIntervalRef.current) {
              clearInterval(popupCheckIntervalRef.current);
              popupCheckIntervalRef.current = null;
            }

            if (popup && !popup.closed) {
              popup.close();
            }

            // eslint-disable-next-line no-console
            console.log('[ReauthModal] Authorization code received, exchanging for tokens...');

            // Retrieve stored values
            const storedCodeVerifier = sessionStorage.getItem(`reauth_pkce_verifier_${state}`);
            const storedOidcHost = sessionStorage.getItem(`reauth_oidc_host_${state}`);
            const storedOidcRealm = sessionStorage.getItem(`reauth_oidc_realm_${state}`);
            const storedOidcClientId = sessionStorage.getItem(`reauth_oidc_client_id_${state}`);
            const storedRedirectUri = sessionStorage.getItem(`reauth_redirect_uri_${state}`);

            if (
              !storedCodeVerifier ||
              !storedOidcHost ||
              !storedOidcRealm ||
              !storedOidcClientId ||
              !storedRedirectUri
            ) {
              throw new Error('Missing re-authentication data');
            }

            // eslint-disable-next-line no-console
            console.log('[ReauthModal] Exchanging token with params:', {
              baseUrl: server.baseUrl,
              clientId: storedOidcClientId,
              host: storedOidcHost,
              realm: storedOidcRealm,
              redirectUri: storedRedirectUri,
              hasCodeVerifier: !!storedCodeVerifier,
              hasCode: !!result.code,
              codeLength: result.code?.length,
            });

            // Exchange code for tokens
            try {
              const tokenResponse = await alfrescoRpc.exchangeOAuth2Token({
                baseUrl: server.baseUrl,
                clientId: storedOidcClientId,
                host: storedOidcHost,
                realm: storedOidcRealm,
                code: result.code,
                redirectUri: storedRedirectUri,
                codeVerifier: storedCodeVerifier,
              });

              // eslint-disable-next-line no-console
              console.log('[ReauthModal] Token exchange successful, updating server...');

              // Update server with new tokens via backend RPC
              const updatedServer = await backendRpc.servers.updateOidcTokens(serverId, {
                accessToken: tokenResponse.accessToken,
                refreshToken: tokenResponse.refreshToken ?? undefined,
                expiresIn: tokenResponse.expiresIn,
              });

              // eslint-disable-next-line no-console
              console.log('[ReauthModal] Server tokens updated successfully');

              // Clean up session storage
              sessionStorage.removeItem(`reauth_pkce_verifier_${state}`);
              sessionStorage.removeItem(`reauth_server_id_${state}`);
              sessionStorage.removeItem(`reauth_oidc_host_${state}`);
              sessionStorage.removeItem(`reauth_oidc_realm_${state}`);
              sessionStorage.removeItem(`reauth_oidc_client_id_${state}`);
              sessionStorage.removeItem(`reauth_redirect_uri_${state}`);

              setAuthenticated(true);
              setAuthenticating(false);

              updateServer(serverId, updatedServer);

              // Trigger repository reload by dispatching a custom event
              window.dispatchEvent(new CustomEvent('reauth-success', { detail: { serverId } }));

              notifications.show({
                title: t('settings:reauthSuccess'),
                message: t('settings:reauthSuccessMessage'),
                color: 'green',
              });

              // Auto-close after 1.5 seconds
              setTimeout(() => {
                handleClose();
              }, 1500);
            } catch (exchangeError) {
              console.error('Token exchange error:', exchangeError);
              clearInterval(pollInterval);
              pollingIntervalRef.current = null;
              setAuthenticating(false);

              const errorMessage =
                exchangeError instanceof Error ? exchangeError.message : 'Token exchange failed';

              notifications.show({
                title: t('common:error'),
                message: `${errorMessage}. ${t('settings:reauthInstructions')}`,
                color: 'red',
                autoClose: 10000,
              });
            }
          }
        } catch (error) {
          console.error('Error during re-authentication polling:', error);
          // Don't stop polling on individual errors, just log them
        }
      }, 1000);

      pollingIntervalRef.current = pollInterval as unknown as number;

      // Monitor popup closure (browser mode only)
      if (popup && !isDesktop) {
        const popupCheckInterval = monitorPopupClosure(popup, () => {
          clearInterval(pollInterval);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setAuthenticating(false);

          notifications.show({
            title: 'Authentication Cancelled',
            message: 'Login window was closed.',
            color: 'yellow',
          });
        });

        popupCheckIntervalRef.current = popupCheckInterval;
      }

      // Authentication timeout
      setTimeout(() => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        if (popupCheckIntervalRef.current) {
          clearInterval(popupCheckIntervalRef.current);
          popupCheckIntervalRef.current = null;
        }
        if (authenticating && !authenticated) {
          setAuthenticating(false);
          notifications.show({
            title: 'Authentication Timeout',
            message: 'The login process took too long. Please try again.',
            color: 'red',
          });
        }
      }, OIDC_AUTH_TIMEOUT);
    } catch (error) {
      console.error('Re-authentication error:', error);
      setAuthenticating(false);
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : 'Failed to re-authenticate',
        color: 'red',
      });
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <ThemeIcon size="lg" radius="md" variant="light" color="orange">
            <IconLock size={18} />
          </ThemeIcon>
          <Title order={4}>{t('settings:reauthRequired')}</Title>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
          <Text size="sm">{t('settings:reauthDescription', { serverName })}</Text>
        </Alert>

        {authenticated ? (
          <Alert icon={<IconRefresh size={16} />} color="green" variant="light">
            <Text size="sm" fw={500}>
              {t('settings:reauthSuccessMessage')}
            </Text>
          </Alert>
        ) : authenticating ? (
          <Group justify="center" py="xl">
            <Loader size="md" />
            <Text size="sm" c="dimmed">
              {t('settings:waitingForAuth')}
            </Text>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {t('settings:reauthInstructions')}
          </Text>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={handleClose} disabled={authenticating}>
            {t('common:cancel')}
          </Button>
          <Button
            leftSection={<IconLock size={16} />}
            onClick={handleReauthenticate}
            loading={authenticating}
            disabled={authenticated}
          >
            {t('settings:signInAgain')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
