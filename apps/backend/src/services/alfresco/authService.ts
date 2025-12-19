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

import { PeopleApi } from '@alfresco/js-api';
import type {
  AlfUser,
  ConfigureOAuth2Req,
  ConfigureOAuth2Res,
  ExchangeOAuth2TokenReq,
  ExchangeOAuth2TokenRes,
  LoginReq,
  LoginRes,
  LogoutReq,
  LogoutRes,
  ValidateCredentialsReq,
  ValidateCredentialsRes,
  ValidateOidcCredentialsReq,
  ValidateOidcCredentialsRes,
} from '@app/contracts';
import { createLogger } from '../../lib/logger.js';
import {
  dropClient,
  getClient,
  updateOAuth2Token,
  type OAuth2AuthDescriptor,
} from './clientFactory.js';
import { mapError } from './errorMapper.js';

const log = createLogger('alfresco.auth');

/**
 * Authentication service for Alfresco operations
 */

/**
 * Login to Alfresco server
 * @param req Login request with baseUrl, username, and password
 * @returns Login response with user information
 */
export async function login(req: LoginReq): Promise<LoginRes> {
  try {
    const api = getClient(req.baseUrl);

    // Perform login - extra defensive against superagent errors
    let personEntry;
    try {
      await api.login(req.username, req.password);

      // Retrieve current user information
      const peopleApi = new PeopleApi(api);
      personEntry = await peopleApi.getPerson('-me-');
    } catch (loginError: any) {
      // Treat 401/403 as "invalid credentials" instead of letting raw errors escape
      const status = loginError?.status ?? loginError?.response?.status;

      if (status === 401 || status === 403) {
        const err = new Error('Authentication failed');
        (err as any).code = 'UNAUTHORIZED';
        (err as any).details = { status, reason: 'Invalid username or password' };
        throw err;
      }

      // Let the outer catch map anything else
      throw loginError;
    }

    // Map to AlfUser model
    const user: AlfUser = {
      id: personEntry.entry.id,
      displayName:
        personEntry.entry.displayName || personEntry.entry.firstName || personEntry.entry.id,
      email: personEntry.entry.email,
    };

    return { user };
  } catch (error) {
    const appError = mapError(error);
    // Re-throw as Error so Express can serialize it properly
    const err = new Error(appError.message);
    (err as any).code = appError.code;
    (err as any).details = appError.details;
    throw err;
  }
}

/**
 * Validate credentials and check admin status
 * @param req Validate credentials request with baseUrl, username, and password
 * @returns Validation response with admin status
 */
