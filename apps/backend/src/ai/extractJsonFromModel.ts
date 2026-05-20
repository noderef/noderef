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
 * Extracts the inner JSON payload from a raw model response.
 *
 * Handles two common formats:
 *  1. Fenced markdown: ```json ... ``` (or any ``` fence)
 *  2. Inline payload surrounded by extra prose — sliced between the
 *     first/last occurrence of the requested bracket characters.
 *
 * If no recognizable structure is found, the trimmed input is returned
 * verbatim so the caller can let `JSON.parse` surface the error.
 */
export function extractJsonFromModel(raw: string, kind: 'array' | 'object'): string {
  const open = kind === 'array' ? '[' : '{';
  const close = kind === 'array' ? ']' : '}';
  const trimmed = raw.trim();

  if (trimmed.startsWith('```')) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      return fenceMatch[1].trim();
    }
  }

  const first = trimmed.indexOf(open);
  const last = trimmed.lastIndexOf(close);
  return first !== -1 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}
