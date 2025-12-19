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

import { alfrescoRpc } from '@/core/ipc/alfresco';
import { backendRpc, refreshWorkspace } from '@/core/ipc/backend';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { getRpcBaseUrl } from '@/core/ipc/rpc';
import type { ServerType } from '@/core/store/keys';
import { MODAL_KEYS } from '@/core/store/keys';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import { useNavigation } from '@/hooks/useNavigation';
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { clipboard, os } from '@neutralinojs/lib';
import { IconAlertCircle, IconChevronRight, IconInfoCircle, IconServer } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AddServerStep = 'select-type' | 'configure';
type AuthType = 'basic' | 'openid_connect';

export function AddServerModal() {
  const { isOpen, close } = useModal(MODAL_KEYS.ADD_SERVER);
  const { t } = useTranslation(['addServer', 'common', 'spotlight']);
  const { setActiveServer, navigate } = useNavigation();
  const setServers = useServersStore(state => state.setServers);
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const [step, setStep] = useState<AddServerStep>('select-type');
  const [serverType, setServerType] = useState<ServerType | ''>('');
  const [authType, setAuthType] = useState<AuthType>('basic');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  // Basic auth fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentialsValidating, setCredentialsValidating] = useState(false);
  const [credentialsValid, setCredentialsValid] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // OIDC/OAuth2 fields
  const [oidcHost, setOidcHost] = useState('');
  const [oidcRealm, setOidcRealm] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcAuthenticated, setOidcAuthenticated] = useState(false);
  const [oidcAuthenticating, setOidcAuthenticating] = useState(false);
  const [oidcTokens, setOidcTokens] = useState<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const isDesktopMode = useMemo(
    () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
    []
  );

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('select-type');
      setServerType('');
      setAuthType('basic');
      setName('');
      setBaseUrl('');
      setUsername('');
      setPassword('');
      setCredentialsValidating(false);
      setCredentialsValid(false);
      setIsAdmin(false);
      setValidationError(null);
      setOidcHost('');
      setOidcRealm('');
      setOidcClientId('');
      setOidcAuthenticated(false);
      setOidcAuthenticating(false);
      setOidcTokens(null);
      setLoading(false);
    }
  }, [isOpen]);

  // Track previous OIDC config values to detect actual changes
  const prevOidcConfig = useRef({ authType, oidcHost, oidcRealm, oidcClientId });

  // Reset OIDC authentication when auth type or OIDC fields actually change
  // Note: baseUrl is intentionally excluded - changing Alfresco URL doesn't invalidate OIDC auth
  useEffect(() => {
    const prev = prevOidcConfig.current;
    const configChanged =
      prev.authType !== authType ||
      prev.oidcHost !== oidcHost ||
      prev.oidcRealm !== oidcRealm ||
      prev.oidcClientId !== oidcClientId;

    // Only reset if configuration actually changed (not just re-rendered)
    if (configChanged && oidcAuthenticated) {
      setOidcAuthenticated(false);
      setOidcTokens(null);
    }

    // Update the ref for next comparison
    prevOidcConfig.current = { authType, oidcHost, oidcRealm, oidcClientId };
  }, [authType, oidcHost, oidcRealm, oidcClientId, oidcAuthenticated]);

  // Custom paste handling for desktop mode to prevent duplicate pastes on Windows
  // In browser mode, native paste behavior works correctly without custom handlers
  useEffect(() => {
    if (!isOpen || !isDesktopMode) {
      return;
    }
    const getEditableTarget = (
      target: EventTarget | null
    ): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null => {
      if (!target) return null;
      let node: HTMLElement | null = null;
      if (target instanceof HTMLElement) {
        node = target;
      } else if (target instanceof Node && target.parentElement) {
        node = target.parentElement;
      }
      while (node) {
        if (
          node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement ||
          node.isContentEditable
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    // Use a processing flag to prevent concurrent paste operations
    let isProcessingPaste = false;

    const readClipboardText = async (event?: ClipboardEvent): Promise<string | null> => {
      const clipboardData = event?.clipboardData || (window as any).clipboardData;
      const textFromEvent = clipboardData?.getData?.('text/plain');
      if (textFromEvent) return textFromEvent;

      if (isDesktopMode) {
        try {
          await ensureNeutralinoReady();
          const neutralinoText = await clipboard.readText();
          if (neutralinoText) return neutralinoText;
        } catch (error) {
          console.error('Neutralino clipboard read failed:', error);
        }
      }

      if (navigator.clipboard?.readText) {
        try {
          const navigatorText = await navigator.clipboard.readText();
          if (navigatorText) return navigatorText;
        } catch {
          // Ignore
        }
      }

      return null;
    };

    const insertText = (
      editableTarget: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
      text: string
    ) => {
      if (
        editableTarget instanceof HTMLInputElement ||
        editableTarget instanceof HTMLTextAreaElement
      ) {
        const { selectionStart, selectionEnd, value } = editableTarget;
        const start = selectionStart ?? value.length;
        const end = selectionEnd ?? value.length;
        const newValue = value.slice(0, start) + text + value.slice(end);
        const cursorPos = start + text.length;

        // Identify the field using data-field attribute and update React state
        const fieldName = editableTarget.getAttribute('data-field') || '';

        switch (fieldName) {
          case 'name':
            setName(newValue);
            break;
          case 'baseUrl':
            setBaseUrl(newValue);
            break;
          case 'username':
            setUsername(newValue);
            break;
          case 'password':
            setPassword(newValue);
            break;
          case 'oidcHost':
            setOidcHost(newValue);
            break;
          case 'oidcRealm':
            setOidcRealm(newValue);
            break;
          case 'oidcClientId':
            setOidcClientId(newValue);
            break;
        }

        // Update cursor position after React updates the DOM
        // Use setTimeout to ensure React has rendered the new value
        setTimeout(() => {
          if (document.activeElement === editableTarget) {
            editableTarget.setSelectionRange(cursorPos, cursorPos);
          }
        }, 0);
      } else if (editableTarget.isContentEditable) {
        document.execCommand('insertText', false, text);
      }
    };

    const handlePaste = async (event: ClipboardEvent) => {
      // If already processing a paste, immediately block this one
      if (isProcessingPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const container = modalContentRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget) return;
      if (!container.contains(editableTarget)) return;

      // Prevent default BEFORE async operations
      event.preventDefault();
      event.stopPropagation();

      // Set flag immediately to block concurrent operations
      isProcessingPaste = true;

      try {
        const text = await readClipboardText(event);
        if (text) {
          insertText(editableTarget, text);
        }
      } finally {
        // Clear flag after a short delay to prevent rapid duplicate events
        setTimeout(() => {
          isProcessingPaste = false;
        }, 50);
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'v') return;

      // If already processing a paste, immediately block this one
      if (isProcessingPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const container = modalContentRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget || !container.contains(editableTarget)) {
        return;
      }

      // Prevent default BEFORE async operations
      event.preventDefault();
      event.stopPropagation();

      // Set flag immediately to block concurrent operations
      isProcessingPaste = true;

      try {
        const text = await readClipboardText();
        if (text) {
          insertText(editableTarget, text);
        }
      } finally {
        // Clear flag after a short delay to prevent rapid duplicate events
        setTimeout(() => {
          isProcessingPaste = false;
        }, 50);
      }
    };

    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, isDesktopMode]);

  // Validate Basic Auth credentials with debouncing
  useEffect(() => {
    if (authType !== 'basic' || !baseUrl || !username || !password) {
      setCredentialsValid(false);
      setIsAdmin(false);
      setValidationError(null);
      return;
    }

    if (!validateUrl(baseUrl)) {
      setCredentialsValid(false);
      setIsAdmin(false);
      setValidationError(null);
      return;
    }

    // Debounce validation
    const timeoutId = setTimeout(async () => {
      setCredentialsValidating(true);
      setValidationError(null);

      try {
        const result = await alfrescoRpc.validateCredentials({
          baseUrl: baseUrl.trim(),
          username: username.trim(),
          password: password.trim(),
        });

        if (result.valid) {
          setCredentialsValid(true);
          setIsAdmin(result.isAdmin || false);
          if (!result.isAdmin) {
            setValidationError('Only admin users can add servers');
          }
        } else {
          setCredentialsValid(false);
          setIsAdmin(false);
          setValidationError(result.error || 'Invalid credentials');
        }
      } catch (error) {
        setCredentialsValid(false);
        setIsAdmin(false);
        setValidationError('Failed to validate credentials');
      } finally {
        setCredentialsValidating(false);
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(timeoutId);
  }, [authType, baseUrl, username, password]);

  const handleCancel = () => {
    close();
  };

  const handleSelectType = (type: ServerType) => {
    setServerType(type);
    setStep('configure');
  };

  const handleBack = () => {
    setStep('select-type');
    setOidcAuthenticated(false);
  };

  const validateUrl = (value: string): boolean => {
    if (!value.trim()) return false;
    try {
      new URL(value.trim());
      return true;
    } catch {
      return false;
    }
  };

  // Helper to ensure URL has a protocol
  const ensureProtocol = (url: string): string => {
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    // Default to http:// if no protocol specified
    return `http://${trimmed}`;
  };

  // Helper function to generate PKCE code verifier and challenge
  const generatePKCE = () => {
    // Generate random code verifier (43-128 characters)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Generate code challenge (SHA-256 hash of verifier, base64url encoded)
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    return crypto.subtle.digest('SHA-256', data).then(hash => {
      const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      return { codeVerifier, codeChallenge };
    });
  };

  const handleOidcLogin = async () => {
    // Validate OIDC fields
    if (!oidcHost.trim() || !oidcRealm.trim() || !oidcClientId.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please fill in all OIDC configuration fields',
        color: 'red',
      });
      return;
    }

    setOidcAuthenticating(true);

    // Open popup IMMEDIATELY (synchronously) to avoid popup blockers
    // We'll set the URL later after async operations complete
    const isDesktop = isNeutralinoMode();
    let popup: Window | null = null;

    if (!isDesktop) {
      // Browser dev mode: open popup window immediately with about:blank
      const width = 500;
      const height = 700;
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

      popup = window.open(
        'about:blank',
        'oidc-login',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=yes,scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        notifications.show({
          title: 'Popup Blocked',
          message: 'Please allow popups for this site and try again.',
          color: 'red',
        });
        setOidcAuthenticating(false);
        return;
      }

      // Show loading message in popup
      popup.document.write(`
        <html>
          <head>
            <title>Authenticating...</title>
            <style>
              body { 
                font-family: system-ui, -apple-system, sans-serif; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0;
                background: #f5f5f5;
              }
              .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .container {
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="spinner"></div>
              <p>Preparing authentication...</p>
            </div>
          </body>
        </html>
      `);
    }

    // Declare popup check interval at function scope so it can be accessed everywhere
    let popupCheckInterval: number | null = null;

    try {
      // Ensure URLs have protocols
      const normalizedOidcHost = ensureProtocol(oidcHost);
      const normalizedBaseUrl = ensureProtocol(baseUrl);

      // Validate normalized URLs
      if (!validateUrl(normalizedOidcHost)) {
        if (popup) popup.close();
        notifications.show({
          title: 'Validation Error',
          message:
            'Please enter a valid OIDC Host URL (e.g., http://identity:8181 or https://keycloak.example.com)',
          color: 'red',
        });
        setOidcAuthenticating(false);
        return;
      }

      if (!validateUrl(normalizedBaseUrl)) {
        if (popup) popup.close();
        notifications.show({
          title: 'Validation Error',
          message: 'Please enter a valid server URL (e.g., http://localhost:8080/alfresco)',
          color: 'red',
        });
        setOidcAuthenticating(false);
        return;
      }

      // Get the backend URL to construct the redirect URI
      // In production, the backend might be on any random port
      const rpcUrl = getRpcBaseUrl();
      const rpcUrlObj = new URL(rpcUrl);
      const backendPort = parseInt(rpcUrlObj.port, 10);
      const redirectUri = `http://127.0.0.1:${backendPort}/auth/callback`;

      // Generate PKCE parameters
      const { codeVerifier, codeChallenge } = await generatePKCE();

      // Generate state and store all necessary values keyed by state for later retrieval
      const state = Math.random().toString(36).substring(2);
      sessionStorage.setItem(`oidc_pkce_verifier_${state}`, codeVerifier);
      sessionStorage.setItem(`oidc_base_url_${state}`, normalizedBaseUrl);
      sessionStorage.setItem(`oidc_host_${state}`, normalizedOidcHost);
      sessionStorage.setItem(`oidc_realm_${state}`, oidcRealm.trim());
      sessionStorage.setItem(`oidc_client_id_${state}`, oidcClientId.trim());
      sessionStorage.setItem(`oidc_redirect_uri_${state}`, redirectUri);

      // Construct the authorization URL
      // Handle both Keycloak versions:
      // - Legacy (< v17): http://host:port/auth/realms/{realm}/...
      // - Modern (>= v17): http://host:port/realms/{realm}/...
      // If the OIDC Host already ends with /auth, don't add /realms
      // If it doesn't, check if we need to add /auth prefix
      let authBaseUrl = normalizedOidcHost;
      if (!authBaseUrl.endsWith('/auth') && !authBaseUrl.includes('/realms/')) {
        // Try to detect: if it's legacy Keycloak, add /auth prefix
        // For now, we'll add /auth by default to support legacy Keycloak
        // Users can override by including the path in OIDC Host
        authBaseUrl = `${authBaseUrl}/auth`;
      }

      const authUrl = new URL(
        `${authBaseUrl}/realms/${oidcRealm.trim()}/protocol/openid-connect/auth`
      );
      authUrl.searchParams.set('client_id', oidcClientId.trim());
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid profile email offline_access');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      // Open the authorization URL
      try {
        if (isDesktop) {
          // Desktop mode: open in system browser
          await os.open(authUrl.toString());
          notifications.show({
            title: 'Browser Opened',
            message:
              'Please complete the login in your browser. After logging in, you will be redirected back.',
            color: 'blue',
            autoClose: 5000,
          });
        } else {
          // Browser dev mode: navigate the already-open popup to the auth URL
          if (popup && !popup.closed) {
            popup.location.href = authUrl.toString();
            notifications.show({
              title: 'Login Window Ready',
              message: 'Please complete the login in the popup window.',
              color: 'blue',
              autoClose: 5000,
            });
          } else {
            throw new Error('Popup was closed or blocked.');
          }
        }

        // Start polling for the authorization code
        const pollInterval = setInterval(async () => {
          try {
            const result = await alfrescoRpc.pollOAuth2Code({});
            if (result.code && result.state) {
              // Stop all monitoring immediately
              clearInterval(pollInterval);
              if (popupCheckInterval) clearInterval(popupCheckInterval);

              // Close the popup window if it's still open (browser mode only)
              if (popup && !popup.closed) {
                popup.close();
              }

              // Retrieve all stored values using the state key
              const storedCodeVerifier = sessionStorage.getItem(
                `oidc_pkce_verifier_${result.state}`
              );
              const storedBaseUrl = sessionStorage.getItem(`oidc_base_url_${result.state}`);
              const storedHost = sessionStorage.getItem(`oidc_host_${result.state}`);
              const storedRealm = sessionStorage.getItem(`oidc_realm_${result.state}`);
              const storedClientId = sessionStorage.getItem(`oidc_client_id_${result.state}`);
              const storedRedirectUri = sessionStorage.getItem(`oidc_redirect_uri_${result.state}`);

              if (!storedCodeVerifier) {
                throw new Error('PKCE code verifier not found - security error');
              }

              if (
                !storedBaseUrl ||
                !storedHost ||
                !storedRealm ||
                !storedClientId ||
                !storedRedirectUri
              ) {
                throw new Error('Missing OIDC configuration - please try again');
              }

              // Exchange the authorization code for tokens
              try {
                const tokenResponse = await alfrescoRpc.exchangeOAuth2Token({
                  baseUrl: storedBaseUrl,
                  clientId: storedClientId,
                  host: storedHost,
                  realm: storedRealm,
                  code: result.code,
                  redirectUri: storedRedirectUri,
                  codeVerifier: storedCodeVerifier,
                });

                // Store tokens for later use when creating the server
                setOidcTokens({
                  accessToken: tokenResponse.accessToken,
                  refreshToken: tokenResponse.refreshToken,
                  expiresIn: tokenResponse.expiresIn,
                });

                // Clean up session storage
                sessionStorage.removeItem(`oidc_pkce_verifier_${result.state}`);
                sessionStorage.removeItem(`oidc_base_url_${result.state}`);
                sessionStorage.removeItem(`oidc_host_${result.state}`);
                sessionStorage.removeItem(`oidc_realm_${result.state}`);
                sessionStorage.removeItem(`oidc_client_id_${result.state}`);
                sessionStorage.removeItem(`oidc_redirect_uri_${result.state}`);

                // Mark as authenticated - this enables the "Add Server" button
                setOidcAuthenticated(true);
                setOidcAuthenticating(false);

                notifications.show({
                  title: 'Authentication Successful',
                  message: 'OIDC login completed. You can now add the server.',
                  color: 'green',
                });
              } catch (exchangeError) {
                setOidcAuthenticating(false);
                throw exchangeError;
              }
            }
          } catch (pollError) {
            console.error('Error polling for OAuth code:', pollError);
            notifications.show({
              title: 'Authentication Error',
              message:
                pollError instanceof Error
                  ? pollError.message
                  : 'Failed to complete authentication',
              color: 'red',
            });
          }
        }, 1000);

        // Check if popup window is closed (only for browser mode)
        // Note: We give a grace period after popup closes because Keycloak might auto-redirect
        // and close the popup before our polling picks up the code from the backend
        let popupClosedTime: number | null = null;
        if (popup && !isDesktop) {
          popupCheckInterval = setInterval(() => {
            if (popup && popup.closed) {
              if (!popupClosedTime) {
                // Popup just closed - start grace period
                popupClosedTime = Date.now();
              } else if (Date.now() - popupClosedTime > 3000) {
                // Grace period expired - assume user canceled
                clearInterval(pollInterval);
                if (popupCheckInterval) clearInterval(popupCheckInterval);
                setOidcAuthenticating(false);

                notifications.show({
                  title: 'Authentication Cancelled',
                  message: 'Login window was closed. Please try again if you want to authenticate.',
                  color: 'yellow',
                });
              }
              // Otherwise, keep waiting - polling might still get the code
            }
          }, 500);
        }

        // Set a timeout to stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          if (popupCheckInterval) clearInterval(popupCheckInterval);
          if (oidcAuthenticating && !oidcAuthenticated) {
            setOidcAuthenticating(false);
            notifications.show({
              title: 'Authentication Timeout',
              message: 'The login process took too long. Please try again.',
              color: 'red',
            });
          }
        }, 300000); // 5 minutes
      } catch (openError) {
        console.error('Failed to open browser:', openError);
        throw new Error('Failed to open browser. Please try again.');
      }
    } catch (error) {
      console.error('OIDC login error:', error);
      notifications.show({
        title: 'Authentication Failed',
        message: error instanceof Error ? error.message : 'Failed to authenticate with OIDC',
        color: 'red',
      });
      setOidcAuthenticating(false);
    }
  };

  const handleSave = async () => {
    // Validate baseUrl
    if (!validateUrl(baseUrl)) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please enter a valid server URL',
        color: 'red',
      });
      return;
    }

    // Validate auth fields
    if (serverType === 'alfresco') {
      if (authType === 'basic') {
        if (!username.trim() || !password.trim()) {
          notifications.show({
            title: 'Validation Error',
            message: 'Please enter username and password for basic authentication',
            color: 'red',
          });
          return;
        }
      } else if (authType === 'openid_connect') {
        if (!oidcAuthenticated) {
          notifications.show({
            title: 'Authentication Required',
            message: 'Please login with OIDC before adding the server',
            color: 'red',
          });
          return;
        }
      }
    }

    setLoading(true);
    try {
      // Calculate token expiry time for OIDC
      const tokenExpiry = oidcTokens?.expiresIn
        ? new Date(Date.now() + oidcTokens.expiresIn * 1000)
        : null;

      // Create server with appropriate auth credentials
      const newServer = await backendRpc.servers.create({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        serverType: serverType as ServerType,
        authType: serverType === 'alfresco' ? authType : null,
        isAdmin: isAdmin, // Admin flag from validation
        // Basic auth fields
        username: authType === 'basic' ? username.trim() : null,
        token:
          authType === 'basic'
            ? password.trim()
            : authType === 'openid_connect'
              ? oidcTokens?.accessToken || null
              : null,
        // OAuth/OIDC fields
        refreshToken: authType === 'openid_connect' ? oidcTokens?.refreshToken || null : null,
        tokenExpiry: authType === 'openid_connect' ? tokenExpiry : null,
        oidcHost: authType === 'openid_connect' ? oidcHost.trim() : null,
        oidcRealm: authType === 'openid_connect' ? oidcRealm.trim() : null,
        oidcClientId: authType === 'openid_connect' ? oidcClientId.trim() : null,
        jsconsoleEndpoint: '/s/ootbee/jsconsole',
        thumbnail: null,
        color: null,
      });

      // Refresh workspace to get updated server list
      const workspace = await refreshWorkspace();
      setServers(workspace.servers);

      // Set new server as active and navigate to default page
      setActiveServer(newServer.id);

      // Update last accessed (fire-and-forget)
      backendRpc.servers.updateLastAccessed(newServer.id).catch(err => {
        console.error('Failed to update last accessed:', err);
      });

      if (newServer.serverType === 'alfresco') {
        navigate('repo');
      } else {
        navigate('dashboard');
      }

      notifications.show({
        title: 'Success',
        message: `Server "${name}" added successfully`,
        color: 'green',
      });

      close();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to add server',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const canOidcLogin =
    validateUrl(baseUrl) &&
    oidcHost.trim().length > 0 &&
    oidcRealm.trim().length > 0 &&
    oidcClientId.trim().length > 0;

  const canSave =
    name.trim().length > 0 &&
    validateUrl(baseUrl) &&
    (serverType === 'alfresco'
      ? authType === 'basic'
        ? credentialsValid && isAdmin
        : oidcAuthenticated
      : true);

  const serverTypes = [
    {
      type: 'alfresco' as ServerType,
      label: 'Alfresco',
      icon: IconServer,
      description: 'Alfresco Content Services',
    },
  ];

  const baseBorderColor = colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3];
  const hoverBorderColor = colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[4];
  const baseBackground = colorScheme === 'dark' ? theme.colors.dark[7] : 'transparent';
  const hoverBackground = colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0];
  const iconBackground = colorScheme === 'dark' ? `rgba(84, 160, 255, 0.15)` : theme.colors.blue[0];
  const iconColor = colorScheme === 'dark' ? theme.colors.blue[3] : theme.colors.blue[6];
  const arrowColor = colorScheme === 'dark' ? theme.colors.gray[5] : 'var(--mantine-color-dimmed)';

  return (
    <Modal
      opened={isOpen}
      onClose={handleCancel}
      title={
        step === 'select-type' ? t('addServer:addServer') : t('addServer:configureAlfrescoServer')
      }
      size="md"
      centered
      trapFocus
      returnFocus
      closeOnClickOutside={false}
      closeOnEscape
      transitionProps={{ duration: 300, transition: 'fade' }}
      styles={{
        title: {
          width: '100%',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 'var(--mantine-font-size-xl)',
        },
      }}
    >
      <div ref={modalContentRef} style={{ display: 'contents' }}>
        {step === 'select-type' ? (
          <Stack gap="md">
            <Text size="sm" c="dimmed" ta="center">
              {t('addServer:selectServerType')}
            </Text>

            <Stack gap="sm" mt="md">
              {serverTypes.map(item => {
                const Icon = item.icon;
                return (
                  <UnstyledButton
                    key={item.type}
                    onClick={() => handleSelectType(item.type)}
                    style={{
                      padding: 'var(--mantine-spacing-md)',
                      border: `1px solid ${baseBorderColor}`,
                      borderRadius: 'var(--mantine-radius-md)',
                      transition: 'all 150ms ease',
                      backgroundColor: baseBackground,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = hoverBackground;
                      e.currentTarget.style.borderColor = hoverBorderColor;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = baseBackground;
                      e.currentTarget.style.borderColor = baseBorderColor;
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="md">
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 'var(--mantine-radius-md)',
                            backgroundColor: iconBackground,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon size={28} stroke={1.5} color={iconColor} />
                        </div>
                        <div>
                          <Text fw={600} size="sm">
                            {item.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {item.description}
                          </Text>
                        </div>
                      </Group>
                      <IconChevronRight size={20} color={arrowColor} />
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Stack>

            <Alert icon={<IconInfoCircle size={16} />} color="blue" mt="md">
              <Text size="sm">{t('addServer:moreServerTypesComing')}</Text>
            </Alert>
          </Stack>
        ) : (
          <Stack gap="md">
            <TextInput
              label={t('addServer:serverName')}
              placeholder={t('addServer:serverNamePlaceholder')}
              value={name}
              onChange={e => setName(e.currentTarget.value)}
              required
              data-field="name"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <TextInput
              label={t('addServer:serverUrl')}
              placeholder={t('addServer:serverUrlPlaceholder')}
              value={baseUrl}
              onChange={e => setBaseUrl(e.currentTarget.value)}
              required
              type="url"
              error={baseUrl.trim() && !validateUrl(baseUrl) ? t('addServer:invalidUrl') : null}
              data-field="baseUrl"
            />
            {serverType === 'alfresco' && (
              <>
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t('addServer:authenticationType')}
                  </Text>
                  <SegmentedControl
                    value={authType}
                    onChange={value => setAuthType(value as AuthType)}
                    data={[
                      {
                        label: t('addServer:authTypeBasic'),
                        value: 'basic',
                      },
                      {
                        label: t('addServer:authTypeOpenIdConnect'),
                        value: 'openid_connect',
                      },
                    ]}
                    fullWidth
                  />
                </div>
                {authType === 'basic' ? (
                  <>
                    <TextInput
                      label={t('addServer:username')}
                      placeholder={t('addServer:usernamePlaceholder')}
                      value={username}
                      onChange={e => setUsername(e.currentTarget.value)}
                      required
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-field="username"
                    />
                    <div>
                      <PasswordInput
                        label={t('addServer:password')}
                        placeholder={t('addServer:passwordPlaceholder')}
                        value={password}
                        onChange={e => setPassword(e.currentTarget.value)}
                        required
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-field="password"
                        rightSection={
                          credentialsValidating ? (
                            <Text size="xs">⏳</Text>
                          ) : credentialsValid && isAdmin ? (
                            <Text size="xs" c="green">
                              ✓
                            </Text>
                          ) : credentialsValid && !isAdmin ? (
                            <Text size="xs" c="red">
                              ⚠
                            </Text>
                          ) : null
                        }
                        error={validationError}
                      />
                      {credentialsValid && isAdmin && (
                        <Text size="xs" c="green" mt={4}>
                          {t('addServer:validAdminCredentials')}
                        </Text>
                      )}
                      {credentialsValidating && (
                        <Text size="xs" c="dimmed" mt={4}>
                          {t('addServer:validatingCredentials')}
                        </Text>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Alert icon={<IconAlertCircle size={16} />} color="blue">
                      {t('addServer:oidcConfigAlert')}
                    </Alert>
                    <TextInput
                      label={t('addServer:oidcHost')}
                      placeholder={t('addServer:oidcHostPlaceholder')}
                      value={oidcHost}
                      onChange={e => setOidcHost(e.currentTarget.value)}
                      required
                      type="url"
                      data-field="oidcHost"
                      autoCorrect="off"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <TextInput
                      label={t('addServer:oidcRealm')}
                      placeholder={t('addServer:oidcRealmPlaceholder')}
                      value={oidcRealm}
                      onChange={e => setOidcRealm(e.currentTarget.value)}
                      required
                      data-field="oidcRealm"
                      autoCorrect="off"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <TextInput
                      label={t('addServer:oidcClientId')}
                      placeholder={t('addServer:oidcClientIdPlaceholder')}
                      value={oidcClientId}
                      onChange={e => setOidcClientId(e.currentTarget.value)}
                      required
                      data-field="oidcClientId"
                      autoCorrect="off"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <Button
                      onClick={handleOidcLogin}
                      disabled={!canOidcLogin || oidcAuthenticated || oidcAuthenticating}
                      loading={oidcAuthenticating}
                      fullWidth
                      variant={oidcAuthenticated ? 'light' : 'filled'}
                      color={oidcAuthenticated ? 'green' : 'blue'}
                      leftSection={oidcAuthenticated ? <Text size="sm">✓</Text> : null}
                    >
                      {oidcAuthenticated
                        ? t('addServer:authenticated')
                        : t('addServer:loginWithOidc')}
                    </Button>
                  </>
                )}
              </>
            )}

            <Group justify="space-between" mt="md">
              <Button variant="subtle" onClick={handleBack} disabled={loading}>
                {t('common:back')}
              </Button>
              <Group>
                <Button variant="subtle" onClick={handleCancel} disabled={loading}>
                  {t('common:cancel')}
                </Button>
                <Button onClick={handleSave} disabled={!canSave || loading} loading={loading}>
                  {t('addServer:addServer')}
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </div>
    </Modal>
  );
}
