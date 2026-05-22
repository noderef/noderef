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

import type { Express } from 'express';
import { log } from './logger.js';

/** True if the address is IPv4/IPv6 loopback (for /shutdown binding). */
export function isShutdownRequestLoopback(ip: string): boolean {
  return /^(127\.|::1$|::ffff:127\.)/.test(ip);
}

/**
 * Loopback-only graceful shutdown endpoint.
 * Called by the Neutralino renderer on windowClose to stop the backend.
 */
export function registerShutdownRoute(app: Express, triggerShutdown: () => void): void {
  app.post('/shutdown', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (!isShutdownRequestLoopback(ip)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    log.info('Shutdown requested via /shutdown endpoint');
    res.json({ ok: true, message: 'Shutting down' });
    setTimeout(() => {
      triggerShutdown();
    }, 200);
  });
}