export async function validateCredentials(
  req: ValidateCredentialsReq
): Promise<ValidateCredentialsRes> {
  let api: any;

  try {
    api = getClient(req.baseUrl);

    // Perform login - wrap in additional try-catch
    try {
      await api.login(req.username, req.password);
    } catch (loginError: any) {
      // Login failed - determine the reason
      const status = loginError?.status;

      if (status === 401 || status === 403) {
        return {
          valid: false,
          isAdmin: false,
          error: 'Invalid username or password',
        };
      }

      // Re-throw to be handled by outer catch
      throw loginError;
    }

    // Retrieve current user information with full capabilities
    const peopleApi = new PeopleApi(api);
    const personEntry = await peopleApi.getPerson('-me-');

    // Check if user is admin
    const isAdmin = personEntry.entry.capabilities?.isAdmin === true;

    // Map to user object
    const user = {
      id: personEntry.entry.id,
      displayName:
        personEntry.entry.displayName || personEntry.entry.firstName || personEntry.entry.id,
      email: personEntry.entry.email,
    };

    // Drop the client after validation (we'll create a new one when adding the server)
    dropClient(req.baseUrl);

    return {
      valid: true,
      isAdmin,
      user,
    };
  } catch (error: any) {
    // If validation fails, return invalid without throwing
    log.debug('Credential validation failed:', error);

    // Provide helpful error message
    let errorMessage = 'Authentication failed';

    try {
      // First check if error has a status property (superagent/Alfresco API errors)
      const status = error?.status;

      if (status === 401 || status === 403) {
        errorMessage = 'Invalid username or password';
      } else if (status === 404) {
        errorMessage = 'Alfresco API not found - check the URL';
      } else if (status >= 500) {
        errorMessage = 'Server error - please try again later';
      } else if (error?.message) {
        const message = error.message;

        // Try to parse if message is JSON
        if (message.startsWith('{')) {
          try {
            const parsed = JSON.parse(message);
            if (
              parsed?.error?.errorKey === 'Login failed' ||
              parsed?.error?.briefSummary?.includes('Login failed')
            ) {
              errorMessage = 'Invalid username or password';
            } else if (parsed?.error?.briefSummary) {
              errorMessage =
                parsed.error.briefSummary.split(' ').slice(1).join(' ') || 'Authentication failed';
            }
          } catch {
            // Not JSON, continue with other checks
          }
        }

        // Check for common error patterns
        if (errorMessage === 'Authentication failed') {
          if (message.includes('ECONNREFUSED')) {
            errorMessage = 'Cannot connect to Alfresco server';
          } else if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
            errorMessage = 'Server not found - check the URL';
          } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
            errorMessage = 'Connection timeout';
          } else if (message.includes('Login failed') || message.includes('403')) {
            errorMessage = 'Invalid username or password';
          }
        }
      }
    } catch (parseError) {
      log.debug({ parseError }, 'Error parsing validation error');
      errorMessage = 'Authentication failed';
    }

    // Clean up the client on error
    try {
      dropClient(req.baseUrl);
    } catch (cleanupError) {
      log.debug({ cleanupError }, 'Error cleaning up client');
    }

    return {
      valid: false,
      isAdmin: false,
      error: errorMessage,
    };
  }
}

/**
 * Validate OIDC credentials and check admin status
 * @param req Validate OIDC credentials request with baseUrl, accessToken, and OIDC config
 * @returns Validation response with admin status
 */
export async function validateOidcCredentials(
  req: ValidateOidcCredentialsReq
): Promise<ValidateOidcCredentialsRes> {
  let api: any;

  try {
    // Create OAuth2 client with access token
    const oauth2Auth: OAuth2AuthDescriptor = {
      type: 'oauth2',
      clientId: req.oidcClientId,
      host: req.oidcHost,
      realm: req.oidcRealm,
      accessToken: req.accessToken,
    };

    api = getClient(req.baseUrl, oauth2Auth);

    // Retrieve current user information with full capabilities
    const peopleApi = new PeopleApi(api);
    const personEntry = await peopleApi.getPerson('-me-');

    // Check if user is admin
    const isAdmin = personEntry.entry.capabilities?.isAdmin === true;

    log.info(
      {
        userId: personEntry.entry.id,
        isAdmin,
      },
      'OIDC credential validation completed'
    );

    // Map to user object
    const user = {
      id: personEntry.entry.id,
      displayName:
        personEntry.entry.displayName || personEntry.entry.firstName || personEntry.entry.id,
      email: personEntry.entry.email,
    };

    // Drop the client after validation (we'll create a new one when adding the server)
    dropClient(req.baseUrl);

    return {
      valid: true,
      isAdmin,
      user,
    };
  } catch (error: any) {
    // If validation fails, return invalid without throwing
    log.debug('OIDC credential validation failed:', error);

    // Provide helpful error message
    let errorMessage = 'Authentication failed';

    try {
      const status = error?.status;
      if (status === 401 || status === 403) {
        errorMessage = 'Invalid access token or insufficient permissions';
      } else if (error?.message) {
        errorMessage = error.message;
      }
    } catch {
      // Ignore errors when extracting error message
    }

    return {
      valid: false,
      isAdmin: false,
      error: errorMessage,
    };
  }
}

