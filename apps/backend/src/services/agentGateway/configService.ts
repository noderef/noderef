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

import type {
  AgentGatewayConfigView,
  AgentGatewayVerificationStatus,
} from '@app/contracts';
import type { AgentGatewayConfig, PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../../lib/encryption.js';
import { AppErrors } from '../../lib/errors.js';
import { getPrismaClient } from '../../lib/prisma.js';
import type { ServerService } from '../serverService.js';
import { assertGatewayEndpointAllowed } from './endpointPolicy.js';
import { emitServerUpdated } from './serverLifecycle.js';
import type { DecryptedGatewayConfig } from './types.js';

export interface SaveGatewayConfigInput {
  enabled: boolean;
  endpointUrl?: string | null;
  apiKey?: string;
  clearApiKey?: boolean;
}

const MISMATCH_PREFIX = 'mismatch:';

function persistRepositoryId(
  status: AgentGatewayVerificationStatus,
  repositoryId: string | null
): string | null {
  if (status === 'mismatch' && repositoryId) {
    return `${MISMATCH_PREFIX}${repositoryId}`;
  }
  if (status === 'verified') {
    return repositoryId;
  }
  return null;
}

function toVerification(
  row: AgentGatewayConfig | null
): AgentGatewayConfigView['verification'] {
  if (!row?.verifiedAt || !row.verifiedEndpointUrl) {
    return { status: 'unverified', repositoryId: null, verifiedAt: null };
  }
  if (row.verifiedEndpointUrl !== (row.endpointUrl ?? null)) {
    return { status: 'unverified', repositoryId: null, verifiedAt: null };
  }
  if (row.verifiedRepositoryId?.startsWith(MISMATCH_PREFIX)) {
    return {
      status: 'mismatch',
      repositoryId: row.verifiedRepositoryId.slice(MISMATCH_PREFIX.length),
      verifiedAt: row.verifiedAt,
    };
  }
  if (!row.verifiedRepositoryId) {
    return {
      status: 'unsupported',
      repositoryId: null,
      verifiedAt: row.verifiedAt,
    };
  }
  return {
    status: 'verified',
    repositoryId: row.verifiedRepositoryId,
    verifiedAt: row.verifiedAt,
  };
}

function toView(serverId: number, row: AgentGatewayConfig | null): AgentGatewayConfigView {
  if (!row) {
    return {
      serverId,
      enabled: false,
      endpointUrl: null,
      hasApiKey: false,
      verification: { status: 'unverified', repositoryId: null, verifiedAt: null },
    };
  }

  return {
    serverId,
    enabled: row.enabled,
    endpointUrl: row.endpointUrl,
    hasApiKey: Boolean(row.apiKey),
    verification: toVerification(row),
  };
}

export class AgentGatewayConfigService {
  constructor(
    private prisma: PrismaClient,
    private serverService: ServerService
  ) {}

  static async create(serverService: ServerService): Promise<AgentGatewayConfigService> {
    const prisma = await getPrismaClient();
    return new AgentGatewayConfigService(prisma, serverService);
  }

  async getView(userId: number, serverId: number): Promise<AgentGatewayConfigView> {
    await this.assertServer(userId, serverId);
    const row = await this.prisma.agentGatewayConfig.findUnique({ where: { serverId } });
    if (row && row.userId !== userId) {
      return AppErrors.forbidden('Gateway configuration does not belong to this user');
    }
    return toView(serverId, row);
  }

  async getDecrypted(userId: number, serverId: number): Promise<DecryptedGatewayConfig | null> {
    await this.assertServer(userId, serverId);
    const row = await this.prisma.agentGatewayConfig.findUnique({ where: { serverId } });
    if (!row || row.userId !== userId) {
      return null;
    }
    return {
      id: row.id,
      userId: row.userId,
      serverId: row.serverId,
      enabled: row.enabled,
      endpointUrl: row.endpointUrl,
      apiKey: row.apiKey ? await decryptSecret(row.apiKey) : null,
      apiKeyCiphertext: row.apiKey,
      configVersion: row.configVersion,
      verifiedRepositoryId: row.verifiedRepositoryId,
      verifiedEndpointUrl: row.verifiedEndpointUrl,
      verifiedAt: row.verifiedAt,
    };
  }

  async save(
    userId: number,
    serverId: number,
    input: SaveGatewayConfigInput
  ): Promise<AgentGatewayConfigView> {
    const server = await this.assertServer(userId, serverId);
    const existing = await this.prisma.agentGatewayConfig.findUnique({ where: { serverId } });
    if (existing && existing.userId !== userId) {
      return AppErrors.forbidden('Gateway configuration does not belong to this user');
    }

    const endpointUrl =
      typeof input.endpointUrl === 'string' ? input.endpointUrl.trim() || null : (input.endpointUrl ?? existing?.endpointUrl ?? null);

    if (input.enabled || endpointUrl) {
      if (!endpointUrl) {
        return AppErrors.validationError('Agent Gateway URL is required');
      }
      assertGatewayEndpointAllowed(endpointUrl, { alfrescoBaseUrl: server.baseUrl });
    }

    let nextApiKey = existing?.apiKey ?? null;
    let keyChanged = false;
    if (input.clearApiKey) {
      nextApiKey = null;
      keyChanged = Boolean(existing?.apiKey);
    } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      nextApiKey = await encryptSecret(input.apiKey.trim());
      keyChanged = nextApiKey !== existing?.apiKey;
    }

    const urlChanged = (endpointUrl ?? null) !== (existing?.endpointUrl ?? null);
    const configVersion =
      existing && (urlChanged || keyChanged) ? existing.configVersion + 1 : (existing?.configVersion ?? 1);

    const verificationReset = urlChanged
      ? {
          verifiedRepositoryId: null,
          verifiedEndpointUrl: null,
          verifiedAt: null,
        }
      : {};

    const row = await this.prisma.agentGatewayConfig.upsert({
      where: { serverId },
      create: {
        userId,
        serverId,
        enabled: input.enabled,
        endpointUrl,
        apiKey: nextApiKey,
        configVersion,
      },
      update: {
        enabled: input.enabled,
        endpointUrl,
        apiKey: nextApiKey,
        configVersion,
        ...verificationReset,
      },
    });

    emitServerUpdated(userId, serverId);
    return toView(serverId, row);
  }

  async recordVerification(
    userId: number,
    serverId: number,
    payload: {
      status: AgentGatewayVerificationStatus;
      repositoryId: string | null;
      endpointUrl: string;
    }
  ): Promise<AgentGatewayConfigView> {
    const existing = await this.prisma.agentGatewayConfig.findUnique({ where: { serverId } });
    if (!existing || existing.userId !== userId) {
      return AppErrors.notFound('Agent Gateway configuration', serverId);
    }

    const row = await this.prisma.agentGatewayConfig.update({
      where: { serverId },
      data: {
        verifiedRepositoryId: persistRepositoryId(payload.status, payload.repositoryId),
        verifiedEndpointUrl: payload.endpointUrl,
        verifiedAt: new Date(),
      },
    });

    return toView(serverId, row);
  }

  async resolveEffective(
    userId: number,
    serverId: number,
    overrides?: {
      enabled?: boolean;
      endpointUrl?: string | null;
      apiKey?: string;
      clearApiKey?: boolean;
    }
  ): Promise<{
    enabled: boolean;
    endpointUrl: string | null;
    apiKey: string | null;
    configVersion: number;
    apiKeyCiphertext: string | null;
  }> {
    const stored = await this.getDecrypted(userId, serverId);
    const enabled = overrides?.enabled ?? stored?.enabled ?? false;
    const endpointUrl =
      typeof overrides?.endpointUrl === 'string'
        ? overrides.endpointUrl.trim() || null
        : (overrides?.endpointUrl ?? stored?.endpointUrl ?? null);

    let apiKey = stored?.apiKey ?? null;
    if (overrides?.clearApiKey) {
      apiKey = null;
    } else if (typeof overrides?.apiKey === 'string' && overrides.apiKey.trim()) {
      apiKey = overrides.apiKey.trim();
    }

    return {
      enabled,
      endpointUrl,
      apiKey,
      configVersion: stored?.configVersion ?? 1,
      apiKeyCiphertext: stored?.apiKeyCiphertext ?? null,
    };
  }

  private async assertServer(userId: number, serverId: number) {
    const server = await this.serverService.findById(userId, serverId);
    if (!server) {
      return AppErrors.notFound('Server', serverId);
    }
    return server;
  }
}
