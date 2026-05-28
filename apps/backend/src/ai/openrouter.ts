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

import { inferModelCapabilities } from './providers.js';
import type { AiListedModel } from './types.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=text';

interface OpenRouterModelEntry {
  id?: string;
  name?: string;
  created?: number;
  architecture?: {
    modality?: string;
    output_modalities?: string[];
  };
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModelEntry[];
}

/**
 * Fetch chat-capable models from OpenRouter's catalog API.
 * Uses the OpenAI-shaped /v1/models endpoint (not Anthropic SDK models.list).
 */
export async function listOpenRouterModels({
  apiKey,
}: {
  apiKey: string;
}): Promise<AiListedModel[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `OpenRouter models request failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`
    );
  }

  const payload = (await response.json()) as OpenRouterModelsResponse;
  const entries = Array.isArray(payload.data) ? payload.data : [];

  const models: AiListedModel[] = [];
  for (const entry of entries) {
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || !isChatCapableModel(entry)) {
      continue;
    }

    models.push({
      id,
      displayName: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null,
      createdAt: typeof entry.created === 'number' ? entry.created : null,
      capabilities: inferModelCapabilities('openrouter', id),
    });
  }

  models.sort((a, b) => {
    const nameA = (a.displayName ?? a.id).toLowerCase();
    const nameB = (b.displayName ?? b.id).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return models;
}

function isChatCapableModel(entry: OpenRouterModelEntry): boolean {
  const outputModalities = entry.architecture?.output_modalities;
  if (Array.isArray(outputModalities) && outputModalities.length > 0) {
    return outputModalities.includes('text');
  }

  const modality = entry.architecture?.modality?.toLowerCase() ?? '';
  if (modality.includes('embed')) {
    return false;
  }

  return true;
}
