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

import type { AgentMention } from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { getAiProvider } from '../../ai/providers.js';
import { AppErrors } from '../../lib/errors.js';
import type { AgentRepository } from '../../repositories/agentRepository.js';
import { resolveUserAiConfig, resolveUserAiConfigForProvider } from '../ai/userSettingsService.js';
import { getAuthenticatedClientWithRefresh } from '../alfresco/authenticationHelper.js';
import type { ServerService } from '../serverService.js';
import { getAiAssistantEnabled } from '../userSettings.js';
import type { AgentExecutionContext, ResolvedAiRuntime } from './types.js';

export const parseMentions = (raw: string | null): AgentMention[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const typed = item as Partial<AgentMention>;
        if (!typed.id || !typed.type || !typed.label) {
          return null;
        }
        if (!['node', 'person', 'group', 'server'].includes(typed.type)) {
          return null;
        }
        return {
          id: String(typed.id),
          type: typed.type,
          label: String(typed.label),
          path: typed.path ?? null,
        } as AgentMention;
      })
      .filter((item): item is AgentMention => Boolean(item));
  } catch {
    return [];
  }
};

export const cleanText = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const nowIso = () => new Date().toISOString();

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    if (typeof (error as Record<string, unknown>).message === 'string') {
      return (error as Record<string, unknown>).message as string;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }
  return String(error);
}

export async function createExecutionContext(
  prisma: PrismaClient,
  serverService: ServerService,
  userId: number,
  serverId: number,
  options?: {
    signal?: AbortSignal;
    aiRuntime?: ResolvedAiRuntime;
  }
): Promise<AgentExecutionContext> {
  const server = await serverService.findById(userId, serverId);
  if (!server) {
    return AppErrors.notFound('Server', serverId);
  }

  const credentials = await serverService.getCredentialsForBackend(userId, serverId);
  if (!credentials?.token || (credentials.authType === 'basic' && !credentials.username)) {
    return AppErrors.unauthorized('No stored credentials found for server');
  }

  const api = await getAuthenticatedClientWithRefresh(userId, serverId, server.baseUrl, prisma);
  if (!api) {
    return AppErrors.unauthorized('Failed to authenticate against server');
  }

  return {
    api,
    serverBaseUrl: server.baseUrl,
    jsconsoleEndpoint: server.jsconsoleEndpoint ?? null,
    authType: credentials.authType,
    username: credentials.username,
    token: credentials.token,
    userId,
    aiRuntime: options?.aiRuntime,
    signal: options?.signal ?? new AbortController().signal,
  };
}

export async function resolveAiRuntime(
  userId: number,
  preferredModel?: { provider?: string; model?: string }
): Promise<ResolvedAiRuntime | null> {
  const requestedProvider = preferredModel?.provider?.trim().toLowerCase() || undefined;
  const requestedModel = preferredModel?.model?.trim() || undefined;

  const [assistantEnabled, aiConfig] = await Promise.all([
    getAiAssistantEnabled(userId),
    requestedProvider
      ? resolveUserAiConfigForProvider(userId, requestedProvider)
      : resolveUserAiConfig(userId),
  ]);

  if (!assistantEnabled || !aiConfig) {
    return null;
  }

  const provider = getAiProvider(aiConfig.provider);
  if (!provider) {
    return null;
  }

  return {
    provider: provider.id,
    model: requestedModel || aiConfig.model || provider.defaultModel,
    apiKey: aiConfig.apiKey,
    baseURL: provider.baseURL,
    temperature: provider.defaultTemperature ?? 0,
  };
}

export async function emitRunEvent(
  repository: AgentRepository,
  runId: number,
  type: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  extra?: Record<string, unknown>
): Promise<void> {
  await repository.createRunEvent({
    runId,
    stepId: (extra?.stepId as number) ?? null,
    type,
    level,
    payload: { ...extra, timestamp: nowIso() },
  });
}

export function validateOperationOutput(output: Record<string, unknown>): string | null {
  const statusCode = typeof output.status === 'number' ? output.status : 0;
  const outputError =
    typeof output.error === 'string' && output.error.trim() ? output.error.trim() : null;

  if (outputError || statusCode >= 400) {
    return outputError || `Operation failed with status ${statusCode}`;
  }
  return null;
}

export interface ConversationTurn {
  role: string;
  content: string;
}

const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_CHARS = 4000;

export function formatConversationHistory(
  messages: ConversationTurn[],
  currentMessageId?: number
): string {
  if (!messages.length) {
    return '';
  }

  const turns: string[] = [];
  let totalChars = 0;

  const relevant = messages.slice(-MAX_HISTORY_TURNS);

  for (const msg of relevant) {
    const prefix = msg.role === 'user' ? 'User' : 'Assistant';
    const truncatedContent =
      msg.content.length > 500 ? `${msg.content.slice(0, 500)}…` : msg.content;
    const line = `${prefix}: ${truncatedContent}`;

    if (totalChars + line.length > MAX_HISTORY_CHARS) {
      break;
    }

    turns.push(line);
    totalChars += line.length;
  }

  return turns.length ? turns.join('\n') : '';
}

/**
 * Remove markdown/HTML horizontal rules from assistant output.
 * This is a safety net in case the model ignores prompt formatting constraints.
 */
export function stripHorizontalRules(value: string): string {
  if (!value) {
    return value;
  }
  const withoutHtmlHr = value.replace(/<hr\s*\/?>/gi, '');
  return withoutHtmlHr
    .split(/\r?\n/)
    .filter(
      line =>
        !/^\s*(?:-{3,}|\*{3,}|_{3,}|(?:-\s+){2,}-?|(?:\*\s+){2,}\*?|(?:_\s+){2,}_?)\s*$/.test(line)
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildPaginatedResponse<T>(
  items: T[],
  totalItems: number,
  params: { skipCount?: number; maxItems?: number }
) {
  const skipCount = Math.max(0, params.skipCount ?? 0);
  const maxItems = Math.max(1, Math.min(params.maxItems ?? 50, 100));
  return {
    items,
    pagination: {
      totalItems,
      skipCount,
      maxItems,
      hasMoreItems: skipCount + items.length < totalItems,
    },
  };
}
