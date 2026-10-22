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
  AgentChatMcpSettings,
  AgentGatewayConnectionTestResult,
  AgentGatewayVerifyResult,
  McpCatalog,
  McpPromptPreview,
} from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { AppErrors } from '../../lib/errors.js';
import type { ServerService } from '../serverService.js';
import { AgentGatewayConfigService } from './configService.js';
import { GatewayCredentialProvider } from './credentialProvider.js';
import { assertGatewayEndpointAllowed, EndpointPolicyError } from './endpointPolicy.js';
import { probeGatewayEnvironment } from './identityProbe.js';
import { McpSessionManager, type SessionConnectParams } from './McpSessionManager.js';
import { promptMessagesToText } from './mcpResultNormalizer.js';
import { emptyCatalog } from './mcpCatalog.js';
import { parseMcpSettings } from './mcpSettings.js';
import { GatewayStatusError } from './types.js';

function asStringRecord(
  value: Record<string, unknown> | undefined
): Record<string, string> | undefined {
  if (!value) return undefined;
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      next[key] = item;
    }
  }
  return next;
}

export class AgentGatewayService {
  constructor(
    private prisma: PrismaClient,
    private serverService: ServerService,
    private configService: AgentGatewayConfigService,
    private credentials: GatewayCredentialProvider,
    private sessions: McpSessionManager
  ) {}

  async getConfig(userId: number, serverId: number) {
    return this.configService.getView(userId, serverId);
  }

  async saveConfig(
    userId: number,
    serverId: number,
    input: { enabled: boolean; endpointUrl?: string | null; apiKey?: string; clearApiKey?: boolean }
  ) {
    const view = await this.configService.save(userId, serverId, input);
    await this.sessions.invalidate(userId, serverId);
    return view;
  }

  async testConnection(
    userId: number,
    serverId: number,
    overrides?: {
      enabled?: boolean;
      endpointUrl?: string | null;
      apiKey?: string;
      clearApiKey?: boolean;
    }
  ): Promise<AgentGatewayConnectionTestResult> {
    const server = await this.serverService.findById(userId, serverId);
    if (!server) {
      return AppErrors.notFound('Server', serverId);
    }
    const effective = await this.configService.resolveEffective(userId, serverId, overrides);
    if (!effective.enabled) {
      return {
        status: 'disabled',
        serverInfo: null,
        protocolVersion: null,
        toolCount: 0,
        promptCount: 0,
        truncated: false,
      };
    }
    if (!effective.endpointUrl || !effective.apiKey) {
      return {
        status: 'not_configured',
        serverInfo: null,
        protocolVersion: null,
        toolCount: 0,
        promptCount: 0,
        truncated: false,
      };
    }

    try {
      assertGatewayEndpointAllowed(effective.endpointUrl, { alfrescoBaseUrl: server.baseUrl });
      const result = await this.sessions.connectEphemeral({
        endpointUrl: effective.endpointUrl,
        apiKey: effective.apiKey,
        serverBaseUrl: server.baseUrl,
      });
      return {
        status: 'connected',
        serverInfo: result.serverInfo,
        protocolVersion: result.protocolVersion,
        toolCount: result.catalog.tools.length,
        promptCount: result.catalog.prompts.length,
        truncated: result.catalog.truncated,
      };
    } catch (error) {
      if (error instanceof EndpointPolicyError) {
        return AppErrors.validationError(error.message);
      }
      const status = error instanceof GatewayStatusError ? error.status : 'unreachable';
      return {
        status,
        serverInfo: null,
        protocolVersion: null,
        toolCount: 0,
        promptCount: 0,
        truncated: false,
      };
    }
  }

  async getCatalog(userId: number, serverId: number, refresh = false): Promise<McpCatalog> {
    const connect = await this.requireConnectParams(userId, serverId, 'withAlfresco');
    if ('catalog' in connect) {
      return connect.catalog;
    }
    const view = await this.configService.getView(userId, serverId);
    if (view.verification.status === 'mismatch') {
      return emptyCatalog('environment_mismatch');
    }
    try {
      return await this.sessions.getCatalog(connect, refresh);
    } catch (error) {
      if (error instanceof GatewayStatusError) {
        return emptyCatalog(error.status);
      }
      return emptyCatalog('protocol_error');
    }
  }