/**
 * Logout from Alfresco server
 * @param req Logout request with baseUrl
 * @returns Logout response
 */
export async function logout(req: LogoutReq): Promise<LogoutRes> {
  try {
    const api = getClient(req.baseUrl);

    // Perform logout
    await api.logout();
  } catch (error) {
    // Even if logout fails, clear the cached client
    // This ensures we don't reuse a potentially invalid session
  } finally {
    // Always clear the cached client after logout
    dropClient(req.baseUrl);
  }

  return { success: true };
}

/**
 * Configure OAuth2 for an Alfresco server
 * This sets up the OAuth2 configuration but doesn't perform authentication
 * @param req OAuth2 configuration request
 * @returns Configuration response
 */
export async function configureOAuth2(req: ConfigureOAuth2Req): Promise<ConfigureOAuth2Res> {
  try {
    const auth: OAuth2AuthDescriptor = {
      type: 'oauth2',
      clientId: req.clientId,
      host: req.host,
      realm: req.realm,
      scope: req.scope,
      redirectUri: req.redirectUri,
      implicitFlow: req.implicitFlow,
    };

    // Get or create client with OAuth2 configuration
    // This doesn't authenticate yet, just configures the client
    getClient(req.baseUrl, auth);

    return { success: true };
  } catch (error) {
    const appError = mapError(error);
    const err = new Error(appError.message);
    (err as any).code = appError.code;
    (err as any).details = appError.details;
    throw err;
  }
}

/**
 * Exchange OAuth2 authorization code for access token
 * @param req Token exchange request with authorization code
 * @returns Token exchange response with access token
 */
export async function exchangeOAuth2Token(
  req: ExchangeOAuth2TokenReq
): Promise<ExchangeOAuth2TokenRes> {
  try {
    // Exchange authorization code for tokens using direct HTTP request to Keycloak
    // This is more reliable than using Alfresco JS API's OAuth2 module

    // Construct the token endpoint URL
    // Handle both legacy (<v17) and modern (>=v17) Keycloak paths
    let tokenEndpoint: string;
    if (req.host.includes('/auth/realms/') || req.host.endsWith('/auth')) {
      // Legacy Keycloak or already includes /auth
      const baseUrl = req.host.endsWith('/auth') ? req.host : req.host;
      tokenEndpoint = `${baseUrl}/realms/${req.realm}/protocol/openid-connect/token`;
    } else {
      // Modern Keycloak or need to add /auth prefix
      tokenEndpoint = `${req.host}/auth/realms/${req.realm}/protocol/openid-connect/token`;
    }

    log.info(
      { tokenEndpoint, realm: req.realm },
      'Exchanging OAuth2 authorization code for tokens'
    );

    // Prepare the token request body (application/x-www-form-urlencoded)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: req.code,
      redirect_uri: req.redirectUri || 'http://localhost:3000',
      client_id: req.clientId,
    });

    // Add PKCE code verifier if provided
    if (req.codeVerifier) {
      body.set('code_verifier', req.codeVerifier);
    }

    // Make the token exchange request
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText }, 'Token exchange failed');
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokenResponse.access_token) {
      throw new Error('No access token in response');
    }

    log.info('OAuth2 token exchange successful');

    // Store the tokens for this client
    const auth: OAuth2AuthDescriptor = {
      type: 'oauth2',
      clientId: req.clientId,
      host: req.host,
      realm: req.realm,
      redirectUri: req.redirectUri,
      implicitFlow: false,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
    };

    // Update stored tokens
    updateOAuth2Token(req.baseUrl, auth, tokenResponse.access_token, tokenResponse.refresh_token);

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    };
  } catch (error) {
    log.error({ error }, 'OAuth2 token exchange error');
    const appError = mapError(error);
    const err = new Error(appError.message);
    (err as any).code = appError.code;
    (err as any).details = appError.details;
    throw err;
  }
}
