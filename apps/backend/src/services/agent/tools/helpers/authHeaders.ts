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

export function buildAlfrescoAuthorization(input: {
  authType: string | null;
  username: string | null;
  token: string | null;
}): string {
  if (input.authType === 'openid_connect') {
    if (!input.token) {
      throw AppErrors.unauthorized('No OAuth2 access token');
    }
    return `Bearer ${input.token}`;
  }

  if (!input.username || !input.token) {
    throw AppErrors.unauthorized('No credentials available');
  }

  return `Basic ${Buffer.from(`${input.username}:${input.token}`).toString('base64')}`;
}

export function buildAuthHeader(ctx: AgentExecutionContext): Record<string, string> {
  return {
    Authorization: buildAlfrescoAuthorization({
      authType: ctx.authType,
      username: ctx.username,
      token: ctx.token,
    }),
  };
}