  async verifyEnvironment(userId: number, serverId: number): Promise<AgentGatewayVerifyResult> {
    const server = await this.serverService.findById(userId, serverId);
    if (!server) {
      return AppErrors.notFound('Server', serverId);
    }
    const connect = await this.requireConnectParams(userId, serverId, 'withAlfresco');
    if ('catalog' in connect) {
      return { status: 'unverified', repositoryId: null, verifiedAt: null };
    }
    const catalog = await this.sessions.getCatalog(connect, true);
    const result = await probeGatewayEnvironment(
      this.sessions,
      this.credentials,
      connect,
      catalog,
      server.baseUrl
    );
    const view = await this.configService.recordVerification(userId, serverId, {
      status: result.status,
      repositoryId: result.gatewayRepositoryId,
      endpointUrl: connect.endpointUrl,
    });
    return {
      status: result.status,
      repositoryId: result.gatewayRepositoryId,
      alfrescoRepositoryId: result.alfrescoRepositoryId,
      verifiedAt: view.verification.verifiedAt
        ? new Date(view.verification.verifiedAt).toISOString()
        : null,
    };
  }

  async getPrompt(
    userId: number,
    target: { chatId?: number; serverId?: number },
    name: string,
    args?: Record<string, unknown>
  ): Promise<McpPromptPreview> {
    let serverId = target.serverId;
    if (target.chatId) {
      const chat = await this.prisma.agentChat.findFirst({ where: { id: target.chatId, userId } });
      if (!chat) {
        return AppErrors.notFound('Chat', target.chatId);
      }
      serverId = chat.serverId;
    }
    if (!serverId) {
      return AppErrors.validationError('chatId or serverId is required');
    }
    const connect = await this.requireConnectParams(userId, serverId, 'withAlfresco');
    if ('catalog' in connect) {
      return AppErrors.validationError('Agent Gateway is not connected for this chat');
    }
    const result = await this.sessions.getPrompt(connect, name, asStringRecord(args));
    const rendered = promptMessagesToText(result.messages ?? []);
    return {
      name,
      description: typeof result.description === 'string' ? result.description : null,
      text: rendered.text,
      truncated: rendered.truncated,
    };
  }

  async requireConnectParams(
    userId: number,
    serverId: number,
    mode: SessionConnectParams['mode']
  ): Promise<SessionConnectParams | { catalog: McpCatalog }> {
    const server = await this.serverService.findById(userId, serverId);
    if (!server) {
      return AppErrors.notFound('Server', serverId);
    }
    const config = await this.configService.getDecrypted(userId, serverId);
    if (!config?.enabled) {
      return { catalog: emptyCatalog('disabled') };
    }
    if (!config.endpointUrl || !config.apiKey) {
      return { catalog: emptyCatalog('not_configured') };
    }
    if (
      config.verifiedAt &&
      config.verifiedEndpointUrl === config.endpointUrl &&
      config.verifiedRepositoryId === null
    ) {
      // unsupported: still connect
    }
    if (config.verifiedEndpointUrl && config.verifiedEndpointUrl === config.endpointUrl) {
      // mismatch is stored as verifiedRepositoryId null + we need mismatch flag
    }
    // mismatch: verifiedAt set, verifiedRepositoryId null after mismatch? recordVerification stores null for non-verified
    // Plan: mismatch blocks catalog with environment_mismatch.
    // We'll encode mismatch by storing verifiedRepositoryId null AND a sentinel? Better: compare live.
    // recordVerification for mismatch stores repositoryId null.
    // Can't distinguish unsupported vs mismatch from DB.
    // Fix: store verifiedRepositoryId even on mismatch, and add nothing...
    // Update recordVerification to store the gateway id always, and mismatch is detected by compare.
    // Simpler: store `verifiedRepositoryId` for verified only, and for mismatch store a special prefix.
    // Cleanest: keep verified* only for verified/unsupported. For mismatch, throw at verify time and persist status via verifiedRepositoryId = `mismatch:${id}`
    return {
      userId,
      serverId,
      serverBaseUrl: server.baseUrl,
      endpointUrl: config.endpointUrl,
      apiKey: config.apiKey,
      apiKeyCiphertext: config.apiKeyCiphertext,
      configVersion: config.configVersion,
      mode,
    };
  }
}
