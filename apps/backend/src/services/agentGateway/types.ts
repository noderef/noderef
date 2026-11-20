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

import type { AgentGatewayStatus } from '@app/contracts';

export type GatewayAuthMode = 'gatewayOnly' | 'withAlfresco';

export interface DecryptedGatewayConfig {
  id: number;
  userId: number;
  serverId: number;
  enabled: boolean;
  endpointUrl: string | null;
  apiKey: string | null;
  apiKeyCiphertext: string | null;
  configVersion: number;
  verifiedRepositoryId: string | null;
  verifiedEndpointUrl: string | null;
  verifiedAt: Date | null;
}

export interface GatewayRequestContext {
  userId: number;
  serverId: number;
  endpointUrl: URL;
  apiKey: string;
  mode: GatewayAuthMode;
}

export class GatewayStatusError extends Error {
  constructor(
    public readonly status: AgentGatewayStatus,
    message: string
  ) {
    super(message);
    this.name = 'GatewayStatusError';
  }
}

export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
export const SESSION_IDLE_TTL_MS = 10 * 60 * 1000;
export const SESSION_LRU_LIMIT = 32;
export const LIST_PAGE_LIMIT = 50;
export const LIST_ITEM_LIMIT = 500;
export const MAX_MCP_TOOLS_PER_RUN = 64;
export const MAX_TOOL_SCHEMA_BYTES = 8 * 1024;
export const MAX_TOOL_DESCRIPTION_CHARS = 1024;
export const MAX_ERROR_TEXT_CHARS = 4000;
export const MAX_PROMPT_TEXT_CHARS = 20_000;
export const MAX_RESOURCE_TEXT_CHARS = 20_000;
export const CLIENT_NAME = 'noderef-desktop';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-03-26'] as const;
