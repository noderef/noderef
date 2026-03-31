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
 * Agent parsing utilities — JSON extraction, output field readers,
 * and normalisation helpers shared by AgentService and AgentRunEngine.
 */

import { isRecord } from './agentUtils.js';

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i;

export function normalizeAppLanguage(input: string | undefined): string | undefined {
  const trimmed = input?.trim();
  if (!trimmed || !LANGUAGE_CODE_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed.toLowerCase().replace('_', '-');
}

export function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getPreferredModelFromPlan(
  plan: Record<string, unknown> | null | undefined
): { provider?: string; model?: string } | undefined {
  if (!plan) {
    return undefined;
  }
  const provider = typeof plan.provider === 'string' ? plan.provider.trim().toLowerCase() : '';
  const model = typeof plan.model === 'string' ? plan.model.trim() : '';
  if (!provider && !model) {
    return undefined;
  }
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

export function getNodeIdFromOutput(output: Record<string, unknown> | undefined): string | null {
  if (!output) {
    return null;
  }

  const directCandidates = [
    output.nodeId,
    (output.created as Record<string, unknown> | undefined)?.id,
    (output.updated as Record<string, unknown> | undefined)?.id,
    (output.moved as Record<string, unknown> | undefined)?.id,
    (output.copied as Record<string, unknown> | undefined)?.id,
    (
      (output.postActionVerification as Record<string, unknown> | undefined)?.node as
        | Record<string, unknown>
        | undefined
    )?.id,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

export function getNodeNameFromOutput(output: Record<string, unknown> | undefined): string | null {
  if (!output) {
    return null;
  }

  const directCandidates = [
    output.name,
    (output.created as Record<string, unknown> | undefined)?.name,
    (output.updated as Record<string, unknown> | undefined)?.name,
    (output.moved as Record<string, unknown> | undefined)?.name,
    (output.copied as Record<string, unknown> | undefined)?.name,
    (
      (output.postActionVerification as Record<string, unknown> | undefined)?.node as
        | Record<string, unknown>
        | undefined
    )?.name,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * Parse a JSON object from raw model output.
 * Tries direct parse, fenced code block extraction, and brace-delimited fallback.
 */
export function parseModelJsonObject(raw: string): Record<string, unknown> | null {
  const direct = raw.trim();
  try {
    const parsed = JSON.parse(direct) as unknown;
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim()) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1).trim();
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  return null;
}
