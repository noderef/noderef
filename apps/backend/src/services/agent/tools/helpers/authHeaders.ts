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

import { AppErrors } from '../../../../lib/errors.js';
import type { AgentExecutionContext } from '../../types.js';

export function buildAuthHeader(ctx: AgentExecutionContext): Record<string, string> {
  if (ctx.authType === 'openid_connect') {
    if (!ctx.token) {
      throw AppErrors.unauthorized('No OAuth2 access token');
    }
    return { Authorization: `Bearer ${ctx.token}` };
  }

  if (!ctx.username || !ctx.token) {
    throw AppErrors.unauthorized('No credentials available');
  }

  return {
    Authorization: `Basic ${Buffer.from(`${ctx.username}:${ctx.token}`).toString('base64')}`,
  };
}
