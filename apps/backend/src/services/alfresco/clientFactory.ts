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

import { AlfrescoApi } from '@alfresco/js-api';
import { DEFAULT_OIDC_SCOPE, DEFAULT_REDIRECT_URI } from './constants.js';

/**
 * Client factory for AlfrescoApi instances
 * Caches clients by baseUrl + auth signature to support multiple auth methods per server
 */

/**
 * Authentication descriptor for Basic auth
 */
export interface BasicAuthDescriptor {
  type: 'basic';
  username?: string; // Optional: can be provided later via login()
  password?: string; // Optional: can be provided later via login()
}

/**
 * Authentication descriptor for OAuth2 (Keycloak)
 */
export interface OAuth2AuthDescriptor {
  type: 'oauth2';
  clientId: string;
  host: string; // OAuth2 server host (e.g., Keycloak)
  realm: string; // OAuth2 realm
  scope?: string; // Optional scope
  redirectUri?: string; // Optional redirect URI
  implicitFlow?: boolean; // Use implicit flow (default: false, uses authorization code flow)
  accessToken?: string; // Current access token (can be set after token exchange)
  refreshToken?: string; // Refresh token for token refresh
}

/**
 * Union type for all auth descriptors
 */
export type AuthDescriptor = BasicAuthDescriptor | OAuth2AuthDescriptor;

/**
 * Generate a cache key from baseUrl and auth descriptor
 */
function getCacheKey(baseUrl: string, auth?: AuthDescriptor): string {
  let normalizedUrl = baseUrl.replace(/\/$/, '');

  // Remove /alfresco context path if present (same normalization as getClient)
  if (normalizedUrl.endsWith('/alfresco')) {
    normalizedUrl = normalizedUrl.slice(0, -9);
  }

  if (!auth) {
    return normalizedUrl;
  }

  if (auth.type === 'basic') {
    // For basic auth, include username in cache key if provided
    const username = auth.username || 'anonymous';
    return `${normalizedUrl}:basic:${username}`;
  } else {
    // For OAuth2, include clientId and realm in cache key
    return `${normalizedUrl}:oauth2:${auth.clientId}:${auth.realm}`;
  }
}

const clientCache = new Map<string, AlfrescoApi>();
const authCache = new Map<string, AuthDescriptor>(); // Store auth descriptors for token refresh

/**
 * Set OAuth2 token on an AlfrescoApi client
 * Uses the SDK's oauth2Auth.setToken() method which properly sets authentications.oauth2.accessToken
 */
function setOAuth2Token(
  client: AlfrescoApi,
  accessToken: string,
  refreshToken?: string | null
): void {
  const oauth2Auth = (client as any).oauth2Auth;
  if (oauth2Auth && typeof oauth2Auth.setToken === 'function') {
    oauth2Auth.setToken(accessToken, refreshToken || null);
  }
}

/**
 * Get or create an AlfrescoApi client for the given base URL and auth descriptor
 * @param baseUrl The base URL of the Alfresco server
 * @param auth Optional authentication descriptor (defaults to basic auth)
 * @returns An AlfrescoApi client instance
 */
export function getClient(baseUrl: string, auth?: AuthDescriptor): AlfrescoApi {
  const cacheKey = getCacheKey(baseUrl, auth);

  // Check cache first
  const cached = clientCache.get(cacheKey);
  if (cached) {
    // For OAuth2, always update the token in case it has been refreshed
    if (auth && auth.type === 'oauth2' && auth.accessToken) {
      setOAuth2Token(cached, auth.accessToken, auth.refreshToken);
    }
    return cached;
  }

  // Normalize baseUrl - remove trailing slash
  let normalizedUrl = baseUrl.replace(/\/$/, '');

  // Remove /alfresco context path if present (SDK adds it automatically)
  if (normalizedUrl.endsWith('/alfresco')) {
    normalizedUrl = normalizedUrl.slice(0, -9);
  }

  // Create client configuration
  const config: any = {
    provider: 'ECM',
    hostEcm: normalizedUrl,
  };

  // Configure OAuth2 if provided
  if (auth && auth.type === 'oauth2') {
    // authType: 'OAUTH' makes isOauthConfiguration() return true
    // oauthInit: true triggers initAuth() which creates oauth2Auth instance
    config.authType = 'OAUTH';
    config.oauthInit = true;
    config.oauth2 = {
      clientId: auth.clientId,
      host: auth.host,
      realm: auth.realm,
      scope: auth.scope || DEFAULT_OIDC_SCOPE,
      redirectUri: auth.redirectUri || DEFAULT_REDIRECT_URI,
      implicitFlow: false,
    };
  }

  // Create new client
  const client = new AlfrescoApi(config);

  // For OAuth2, set access token via SDK's setToken method
  if (auth && auth.type === 'oauth2' && auth.accessToken) {
    setOAuth2Token(client, auth.accessToken, auth.refreshToken);
  }

  // Cache it
  clientCache.set(cacheKey, client);
  if (auth) {
    authCache.set(cacheKey, { ...auth });
  }

  return client;
}

