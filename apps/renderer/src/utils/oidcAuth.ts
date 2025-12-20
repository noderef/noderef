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

/**
 * Shared OIDC authentication utilities
 * Centralizes OIDC flow logic used across multiple components
 */

// OIDC scope for authentication requests
export const OIDC_SCOPE = 'openid profile email offline_access';

// Popup window configuration
export const OIDC_POPUP_CONFIG = {
  width: 500,
  height: 700,
  features: 'toolbar=no,menubar=no,location=no,status=yes,scrollbars=yes,resizable=yes',
} as const;

// Timeout for authentication flow (5 minutes)
export const OIDC_AUTH_TIMEOUT = 300000;

// Grace period after popup closes (3 seconds)
export const POPUP_CLOSE_GRACE_PERIOD = 3000;

/**
 * Generate PKCE code verifier and challenge
 * @returns {Promise<{codeVerifier: string, codeChallenge: string}>}
 */
export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  // Generate random code verifier
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Generate code challenge (SHA-256 hash of verifier, base64url encoded)
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const codeChallenge = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

/**
 * Ensure URL has a protocol (http:// or https://)
 * @param url - URL to normalize
 * @returns Normalized URL with protocol
 */
export function ensureProtocol(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Default to http for local development, https for production
  return url.includes('localhost') || url.includes('127.0.0.1')
    ? `http://${url}`
    : `https://${url}`;
}

/**
 * Validate if a string is a valid URL
 * @param urlString - String to validate
 * @returns True if valid URL
 */
export function validateUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Construct OIDC authorization URL
 * @param config - OIDC configuration
 * @returns Authorization URL
 */
export function constructOidcAuthUrl(config: {
  oidcHost: string;
  oidcRealm: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): URL {
  const { oidcHost, oidcRealm, clientId, redirectUri, state, codeChallenge } = config;

  // Handle both Keycloak versions:
  // - Legacy (< v17): http://host:port/auth/realms/{realm}/...
  // - Modern (>= v17): http://host:port/realms/{realm}/...
  let authBaseUrl = oidcHost;
  if (!authBaseUrl.endsWith('/auth') && !authBaseUrl.includes('/realms/')) {
    authBaseUrl = `${authBaseUrl}/auth`;
  }

  const authUrl = new URL(`${authBaseUrl}/realms/${oidcRealm}/protocol/openid-connect/auth`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', OIDC_SCOPE);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  return authUrl;
}

/**
 * Open OIDC popup window (browser mode)
 * @returns Popup window or null if blocked
 */
export function openOidcPopup(windowName: string = 'oidc-login'): Window | null {
  const { width, height, features } = OIDC_POPUP_CONFIG;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

  const popup = window.open(
    'about:blank',
    windowName,
    `width=${width},height=${height},left=${left},top=${top},${features}`
  );

  if (popup) {
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

  return popup;
}

/**
 * Generate a random state parameter for OIDC flow
 * @returns Random state string
 */
export function generateState(): string {
  return Math.random().toString(36).substring(2);
}

/**
 * Monitor popup window closure and handle grace period
 * @param popup - Popup window to monitor
 * @param onCancel - Callback when user cancels (closes popup after grace period)
 * @returns Interval ID for cleanup
 */
export function monitorPopupClosure(popup: Window, onCancel: () => void): number {
  let popupClosedTime: number | null = null;

  const interval = setInterval(() => {
    if (popup && popup.closed) {
      if (!popupClosedTime) {
        // Popup just closed - start grace period
        popupClosedTime = Date.now();
      } else if (Date.now() - popupClosedTime > POPUP_CLOSE_GRACE_PERIOD) {
        // Grace period expired - assume user canceled
        clearInterval(interval);
        onCancel();
      }
      // Otherwise, keep waiting - polling might still get the code
    }
  }, 500);

  return interval as unknown as number;
}
