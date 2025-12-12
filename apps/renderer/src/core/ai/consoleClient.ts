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

import { getBackendUrl } from '@/core/ipc/rpc';

export interface AiStatusResponse {
  enabled: boolean;
  providerConfigured: boolean;
  userEnabled?: boolean;
}

export type AiChangeType = 'replace_selection' | 'replace_file';

export interface AiExecuteResult {
  type: AiChangeType;
  code: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBackendUrl();
  const response = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(payload?.message ?? 'AI request failed');
    (error as any).code = payload?.code;
    throw error;
  }

  return payload as T;
}

export async function fetchAiStatus(): Promise<AiStatusResponse> {
  try {
    return await request<AiStatusResponse>('/rpc/ai/status', { method: 'GET' });
  } catch (err) {
    console.warn('[AI] Failed to fetch status', err);
    return { enabled: false, providerConfigured: false };
  }
}

export async function callAiRouter(question: string): Promise<string[]> {
  const result = await request<{ selected: string[] }>('/rpc/ai/router', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
  return Array.isArray(result.selected) ? result.selected : [];
}

export interface ExecutePayload {
  question: string;
  selected: string[];
  selection?: string;
  context?: string;
}

export async function callAiExecute(payload: ExecutePayload): Promise<AiExecuteResult> {
  const result = await request<{ result: AiExecuteResult }>('/rpc/ai/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.result;
}
