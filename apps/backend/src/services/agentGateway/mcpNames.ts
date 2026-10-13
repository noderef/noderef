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

import { createHash } from 'node:crypto';

const MAX_MODEL_NAME = 64;

function hash6(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 6);
}

export function sanitizeMcpModelName(gatewayName: string): string {
  const sanitized = gatewayName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = `mcp_${sanitized || 'tool'}`;
  return base.slice(0, MAX_MODEL_NAME);
}

export function assignMcpModelNames(
  gatewayNames: string[],
  taken: Set<string>
): Map<string, string> {
  const assigned = new Map<string, string>();
  const used = new Set(taken);

  for (const name of gatewayNames) {
    let modelName = sanitizeMcpModelName(name);
    const needsSuffix =
      used.has(modelName) ||
      modelName.length >= MAX_MODEL_NAME ||
      sanitizeMcpModelName(name) !== modelName;

    if (used.has(modelName) || modelName.length > MAX_MODEL_NAME - 8) {
      const suffix = `_${hash6(name)}`;
      modelName = `${modelName.slice(0, MAX_MODEL_NAME - suffix.length)}${suffix}`;
    } else if (needsSuffix && used.has(modelName)) {
      const suffix = `_${hash6(name)}`;
      modelName = `${modelName.slice(0, MAX_MODEL_NAME - suffix.length)}${suffix}`;
    }

    if (used.has(modelName)) {
      const suffix = `_${hash6(`retry:${name}`)}`;
      modelName = `${sanitizeMcpModelName(name).slice(0, MAX_MODEL_NAME - suffix.length)}${suffix}`;
    }

    used.add(modelName);
    assigned.set(name, modelName);
  }

  return assigned;
}

export function sessionFingerprint(parts: {
  endpointUrl: string;
  apiKeyCiphertext: string | null;
  configVersion: number;
  authType: string | null;
  alfrescoIdentity: string;
}): string {
  return createHash('sha256')
    .update(
      [
        parts.endpointUrl,
        parts.apiKeyCiphertext ?? '',
        String(parts.configVersion),
        parts.authType ?? '',
        parts.alfrescoIdentity,
      ].join('\0')
    )
    .digest('hex');
}
