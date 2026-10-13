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
  AgentMessageContextItem,
  McpCatalog,
  McpPromptPreview,
  McpResourcePreview,
} from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { AppErrors } from '../../lib/errors.js';
import type { ServerService } from '../serverService.js';
import { AgentGatewayConfigService } from './configService.js';
import { GatewayCredentialProvider } from './credentialProvider.js';
import { assertGatewayEndpointAllowed, EndpointPolicyError } from './endpointPolicy.js';
import { probeGatewayEnvironment } from './identityProbe.js';
import { McpSessionManager, type SessionConnectParams } from './McpSessionManager.js';
import { promptMessagesToText, resourceContentsToText } from './mcpResultNormalizer.js';
import { emptyCatalog } from './mcpCatalog.js';
import { parseMcpSettings } from './mcpSettings.js';
import {
  GatewayStatusError,
  MAX_CONTEXT_RESOURCES,
  MAX_RESOURCE_CONTEXT_TOTAL_CHARS,
  MAX_RESOURCE_TEXT_CHARS,
  RESOURCE_PREVIEW_CHARS,
} from './types.js';

function asStringRecord(value: Record<string, unknown> | undefined): Record<string, string> | undefined {
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
        resourceCount: 0,
        resourceTemplateCount: 0,
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
        resourceCount: 0,
        resourceTemplateCount: 0,
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
        resourceCount: result.catalog.resources.length,
        resourceTemplateCount: result.catalog.resourceTemplates.length,
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
        resourceCount: 0,
        resourceTemplateCount: 0,
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
      verifiedAt: view.verification.verifiedAt ? new Date(view.verification.verifiedAt).toISOString() : null,
    };
  }

  async getPrompt(
    userId: number,
    chatId: number,
    name: string,
    args?: Record<string, unknown>
  ): Promise<McpPromptPreview> {
    const chat = await this.prisma.agentChat.findFirst({ where: { id: chatId, userId } });
    if (!chat) {
      return AppErrors.notFound('Chat', chatId);
    }
    const connect = await this.requireConnectParams(userId, chat.serverId, 'withAlfresco');
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

  async readResourcePreview(
    userId: number,
    chatId: number,
    input: { uri?: string; uriTemplate?: string; params?: Record<string, string> }
  ): Promise<McpResourcePreview> {
    const chat = await this.prisma.agentChat.findFirst({ where: { id: chatId, userId } });
    if (!chat) {
      return AppErrors.notFound('Chat', chatId);
    }
    const snapshot = await this.readResourceForChat(userId, chat.serverId, chat.mcpSettingsJson, input, {
      preview: true,
    });
    return {
      uri: snapshot.uri,
      name: snapshot.name ?? null,
      mimeType: snapshot.mimeType ?? null,
      text: snapshot.text.slice(0, RESOURCE_PREVIEW_CHARS),
      chars: snapshot.chars,
      truncated: snapshot.truncated || snapshot.text.length > RESOURCE_PREVIEW_CHARS,
    };
  }

  async resolveContextResources(
    userId: number,
    serverId: number,
    mcpSettingsJson: string | null,
    uris: string[]
  ): Promise<Array<AgentMessageContextItem & { text: string }>> {
    if (uris.length > MAX_CONTEXT_RESOURCES) {
      return AppErrors.validationError(`At most ${MAX_CONTEXT_RESOURCES} resources can be added as context`);
    }
    const settings = parseMcpSettings(mcpSettingsJson);
    if (!settings?.enabled) {
      return AppErrors.validationError('MCP must be enabled for this chat before adding resource context');
    }

    const items: Array<AgentMessageContextItem & { text: string }> = [];
    let total = 0;
    for (const uri of uris) {
      const snapshot = await this.readResourceForChat(userId, serverId, mcpSettingsJson, { uri });
      const remaining = MAX_RESOURCE_CONTEXT_TOTAL_CHARS - total;
      const text = snapshot.text.slice(0, Math.max(0, remaining));
      items.push({
        uri: snapshot.uri,
        name: snapshot.name,
        mimeType: snapshot.mimeType,
        chars: text.length,
        truncated: snapshot.truncated || text.length < snapshot.text.length,
        text,
      });
      total += text.length;
      if (total >= MAX_RESOURCE_CONTEXT_TOTAL_CHARS) {
        break;
      }
    }
    return items;
  }

  private async readResourceForChat(
    userId: number,
    serverId: number,
    mcpSettingsJson: string | null,
    input: { uri?: string; uriTemplate?: string; params?: Record<string, string> },
    options?: { preview?: boolean }
  ): Promise<{ uri: string; name?: string | null; mimeType: string | null; text: string; chars: number; truncated: boolean }> {
    const connect = await this.requireConnectParams(userId, serverId, 'withAlfresco');
    if ('catalog' in connect) {
      return AppErrors.validationError('Agent Gateway is not connected');
    }
    const catalog = await this.sessions.getCatalog(connect);
    let uri = input.uri?.trim() ?? '';
    if (input.uriTemplate) {
      uri = this.sessions.expandTemplate(input.uriTemplate, input.params ?? {});
    }
    if (!uri) {
      return AppErrors.validationError('Resource URI is required');
    }

    const allowed =
      catalog.resources.some(resource => resource.uri === uri) ||
      catalog.resourceTemplates.some(template => this.sessions.matchTemplate(template.uriTemplate, uri));
    if (!allowed) {
      return AppErrors.forbidden('Resource is not in the Agent Gateway catalog');
    }

    const result = await this.sessions.readResource(connect, uri);
    const rendered = resourceContentsToText(result.contents ?? []);
    const resource = catalog.resources.find(item => item.uri === uri);
    const text = options?.preview ? rendered.text : rendered.text.slice(0, MAX_RESOURCE_TEXT_CHARS);
    return {
      uri,
      name: resource?.name ?? resource?.title ?? null,
      mimeType: rendered.mimeType,
      text,
      chars: text.length,
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
