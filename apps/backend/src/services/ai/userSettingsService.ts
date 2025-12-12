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

import { decryptSecret, encryptSecret } from '../../lib/encryption.js';
import { getPrismaClient } from '../../lib/prisma.js';
import { AiSettingsRepository } from '../../repositories/aiSettingsRepository.js';

export interface UserAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  label?: string;
  metadata?: Record<string, unknown> | null;
}

export interface SaveUserAiSettingsInput {
  provider: string;
  model: string;
  token?: string | null;
  label?: string;
  metadata?: Record<string, unknown> | null;
  isDefault?: boolean;
}

let defaultPrisma: Awaited<ReturnType<typeof getPrismaClient>> | null = null;

async function getDefaultPrisma() {
  if (!defaultPrisma) {
    defaultPrisma = await getPrismaClient();
  }
  return defaultPrisma;
}

export async function listUserAiSettings(userId: number) {
  const prisma = await getDefaultPrisma();
  const repository = new AiSettingsRepository(prisma);
  return repository.findAll(userId);
}

export async function upsertUserAiSettings(userId: number, input: SaveUserAiSettingsInput) {
  const prisma = await getDefaultPrisma();
  const repository = new AiSettingsRepository(prisma);

  let encryptedToken: string | null = null;
  if (typeof input.token === 'string' && input.token.trim().length > 0) {
    encryptedToken = await encryptSecret(input.token.trim());
  } else {
    // Try to get existing token
    const existing = await repository.findByProvider(userId, input.provider);
    if (existing) {
      encryptedToken = existing.token;
    }
  }

  if (!encryptedToken) {
    throw new Error('AI provider token is required.');
  }

  return repository.upsert(userId, {
    userId,
    provider: input.provider,
    model: input.model,
    token: encryptedToken,
    label: input.label ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    isDefault: input.isDefault ?? true,
  });
}

export async function resolveUserAiConfig(userId: number): Promise<UserAiConfig | null> {
  const prisma = await getDefaultPrisma();
  const repository = new AiSettingsRepository(prisma);
  const record = await repository.findDefault(userId);

  if (!record) {
    return null;
  }

  const decryptedToken = await decryptSecret(record.token);
  const metadata =
    typeof record.metadata === 'string' && record.metadata.trim().length
      ? safeParseMetadata(record.metadata)
      : null;

  return {
    provider: record.provider,
    model: record.model,
    apiKey: decryptedToken,
    label: record.label ?? undefined,
    metadata,
  };
}

function safeParseMetadata(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
