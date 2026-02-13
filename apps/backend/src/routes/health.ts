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
 * Health check endpoint handler
 */

import type { RequestHandler } from 'express';

export interface HealthRouteOptions {
  version: string;
  buildId: string;
}

/**
 * Create health check route handler
 */
export function healthHandler({ version, buildId }: HealthRouteOptions): RequestHandler {
  return (_req, res) => {
    res.setHeader('X-NodeRef', `backend@${version}`);
    res.setHeader('X-NodeRef-Build', buildId);
    res.json({
      ok: true,
      service: 'noderef-backend',
      version,
      ts: Date.now(),
    });
  };
}
