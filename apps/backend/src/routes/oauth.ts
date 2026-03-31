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

/**
 * OAuth callback endpoint handler for OIDC login
 * This endpoint handles the redirect from Keycloak after user authentication
 * Standard path following OAuth 2.0 best practices for native apps
 */

import type { RequestHandler } from 'express';
import { log } from '../lib/logger.js';

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * OAuth callback route handler
 */
export function oauthCallbackHandler(): RequestHandler {
  return async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      const errorMsg = String(error_description || error || 'Unknown error');
      log.error({ error, error_description }, 'OAuth callback error');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p>${escapeHtml(errorMsg)}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code) {
      res.status(400).send('Missing authorization code');
      return;
    }

    try {
      // Validate and sanitize inputs
      const authCode = String(code || '');
      const authState = String(state || '');
      const timestamp = Date.now();

      // Store the authorization code in a temporary location
      // The frontend will poll for this and exchange it for tokens
      const authData = {
        code: authCode,
        state: authState,
        timestamp,
      };

      // Use a simple in-memory store (in production, use Redis or similar)
      (global as any).__oauth_pending_auth = authData;

      log.info({ state: authState }, 'OAuth callback received, authorization code stored');

      // Send a simple success page
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>✓ Authentication Successful</h1>
            <p>You can close this window and return to the application.</p>
          </body>
        </html>
      `);
    } catch (err) {
      log.error({ err }, 'Error handling OAuth callback');
      res.status(500).send('Internal server error');
    }
  };
}