/**
 * Credentials from ServerService.getCredentialsForBackend()
 */
export interface StoredCredentials {
  authType: string | null;
  username: string | null;
  token: string | null;
  oidcHost?: string | null;
  oidcRealm?: string | null;
  oidcClientId?: string | null;
}

/**
 * Get an authenticated AlfrescoApi client based on stored credentials
 * Handles both Basic Auth (calls login()) and OIDC (uses Bearer token)
 * @param baseUrl The base URL of the Alfresco server
 * @param creds Credentials from ServerService.getCredentialsForBackend()
 * @returns An authenticated AlfrescoApi client
 */
export async function getAuthenticatedClient(
  baseUrl: string,
  creds: StoredCredentials
): Promise<AlfrescoApi> {
  if (creds.authType === 'openid_connect') {
    if (!creds.oidcHost || !creds.oidcRealm || !creds.oidcClientId) {
      throw new Error('Missing OIDC configuration');
    }
    if (!creds.token) {
      throw new Error('Missing OIDC access token');
    }

    // For OIDC: use Bearer token authentication via OAuth2
    const oauth2Auth: OAuth2AuthDescriptor = {
      type: 'oauth2',
      clientId: creds.oidcClientId,
      host: creds.oidcHost,
      realm: creds.oidcRealm,
      accessToken: creds.token,
    };

    // Get client with OAuth2 configuration
    // The js-api will use Bearer token for authentication
    return getClient(baseUrl, oauth2Auth);
  }

  // Basic Auth: get client and call login()
  const api = getClient(baseUrl);
  await api.login(creds.username || '', creds.token!);
  return api;
}

/**
 * Drop a cached client for the given base URL and auth descriptor
 * This is useful when logging out to clear the authentication state
 * @param baseUrl The base URL of the Alfresco server
 * @param auth Optional authentication descriptor (if not provided, drops all clients for the baseUrl)
 */
export function dropClient(baseUrl: string, auth?: AuthDescriptor): void {
  let normalizedUrl = baseUrl.replace(/\/$/, '');

  // Remove /alfresco context path if present (same normalization as getClient)
  if (normalizedUrl.endsWith('/alfresco')) {
    normalizedUrl = normalizedUrl.slice(0, -9);
  }

  if (auth) {
    // Drop specific client
    const cacheKey = getCacheKey(normalizedUrl, auth);
    clientCache.delete(cacheKey);
    authCache.delete(cacheKey);
  } else {
    // Drop all clients for this baseUrl
    const keysToDelete: string[] = [];
    for (const key of clientCache.keys()) {
      if (key.startsWith(normalizedUrl + ':')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      clientCache.delete(key);
      authCache.delete(key);
    }
  }
}

/**
 * Get the auth descriptor for a cached client
 * @param baseUrl The base URL of the Alfresco server
 * @param auth Optional authentication descriptor
 * @returns The stored auth descriptor, or undefined if not found
 */
export function getAuthDescriptor(
  baseUrl: string,
  auth?: AuthDescriptor
): AuthDescriptor | undefined {
  const cacheKey = getCacheKey(baseUrl, auth);
  return authCache.get(cacheKey);
}

/**
 * Update the access token for an OAuth2 client
 * @param baseUrl The base URL of the Alfresco server
 * @param auth The OAuth2 auth descriptor
 * @param accessToken The new access token
 * @param refreshToken Optional new refresh token
 */
export function updateOAuth2Token(
  baseUrl: string,
  auth: OAuth2AuthDescriptor,
  accessToken: string,
  refreshToken?: string
): void {
  const cacheKey = getCacheKey(baseUrl, auth);
  const client = clientCache.get(cacheKey);
  const storedAuth = authCache.get(cacheKey);

  if (client && storedAuth && storedAuth.type === 'oauth2') {
    storedAuth.accessToken = accessToken;
    if (refreshToken) {
      storedAuth.refreshToken = refreshToken;
    }
    setOAuth2Token(client, accessToken, refreshToken);
  }
}

/**
 * Clear all cached clients and auth descriptors
 * Useful for logout, server removal, or "switch user" flows
 *
 * Note: For a desktop app with limited servers this is typically not needed,
 * but helps prevent unbounded cache growth in long-running processes
 */
export function clearAllClients(): void {
  clientCache.clear();
  authCache.clear();
}
