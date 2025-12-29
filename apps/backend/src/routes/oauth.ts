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
 * OAuth callback endpoint handler for OIDC login
 * This endpoint handles the redirect from Keycloak after user authentication
 * Standard path following OAuth 2.0 best practices for native apps
 */

import type { RequestHandler } from 'express';
import { log } from '../lib/logger.js';

/**
 * OAuth callback route handler
 */
export function oauthCallbackHandler(): RequestHandler {
  return async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      log.error({ error, error_description }, 'OAuth callback error');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed</h1>
            <p>${error_description || error}</p>
            <p>You can close this window and try again.</p>
            <script>
              // Store error in localStorage so the app can detect it
              localStorage.setItem('oauth_error', '${error_description || error}');
              setTimeout(() => window.close(), 3000);
            </script>
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
      // Store the authorization code in a temporary location
      // The frontend will poll for this and exchange it for tokens
      const authData = {
        code: code as string,
        state: state as string,
        timestamp: Date.now(),
      };

      // Use a simple in-memory store (in production, use Redis or similar)
      (global as any).__oauth_pending_auth = authData;

      log.info({ state }, 'OAuth callback received, authorization code stored');

      // Send a success page that closes itself
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>✓ Authentication Successful</h1>
            <p>You can close this window and return to the application.</p>
            <script>
              // Store success flag in localStorage so the app can detect it
              localStorage.setItem('oauth_success', 'true');
              localStorage.setItem('oauth_code', '${code}');
              localStorage.setItem('oauth_timestamp', '${Date.now()}');
              
              // Try to close the window after a short delay
              setTimeout(() => {
                window.close();
                // If window.close() doesn't work (some browsers prevent it), show a message
                setTimeout(() => {
                  document.body.innerHTML = '<h1>✓ Authentication Successful</h1><p>Please close this window manually.</p>';
                }, 500);
              }, 2000);
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      log.error({ err }, 'Error handling OAuth callback');
      res.status(500).send('Internal server error');
    }
  };
}

