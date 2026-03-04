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

import { rpc } from './rpc';

export type AiCapability = 'text' | 'vision';

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
  models: Array<{
    id: string;
    displayName: string | null;
    createdAt: number | string | null;
    capabilities: AiCapability[];
  }>;
}

export async function listAiModels(params: {
  provider?: string;
  token?: string;
}): Promise<AiModelsResponse> {
  return rpc<AiModelsResponse>('backend.ai.listModels', params);
}

export interface AiProvidersResponse {
  defaultProvider: string;
  providers: Array<{
    id: string;
    label: string;
    hasToken: boolean;
    defaultModel: string;
    modelCatalogMode: 'api' | 'api_with_fallback' | 'static';
    capabilities: AiCapability[];
    models: Array<{
      id: string;
      displayName: string | null;
      createdAt: number | string | null;
      capabilities: AiCapability[];
    }>;
  }>;
}

export async function listAiProviders(): Promise<AiProvidersResponse> {
  return rpc<AiProvidersResponse>('backend.ai.listProviders', {});
}

// ── Masking Settings ──────────────────────────────────────────────────────────

export interface TextRegexRule {
  id: string;
  pattern: string;
  flags?: string;
  replacement: string;
}

export interface LlmMaskingConfig {
  enabled: boolean;
  mode: 'tokenize' | 'redact';
  propertyRules: {
    exact: string[];
    prefixes: string[];
    regex: string[];
  };
  textRegexRules: TextRegexRule[];
  preserveKeys: string[];
}

export interface PreviewMaskingResult {
  output: unknown;
  stats: {
    maskedFields: number;
    regexHits: number;
  };
}

export async function getMaskingSettings(): Promise<LlmMaskingConfig> {
  return rpc<LlmMaskingConfig>('backend.ai.getMaskingSettings', {});
}

export async function saveMaskingSettings(config: LlmMaskingConfig): Promise<{ success: boolean }> {
  return rpc<{ success: boolean }>('backend.ai.saveMaskingSettings', { config });
}

export async function previewMasking(params: {
  config: LlmMaskingConfig;
  input: string;
}): Promise<PreviewMaskingResult> {
  return rpc<PreviewMaskingResult>('backend.ai.previewMasking', params);
}
