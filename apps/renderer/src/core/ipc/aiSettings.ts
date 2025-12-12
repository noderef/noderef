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

import { rpc } from './rpc';

export interface AiSettingsResponse {
  provider: string | null;
  model: string | null;
  hasToken: boolean;
  enabled?: boolean;
}

export async function getAiSettings(): Promise<AiSettingsResponse> {
  return rpc<AiSettingsResponse>('backend.ai.getSettings', {});
}

export async function saveAiSettings(input: {
  provider: string;
  model: string;
  token?: string;
  enabled?: boolean;
}): Promise<{ success: boolean }> {
  return rpc<{ success: boolean }>('backend.ai.saveSettings', input);
}

export interface AiModelsResponse {
  provider: string;
  models: Array<{ id: string; displayName: string | null; createdAt: number | string | null }>;
}

export async function listAiModels(params: {
  provider?: string;
  token?: string;
}): Promise<AiModelsResponse> {
  return rpc<AiModelsResponse>('backend.ai.listModels', params);
}
