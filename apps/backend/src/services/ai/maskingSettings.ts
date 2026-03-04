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
 * Masking Settings Service
 *
 * Load/save/preview masking configuration stored in user_ai_settings.metadata.llmMasking.
 * The masking config is stored on the user's default AI settings row.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { AiSettingsRepository } from '../../repositories/aiSettingsRepository.js';
import {
  getDefaultMaskingConfig,
  maskPayload,
  validateMaskingConfig,
  type LlmMaskingConfig,
  type MaskingStats,
} from './maskingEngine.js';

export interface PreviewMaskingResult {
  output: unknown;
  stats: MaskingStats;
}

let defaultPrisma: Awaited<ReturnType<typeof getPrismaClient>> | null = null;

async function getDefaultPrisma() {
  if (!defaultPrisma) {
    defaultPrisma = await getPrismaClient();
  }
  return defaultPrisma;
}

/**
 * Load masking settings for a user. Returns defaults if not configured.
 */
export async function getMaskingSettings(userId: number): Promise<LlmMaskingConfig> {
  const prisma = await getDefaultPrisma();
  const repository = new AiSettingsRepository(prisma);
  const record = await repository.findDefault(userId);

  if (!record?.metadata) {
    return getDefaultMaskingConfig();
  }

  try {
    const parsed =
      typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata;

    if (parsed && typeof parsed === 'object' && parsed.llmMasking) {
      return validateMaskingConfig(parsed.llmMasking);
    }
  } catch {
    // Fall through to defaults
  }

  return getDefaultMaskingConfig();
}

/**
 * Save masking settings for a user.
 * Merges into existing metadata on the default AI settings row.
 */
export async function saveMaskingSettings(
  userId: number,
  config: unknown
): Promise<{ success: boolean }> {
  const validated = validateMaskingConfig(config);

  const prisma = await getDefaultPrisma();
  const repository = new AiSettingsRepository(prisma);
  const record = await repository.findDefault(userId);

  if (!record) {
    throw new Error('No AI provider configured. Please configure an AI provider first.');
  }

  // Parse existing metadata
  let existingMetadata: Record<string, unknown> = {};
  if (record.metadata) {
    try {
      const parsed =
        typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata;
      if (parsed && typeof parsed === 'object') {
        existingMetadata = parsed as Record<string, unknown>;
      }
    } catch {
      // Start fresh
    }
  }

  // Merge llmMasking into metadata
  existingMetadata.llmMasking = validated;
  const metadataStr = JSON.stringify(existingMetadata);

  await repository.update(userId, record.provider, { metadata: metadataStr });

  return { success: true };
}

/**
 * Preview masking on arbitrary input using the given config.
 */
export async function previewMasking(
  config: unknown,
  input: string
): Promise<PreviewMaskingResult> {
  const validated = validateMaskingConfig(config);

  // Force enabled for preview purposes
  const previewConfig: LlmMaskingConfig = { ...validated, enabled: true };

  // Try to parse as JSON first
  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(input);
  } catch {
    // Treat as plain text
    parsedInput = input;
  }

  const { masked, stats } = maskPayload(parsedInput, previewConfig);

  return {
    output: masked,
    stats,
  };
}
