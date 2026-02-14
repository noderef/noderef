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

import Anthropic from '@anthropic-ai/sdk';
import type { AiInputImage, AiListedModel } from './types.js';

export interface AnthropicRequest {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  baseURL?: string;
  images?: AiInputImage[];
}

export async function callAnthropic({
  apiKey,
  model,
  prompt,
  maxTokens = 1024,
  temperature = 0,
  baseURL,
  images = [],
}: AnthropicRequest): Promise<string> {
  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  const content = [
    { type: 'text' as const, text: prompt },
    ...images.map(image => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mediaType,
        data: image.data,
      },
    })),
  ];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  });

  const text = response.content
    .map(item => ('text' in item ? item.text : ''))
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Empty response from Anthropic');
  }

  return text;
}

export async function listAnthropicModels({
  apiKey,
  baseURL,
}: {
  apiKey: string;
  baseURL?: string;
}): Promise<AiListedModel[]> {
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const response = await client.models.list();
  return response.data.map(model => ({
    id: model.id,
    displayName: (model as any).display_name ?? null,
    createdAt: model.created_at ?? null,
    capabilities: ['text'],
  }));
}
