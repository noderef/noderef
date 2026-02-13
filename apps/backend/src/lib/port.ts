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
 * Port discovery and server startup utilities
 * Handles port assignment, fallback logic, and port publishing
 */

import express from 'express';
import { chmodSync, mkdirSync, writeFileSync } from 'fs';
import * as net from 'net';
import path from 'path';
import { log } from './logger.js';
import { getDataDirFromArgsOrEnv } from './paths.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Get the port to listen on from command line args or environment
 */
export function getPort(): number {
  const fromArg = process.argv.find(a => a.startsWith('--port='))?.split('=')[1];
  const fromEnv = process.env.PORT;
  return Number(fromArg ?? fromEnv ?? 5111);
}

/**
 * Get the host to bind to from environment
 */
export function getHost(): string {
  const fromEnv = process.env.HOST || process.env.BIND_ADDR;
  if (fromEnv) {
    return fromEnv;
  }
  return isDev ? '127.0.0.1' : '0.0.0.0';
}

/**
 * Whether to use an ephemeral (OS-assigned) port
 * In production, use ephemeral unless FIXED_PORT=1
 */
export function shouldUseEphemeralPort(): boolean {
  if (process.env.FIXED_PORT === '1') {
    return false;
  }
  return !isDev;
}

/**
 * Get the preferred port range from environment variables.
 * Returns null if PROD_PORT_MIN/MAX are not configured or invalid.
 */
export function getPreferredPortRange(): { min: number; max: number } | null {
  const minStr = process.env.PROD_PORT_MIN;
  const maxStr = process.env.PROD_PORT_MAX;
  if (!minStr || !maxStr) return null;

  const min = parseInt(minStr, 10);
  const max = parseInt(maxStr, 10);
  if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0 || min > max) {
    log.warn({ minStr, maxStr }, 'Invalid PROD_PORT_MIN/MAX values, ignoring');
    return null;
  }
  return { min, max };
}

/**
 * Try to listen on a specific port.
 * Returns { success: true, server, actualPort } on success, { success: false } on EADDRINUSE.
 */
export function tryListen(
  app: express.Express,
  port: number,
  host: string
): Promise<{ success: boolean; server?: net.Server; actualPort?: number }> {
  return new Promise(resolve => {
    const server = app.listen(port, host);
    server.once('error', (err: NodeJS.ErrnoException) => {
      server.close();
      if (err.code === 'EADDRINUSE') {
        resolve({ success: false });
      } else {
        throw err;
      }
    });
    server.once('listening', () => {
      const actualPort = (server.address() as net.AddressInfo)?.port;
      log.debug({ requestedPort: port, actualPort }, 'Server bound successfully');
      resolve({ success: true, server, actualPort });
    });
  });
}

/**
 * Try ports in the preferred range sequentially, fall back to OS-assigned if all are in use.
 */
export async function listenWithFallback(
  app: express.Express,
  host: string,
  { min, max }: { min: number; max: number }
): Promise<{ server: net.Server; port: number }> {
  log.info({ min, max, host }, 'Attempting preferred port range');

  for (let port = min; port <= max; port++) {
    const result = await tryListen(app, port, host);
    if (result.success && result.server && result.actualPort) {
      log.info({ port: result.actualPort }, 'Bound to preferred port');
      return { server: result.server, port: result.actualPort };
    }
    log.debug({ port }, 'Port in use, trying next');
  }

  // Fall back to OS-assigned ephemeral port
  log.info('Preferred ports exhausted, using OS-assigned port');
  const result = await tryListen(app, 0, host);
  if (result.success && result.server && result.actualPort) {
    log.info({ port: result.actualPort }, 'Bound to OS-assigned port');
    return { server: result.server, port: result.actualPort };
  }
  throw new Error('Failed to bind to any port');
}

/**
 * Publish the port number to a file so the renderer can discover it
 */
export function publishPort(port: number): void {
  try {
    const dataDir = getDataDirFromArgsOrEnv();
    const runtimeDir = path.join(dataDir, '.runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const portFile = path.join(runtimeDir, 'backend-port');
    writeFileSync(portFile, String(port), 'utf-8');
    // Best-effort chmod on POSIX
    if (process.platform !== 'win32') {
      try {
        chmodSync(runtimeDir, 0o700);
        chmodSync(portFile, 0o600);
      } catch {
        // Ignore chmod errors
      }
    }
  } catch (err) {
    log.error({ err }, 'Failed to publish backend port');
  }
}
