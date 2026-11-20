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
import { alfrescoRpc } from '@/core/ipc/alfresco';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { getRpcBaseUrl } from '@/core/ipc/rpc';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import {
  useDesktopClipboardHandlers,
  type EditableTarget,
} from '@/hooks/useDesktopClipboardHandlers';
import { useModal } from '@/hooks/useModal';
import type { PublicServer } from '@app/contracts';
import {
  constructOidcAuthUrl,
  ensureProtocol,
  generatePKCE,
  generateState,
  monitorPopupClosure,
  OIDC_AUTH_TIMEOUT,
  openOidcPopup,
} from '@/utils/oidcAuth';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { os } from '@neutralinojs/lib';
import { IconAlertCircle, IconLock, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ReauthModalPayload {
  serverId: number;
  serverName?: string;
}

const getFieldName = (element: HTMLElement): string =>
  element.getAttribute('data-field') ||
  element.getAttribute('name') ||
  element.closest('[data-field]')?.getAttribute('data-field') ||
  '';

/**
 * Modal for re-authenticating with an OIDC server when tokens have expired.
 * Reuses the OIDC authentication flow from AddServerModal but for existing servers.
 */
export function ReauthModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.REAUTH);
  const { t } = useTranslation(['common', 'settings', 'addServer']);
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [server, setServer] = useState<PublicServer | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const pollingIntervalRef = useRef<number | null>(null);
  const popupCheckIntervalRef = useRef<number | null>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const updateServer = useServersStore(state => state.updateServer);
  const isDesktopMode = useMemo(
    () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
    []
  );

  const readFieldValue = (field: 'username' | 'password'): string => {
    const fromState = field === 'username' ? username : password;
    if (fromState) return fromState;
    return (
      modalContentRef.current?.querySelector<HTMLInputElement>(`input[name="${field}"]`)?.value ??
      ''
    );
  };

  const handleInsertText = useCallback((editableTarget: EditableTarget, text: string) => {
    if (
      editableTarget instanceof HTMLInputElement ||
      editableTarget instanceof HTMLTextAreaElement
    ) {
      const { selectionStart, selectionEnd, value } = editableTarget;
      const start = selectionStart ?? value.length;
      const end = selectionEnd ?? value.length;
      const newValue = value.slice(0, start) + text + value.slice(end);
      const cursorPos = start + text.length;
      const fieldName = getFieldName(editableTarget);

      const nativeSetter = Object.getOwnPropertyDescriptor(
        editableTarget instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(editableTarget, newValue);
      editableTarget.dispatchEvent(new Event('input', { bubbles: true }));

      if (fieldName === 'password' || editableTarget.type === 'password') {
        setPassword(newValue);
      } else if (fieldName === 'username' || editableTarget.type === 'text') {
        setUsername(newValue);
      }

      setTimeout(() => {
        try {
          if (document.activeElement === editableTarget) {
            editableTarget.setSelectionRange(cursorPos, cursorPos);
          }
        } catch {
          // Password inputs in some webviews do not support selection ranges.
        }
      }, 0);
    } else if (editableTarget.isContentEditable) {
      document.execCommand('insertText', false, text);
    }
  }, []);

  useDesktopClipboardHandlers({
    isEnabled: isOpen && isDesktopMode,
    containerRef: modalContentRef,
    onInsertText: handleInsertText,
    enableCopyCut: true,
    enableReadOnlyCopy: true,
  });

  const modalPayload = payload as ReauthModalPayload | undefined;
  const serverId = modalPayload?.serverId;
  const serverName = server?.name || modalPayload?.serverName || 'this server';
  const isBasicFlow = server?.authType === 'basic';
  const isOidcFlow = server?.authType === 'openid_connect';

  // Cleanup intervals on unmount or close
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (popupCheckIntervalRef.current) {
        clearInterval(popupCheckIntervalRef.current);
      }
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAuthenticating(false);
      setAuthenticated(false);
      setUsername('');
      setPassword('');
      if (serverId) {
        setServerLoading(true);
        backendRpc.servers
          .get(serverId)
          .then(setServer)
          .catch(error => {
            console.error('Failed to load server for re-auth:', error);
            notifications.show({
              title: t('common:error'),
              message: error instanceof Error ? error.message : 'Failed to load server details',
              color: 'red',
            });
          })
          .finally(() => setServerLoading(false));
      }
    }
  }, [isOpen, serverId]);

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
    setServer(null);
    setUsername('');
    setPassword('');
    close();
  }, [close]);

  const handleReauthenticate = async () => {
    if (!serverId || !server) {
      notifications.show({
        title: t('common:error'),
        message: 'Server not found',
        color: 'red',
      });
      return;
    }

    if (isBasicFlow) {
      const submittedUsername = readFieldValue('username').trim();
      const submittedPassword = readFieldValue('password').trim();
      if (!submittedPassword) {
        notifications.show({
          title: t('common:error'),
          message: 'Please enter your password.',
          color: 'red',
        });
        return;
      }

      setAuthenticating(true);

      try {
        const updatedServer = await backendRpc.servers.reauthBasic(serverId, {
          username: submittedUsername || undefined,
          password: submittedPassword,
        });

        updateServer(serverId, updatedServer);
        setAuthenticated(true);
        setAuthenticating(false);

        window.dispatchEvent(new CustomEvent('reauth-success', { detail: { serverId } }));

        notifications.show({
          title: t('settings:reauthSuccess'),
          message: t('settings:reauthSuccessMessage'),
          color: 'green',
        });

        setTimeout(() => {
          handleClose();
        }, 1500);
      } catch (error) {
        console.error('Basic re-authentication error:', error);
        setAuthenticating(false);
        notifications.show({
          title: t('common:error'),
          message: error instanceof Error ? error.message : 'Failed to update credentials',
          color: 'red',
        });
      }
      return;
    }

    // OIDC flow
    setAuthenticating(true);

    try {
      if (!isOidcFlow) {
        throw new Error('Server does not use OIDC authentication');
      }

      if (!server.oidcHost || !server.oidcRealm || !server.oidcClientId) {
        throw new Error('Server is missing OIDC configuration');
      }

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

              let nextServer = updatedServer;
              try {
                const adminStatus = await backendRpc.servers.refreshAdminStatus(serverId);
                nextServer = { ...updatedServer, isAdmin: adminStatus.isAdmin };
              } catch (adminError) {
                console.error('Failed to refresh admin status after reauth:', adminError);
              }

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

              updateServer(serverId, nextServer);

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
              if (pollInterval) {
                clearInterval(pollInterval);
              }
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
      const authTimeout = setTimeout(() => {
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
      authTimeoutRef.current = authTimeout;
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
      <div ref={modalContentRef} style={{ display: 'contents' }}>
        <Stack gap="md">
          <Alert icon={<IconAlertCircle size={16} />} color="orange" variant="light">
            <Text size="sm">{t('settings:reauthDescription', { serverName })}</Text>
          </Alert>

          {serverLoading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                {t('common:loading')}
              </Text>
            </Group>
          ) : authenticated ? (
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
          ) : isBasicFlow ? (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Enter your Alfresco credentials to refresh access for {serverName}.
              </Text>
              <TextInput
                label={t('addServer:username')}
                placeholder="Leeg laten om de opgeslagen gebruikersnaam te gebruiken"
                name="username"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.currentTarget.value)}
                disabled={authenticating}
                data-field="username"
              />
              <PasswordInput
                label={t('addServer:password')}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.currentTarget.value)}
                disabled={authenticating}
                data-field="password"
              />
            </Stack>
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
              disabled={authenticated || serverLoading}
            >
              {t('settings:signInAgain')}
            </Button>
          </Group>
        </Stack>
      </div>
    </Modal>
  );
}
