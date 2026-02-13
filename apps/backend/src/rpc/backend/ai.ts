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
 * AI RPC handlers
 * Handles all backend.ai.* RPC methods
 */

import { z } from 'zod';
import { listAnthropicModels } from '../../ai/anthropic.js';
import { AppErrors } from '../../lib/errors.js';
import {
  resolveUserAiConfig,
  upsertUserAiSettings,
} from '../../services/ai/userSettingsService.js';
import { getAiAssistantEnabled, setAiAssistantEnabled } from '../../services/userSettings.js';
import type { Routes } from './types.js';
import { getCurrentUserId } from './withAuth.js';

const DEFAULT_AI_PROVIDER = 'anthropic';
const DEFAULT_AI_MODEL = 'claude-3-5-sonnet-20241022';

/**
 * Register all AI-related RPC handlers
 */
export function registerAiHandlers(routes: Routes): void {
  routes['backend.ai.getSettings'] = {
    schema: z.object({}),
    handler: async () => {
      const userId = await getCurrentUserId();
      const config = await resolveUserAiConfig(userId);
      return {
        provider: config?.provider ?? DEFAULT_AI_PROVIDER,
        model: config?.model ?? DEFAULT_AI_MODEL,
        hasToken: Boolean(config?.apiKey),
        enabled: await getAiAssistantEnabled(userId),
      };
    },
  };

  routes['backend.ai.saveSettings'] = {
    schema: z.object({
      provider: z.string().min(1),
      model: z.string().min(1),
      token: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    handler: async params => {
      const userId = await getCurrentUserId();
      const { provider, model, token, enabled } = params as {
        provider: string;
        model: string;
        token?: string;
        enabled?: boolean;
      };
      const normalizedToken = token && token.trim().length > 0 ? token.trim() : undefined;

      await upsertUserAiSettings(userId, {
        provider,
        model,
        token: normalizedToken,
        isDefault: true,
      });

      if (typeof enabled === 'boolean') {
        await setAiAssistantEnabled(userId, enabled);
      }

      return { success: true };
    },
  };

  routes['backend.ai.listModels'] = {
    schema: z.object({
      provider: z.string().optional(),
      token: z.string().optional(),
    }),
    handler: async (params: unknown) => {
      const typedParams = params as { provider?: string; token?: string };
      const userId = await getCurrentUserId();
      const providerOverride = typedParams.provider?.trim();
      const tokenOverride = typedParams.token?.trim();

      let config: Awaited<ReturnType<typeof resolveUserAiConfig>> | null = null;
      if (!tokenOverride || !providerOverride) {
        config = await resolveUserAiConfig(userId).catch(() => null);
      }

      const provider = providerOverride || config?.provider || DEFAULT_AI_PROVIDER;
      const token = tokenOverride || config?.apiKey;
      if (!token) {
        AppErrors.invalidInput('No API token provided or stored.');
      }
      // TypeScript doesn't recognize never-return, so we assert token is defined
      const tokenDefined = token!;

      if (provider !== 'anthropic') {
        AppErrors.invalidInput(`Model listing not supported for provider "${provider}".`);
      }

      const models = await listAnthropicModels(tokenDefined);
      return { provider, models };
    },
  };
}
