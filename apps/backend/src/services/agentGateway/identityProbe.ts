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

import type { AgentGatewayVerificationStatus, McpCatalog } from '@app/contracts';
import type { McpSessionManager, SessionConnectParams } from './McpSessionManager.js';
import type { GatewayCredentialProvider } from './credentialProvider.js';

const INFO_SUFFIX = '://repository/info';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractRepositoryId(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const entry = asRecord(root.entry) ?? root;
  const repository = asRecord(entry.repository) ?? asRecord(root.repository);
  if (!repository) return null;
  const id = repository.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export function findRepositoryInfoResource(catalog: McpCatalog): string | null {
  const match = catalog.resources.find(
    resource =>
      resource.uri.endsWith(INFO_SUFFIX) &&
      (resource.mimeType === 'application/json' || !resource.mimeType)
  );
  return match?.uri ?? null;
}

export async function readAlfrescoRepositoryId(
  credentials: GatewayCredentialProvider,
  userId: number,
  serverId: number,
  serverBaseUrl: string
): Promise<string | null> {
  const authorization = await credentials.getAlfrescoAuthorization(userId, serverId);
  const url = new URL('/alfresco/api/discovery', serverBaseUrl.endsWith('/') ? serverBaseUrl : `${serverBaseUrl}/`);
  const response = await fetch(url, {
    headers: { Authorization: authorization, Accept: 'application/json' },
    redirect: 'error',
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as unknown;
  return extractRepositoryId(body);
}

export async function probeGatewayEnvironment(
  sessions: McpSessionManager,
  credentials: GatewayCredentialProvider,
  params: SessionConnectParams,
  catalog: McpCatalog,
  serverBaseUrl: string
): Promise<{
  status: AgentGatewayVerificationStatus;
  gatewayRepositoryId: string | null;
  alfrescoRepositoryId: string | null;
}> {
  const uri = findRepositoryInfoResource(catalog);
  if (!uri) {
    return { status: 'unsupported', gatewayRepositoryId: null, alfrescoRepositoryId: null };
  }

  const resource = await sessions.readResource(params, uri);
  const textBlock = resource.contents?.find(
    (block): block is { uri: string; text: string; mimeType?: string } =>
      'text' in block && typeof block.text === 'string'
  );
  let gatewayRepositoryId: string | null = null;
  if (textBlock) {
    try {
      gatewayRepositoryId = extractRepositoryId(JSON.parse(textBlock.text));
    } catch {
      gatewayRepositoryId = extractRepositoryId(textBlock.text);
    }
  }
  if (!gatewayRepositoryId) {
    return { status: 'unsupported', gatewayRepositoryId: null, alfrescoRepositoryId: null };
  }

  const alfrescoRepositoryId = await readAlfrescoRepositoryId(
    credentials,
    params.userId,
    params.serverId,
    serverBaseUrl
  );
  if (!alfrescoRepositoryId) {
    return { status: 'unsupported', gatewayRepositoryId, alfrescoRepositoryId: null };
  }
  if (gatewayRepositoryId !== alfrescoRepositoryId) {
    return { status: 'mismatch', gatewayRepositoryId, alfrescoRepositoryId };
  }
  return { status: 'verified', gatewayRepositoryId, alfrescoRepositoryId };
}
