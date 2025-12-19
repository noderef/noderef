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

import { createLogger } from '../../lib/logger.js';

const log = createLogger('alfresco.oidc-ticket');

/**
 * Exchange OIDC access token for Alfresco ticket using public auth API
 *
 * When using OIDC with Alfresco, the access token from Keycloak is used to get
 * an Alfresco ticket using the public authentication API GET /tickets/-me- endpoint.
 * The ticket is then used to authenticate API calls using the ROLE_TICKET:TICKET_xxx format.
 *
 * This follows the Alfresco authentication flow:
 * 1. Get OIDC access token from Keycloak (via token endpoint)
 * 2. Get Alfresco ticket using GET /tickets/-me- with Bearer token (via this function)
 * 3. Use ticket for API authentication (base64 encoded ROLE_TICKET:TICKET_xxx)
 *
 * @param baseUrl The base URL of the Alfresco server
 * @param accessToken The OIDC access token from Keycloak
 * @returns The Alfresco ticket (without TICKET_ prefix)
 */
export async function exchangeOidcTokenForTicket(
  baseUrl: string,
  accessToken: string
): Promise<string> {
  try {
    // Normalize baseUrl
    let normalizedUrl = baseUrl.replace(/\/$/, '');
    if (!normalizedUrl.endsWith('/alfresco')) {
      normalizedUrl += '/alfresco';
    }

    // Use the same endpoint as Alfresco JS API: GET /tickets/-me-
    // This endpoint returns the ticket for the currently authenticated user (via Bearer token)
    const ticketEndpoint = `${normalizedUrl}/api/-default-/public/authentication/versions/1/tickets/-me-`;

    log.debug({ ticketEndpoint }, 'Getting Alfresco ticket using OIDC token');

    // Call Alfresco public auth API to get ticket - use GET, not POST
    const response = await fetch(ticketEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText }, 'Failed to get ticket');
      throw new Error(`Failed to get ticket: ${response.status} ${errorText}`);
    }

    const ticketResponse = (await response.json()) as { entry: { id: string } };

    if (!ticketResponse?.entry?.id) {
      throw new Error('No ticket in response');
    }

    const ticket = ticketResponse.entry.id;
    log.debug('Successfully retrieved Alfresco ticket using OIDC token');

    return ticket;
  } catch (error) {
    log.error({ error, baseUrl }, 'Failed to get Alfresco ticket');
    throw error;
  }
}

/**
 * Refresh OIDC tokens using refresh token via Keycloak
 *
 * @param oidcHost Keycloak host URL
 * @param oidcRealm Keycloak realm
 * @param clientId OIDC client ID
 * @param refreshToken The refresh token
 * @returns New access token, refresh token, and expiry info
 */
export async function refreshOidcTokens(
  oidcHost: string,
  oidcRealm: string,
  clientId: string,
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}> {
  try {
    // Construct token endpoint URL
    // Handle both legacy (<v17) and modern (>=v17) Keycloak paths
    let tokenEndpoint: string;
    if (oidcHost.includes('/auth/realms/') || oidcHost.endsWith('/auth')) {
      // Legacy Keycloak or already includes /auth
      const baseUrl = oidcHost.endsWith('/auth') ? oidcHost : oidcHost;
      tokenEndpoint = `${baseUrl}/realms/${oidcRealm}/protocol/openid-connect/token`;
    } else {
      // Modern Keycloak or need to add /auth prefix
      tokenEndpoint = `${oidcHost}/auth/realms/${oidcRealm}/protocol/openid-connect/token`;
    }

    log.info({ tokenEndpoint, realm: oidcRealm }, 'Refreshing OIDC tokens');

    // Exchange refresh token for new access token
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText }, 'Token refresh failed');
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokenResponse.access_token) {
      throw new Error('No access token in response');
    }

    log.info('OIDC tokens refreshed successfully');

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    };
  } catch (error) {
    log.error({ error, oidcHost, oidcRealm }, 'Failed to refresh OIDC tokens');
    throw error;
  }
}
