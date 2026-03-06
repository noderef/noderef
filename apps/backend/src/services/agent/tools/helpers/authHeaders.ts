/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
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
