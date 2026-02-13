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
 * Server bootstrap service for Docker deployments
 * Creates initial server configuration from environment variables
 */

import { log } from '../lib/logger.js';
import type { ServerService } from './serverService.js';
import { ensureSystemUser } from './userBootstrap.js';

/**
 * Environment variable names for server bootstrap
 */
const ENV = {
  URL: 'SERVER_URL',
  NAME: 'SERVER_NAME',
  USERNAME: 'SERVER_USERNAME',
  PASSWORD: 'SERVER_PASSWORD',
  JSCONSOLE_ENDPOINT: 'SERVER_JSCONSOLE_ENDPOINT',
} as const;

/**
 * Bootstrap a server from environment variables (Docker only)
 *
 * Creates a server if:
 * - NODEREF_SERVER_URL is provided
 * - No servers exist yet for the system user
 *
 * Defaults:
 * - Name: "Alfresco"
 * - Username: "admin"
 * - Password: "admin"
 * - Auth type: "basic"
 * - JS Console endpoint: "ootbee/jsconsole"
 */
export async function bootstrapServerFromEnv(serverService: ServerService): Promise<void> {
  const serverUrl = process.env[ENV.URL];

  // Skip if no URL provided
  if (!serverUrl) {
    return;
  }

  try {
    const userId = await ensureSystemUser();
    const existingServers = await serverService.findAll(userId);

    // Skip if servers already exist (idempotent)
    if (existingServers.length > 0) {
      log.info(
        { serverCount: existingServers.length },
        'Server bootstrap skipped: servers already exist'
      );
      return;
    }

    // Read config from environment with defaults
    const serverName = process.env[ENV.NAME] || 'Alfresco';
    const username = process.env[ENV.USERNAME] || 'admin';
    const password = process.env[ENV.PASSWORD] || 'admin';
    const jsconsoleEndpoint = process.env[ENV.JSCONSOLE_ENDPOINT] || 'ootbee/jsconsole';

    // Create the server
    const server = await serverService.create(userId, {
      name: serverName,
      baseUrl: serverUrl,
      serverType: 'alfresco',
      authType: 'basic',
      username: username,
      token: password,
      jsconsoleEndpoint: jsconsoleEndpoint,
      isAdmin: true,
    });

    log.info(
      { serverId: server.id, serverName, baseUrl: serverUrl },
      'Server bootstrapped from environment variables'
    );
  } catch (error) {
    log.error({ error }, 'Failed to bootstrap server from environment variables');
    // Don't throw - allow app to continue even if bootstrap fails
  }
}
