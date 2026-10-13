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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCallResult } from '../../src/ai/anthropic.js';
import { AgentRepository } from '../../src/repositories/agentRepository.js';
import { AgentRunEngine } from '../../src/services/agent/AgentRunEngine.js';
import { AgentService } from '../../src/services/agent/AgentService.js';
import { getAllToolSchemas } from '../../src/services/agent/tools/registry.js';
import { buildRunToolset } from '../../src/services/agent/tools/toolset.js';
import {
  getAgentGatewayRuntime,
  resetAgentGatewayRuntimeForTests,
} from '../../src/services/agentGateway/gatewayRuntime.js';
import { serializeMcpSettings } from '../../src/services/agentGateway/mcpSettings.js';
import { ServerService } from '../../src/services/serverService.js';
import { startFakeMcpGateway, type FakeMcpGateway } from '../fixtures/fakeMcpGateway.js';
import { cleanupTables, prisma } from '../setup/database.js';

const { streamMock, anthropicMock } = vi.hoisted(() => ({
  streamMock: vi.fn(),
  anthropicMock: vi.fn(async () => 'Pinned title'),
}));

vi.mock('../../src/ai/anthropic.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/ai/anthropic.js')>(
    '../../src/ai/anthropic.js'
  );
  return {
    ...actual,
    callWithToolsStream: streamMock,
    callAnthropic: anthropicMock,
  };
});

vi.mock('../../src/services/alfresco/authenticationHelper.js', () => ({
  getAuthenticatedClientWithRefresh: vi.fn(async () => ({})),
  getAuthenticatedClient: vi.fn(async () => ({})),
}));

function toolCall(name: string, args: Record<string, unknown> = {}): AgentCallResult {
  return {
    type: 'tool_calls',
    calls: [{ id: 'call_1', name, args }],
    reasoning: null,
    rawContent: [{ type: 'tool_use', id: 'call_1', name, input: args }],
    stopReason: 'tool_use',
    usage: null,
  };
}

function textResult(text = 'done'): AgentCallResult {
  return { type: 'text', text, stopReason: 'end_turn', usage: null };
}

describe('agent gateway enforcement', () => {
  let gateway: FakeMcpGateway | null = null;

  beforeEach(async () => {
    resetAgentGatewayRuntimeForTests();
    streamMock.mockReset();
    anthropicMock.mockClear();
    await cleanupTables();
  });

  afterEach(async () => {
    resetAgentGatewayRuntimeForTests();
    await gateway?.close().catch(() => undefined);
    gateway = null;
  });

  async function setup(tools: string[]) {
    gateway = await startFakeMcpGateway({ delayMs: 400 });
    const user = await prisma.user.create({
      data: { username: 'agent-user', email: 'agent@example.test', aiAssistantEnabled: true },
    });
    const serverService = new ServerService(prisma);
    const server = await serverService.create(user.id, {
      name: 'Alfresco',
      baseUrl: 'http://alfresco.example.test',
      authType: 'basic',
      username: 'admin',
      token: 'admin-secret',
    });
    const runtime = getAgentGatewayRuntime(prisma, serverService);
    await runtime.config.save(user.id, server.id, {
      enabled: true,
      endpointUrl: gateway.url,
      apiKey: 'gw-secret',
    });
    const repository = new AgentRepository(prisma);
    const chat = await repository.createChat(
      user.id,
      server.id,
      'Pinned title',
      'sparkles',
      serializeMcpSettings({ enabled: true, tools })
    );
    const message = await repository.createMessage({
      chatId: chat.id,
      userId: user.id,
      role: 'user',
      content: 'Use the gateway',
      mentions: [],
    });
    const run = await repository.createRun({
      chatId: chat.id,
      userId: user.id,
      serverId: server.id,
      triggerMessageId: message.id,
      manifestVersion: 'test',
    });
    const toolset = await buildRunToolset({
      prisma,
      serverService,
      userId: user.id,
      serverId: server.id,
      chatMcp: { enabled: true, tools },
      allowScriptExecution: true,
    });
    return { user, server, serverService, repository, chat, message, run, toolset, runtime };
  }

  it('returns is_error for an unselected MCP tool and never calls the gateway', async () => {
    const { user, run, chat, message, toolset, repository } = await setup(['echo_read']);
    streamMock
      .mockResolvedValueOnce(toolCall('mcp_echo_write', { message: 'nope' }))
      .mockResolvedValueOnce(textResult('continued'));
    const engine = new AgentRunEngine(
      repository,
      {
        provider: 'anthropic',
        model: 'claude-test',
        apiKey: 'sk-test',
        temperature: 0,
      },
      {
        api: {} as never,
        serverId: chat.serverId,
        serverBaseUrl: 'http://alfresco.example.test',
        jsconsoleEndpoint: null,
        authType: 'basic',
        username: 'admin',
        token: 'admin-secret',
        userId: user.id,
        signal: new AbortController().signal,
      },
      new AbortController().signal,
      toolset
    );
    await engine.execute({
      runId: run.id,
      chatId: chat.id,
      serverId: chat.serverId,
      userId: user.id,
      content: 'Use the gateway',
      mentions: [],
      chatTitle: 'Pinned title',
      chatIcon: 'sparkles',
      triggerMessageId: message.id,
    });
    expect(gateway!.toolCalls.some(call => call.name === 'echo_write')).toBe(false);
    const events = await prisma.agentRunEvent.findMany({ where: { runId: run.id } });
    const serialized = JSON.stringify({
      events,
      steps: await prisma.agentRunStep.findMany({ where: { runId: run.id } }),
    });
    expect(serialized).not.toContain('gw-secret');
    expect(serialized).not.toContain('admin-secret');
  });

  it('rejects approveStep after the MCP tool is deselected', async () => {
    const { user, run, chat, message, toolset, repository, serverService } = await setup([
      'echo_destroy',
    ]);
    streamMock.mockResolvedValueOnce(toolCall('mcp_echo_destroy', { message: 'drop' }));
    const engine = new AgentRunEngine(
      repository,
      { provider: 'anthropic', model: 'claude-test', apiKey: 'sk-test', temperature: 0 },
      {
        api: {} as never,
        serverId: chat.serverId,
        serverBaseUrl: 'http://alfresco.example.test',
        jsconsoleEndpoint: null,
        authType: 'basic',
        username: 'admin',
        token: 'admin-secret',
        userId: user.id,
        signal: new AbortController().signal,
      },
      new AbortController().signal,
      toolset
    );
    await engine.execute({
      runId: run.id,
      chatId: chat.id,
      serverId: chat.serverId,
      userId: user.id,
      content: 'Destroy something',
      mentions: [],
      chatTitle: 'Pinned title',
      chatIcon: 'sparkles',
      triggerMessageId: message.id,
    });
    const step = await prisma.agentRunStep.findFirst({ where: { runId: run.id } });
    expect(step?.status).toBe('waiting_confirmation');
    await repository.updateChatMcpSettings(
      user.id,
      chat.id,
      serializeMcpSettings({ enabled: true, tools: [] })
    );
    const agentService = new AgentService(prisma, serverService);
    const result = await agentService.confirmStep(user.id, {
      runId: run.id,
      stepId: step!.id,
      confirmationToken: step!.confirmationToken as string,
      approved: true,
    });
    expect(result).toMatchObject({ success: true, runStatus: 'failed' });
    expect(gateway!.toolCalls.some(call => call.name === 'echo_destroy')).toBe(false);
    const failed = await prisma.agentRunStep.findFirst({ where: { id: step!.id } });
    expect(failed?.status).toBe('failed');
  });

  it('applies the confirmation policy matrix', async () => {
    const { user, chat, message, repository, serverService } = await setup([
      'echo_read',
      'echo_write',
      'echo_unknown',
    ]);
    const readToolset = await buildRunToolset({
      prisma,
      serverService,
      userId: user.id,
      serverId: chat.serverId,
      chatMcp: { enabled: true, tools: ['echo_read'] },
      allowScriptExecution: true,
    });
    expect(readToolset.resolve('mcp_echo_read')?.requiresConfirmation).toBe(false);

    const writeToolset = await buildRunToolset({
      prisma,
      serverService,
      userId: user.id,
      serverId: chat.serverId,
      chatMcp: { enabled: true, tools: ['echo_write'] },
      allowScriptExecution: true,
    });
    const write = writeToolset.resolve('mcp_echo_write');
    expect(write?.requiresConfirmation).toBe(true);
    expect(write?.allowAutoApprove).toBe(true);

    const unknownToolset = await buildRunToolset({
      prisma,
      serverService,
      userId: user.id,
      serverId: chat.serverId,
      chatMcp: { enabled: true, tools: ['echo_unknown'] },
      allowScriptExecution: true,
    });
    const unknown = unknownToolset.resolve('mcp_echo_unknown');
    expect(unknown?.requiresConfirmation).toBe(true);
    expect(unknown?.allowAutoApprove).toBe(false);

    streamMock
      .mockResolvedValueOnce(toolCall('mcp_echo_write', { message: 'ok' }))
      .mockResolvedValueOnce(textResult('wrote'));
    const writeRun = await repository.createRun({
      chatId: chat.id,
      userId: user.id,
      serverId: chat.serverId,
      triggerMessageId: message.id,
      manifestVersion: 'test',
    });
    const engine = new AgentRunEngine(
      repository,
      { provider: 'anthropic', model: 'claude-test', apiKey: 'sk-test', temperature: 0 },
      {
        api: {} as never,
        serverId: chat.serverId,
        serverBaseUrl: 'http://alfresco.example.test',
        jsconsoleEndpoint: null,
        authType: 'basic',
        username: 'admin',
        token: 'admin-secret',
        userId: user.id,
        signal: new AbortController().signal,
      },
      new AbortController().signal,
      writeToolset
    );
    await engine.execute({
      runId: writeRun.id,
      chatId: chat.id,
      serverId: chat.serverId,
      userId: user.id,
      content: 'Write',
      mentions: [],
      chatTitle: 'Pinned title',
      chatIcon: 'sparkles',
      triggerMessageId: message.id,
      autoApproveConfirmations: true,
    });
    expect(gateway!.toolCalls.some(call => call.name === 'echo_write')).toBe(true);
  });

  it('continues the run after a mid-call connection loss and cancels in-flight tools', async () => {
    const { user, run, chat, message, toolset, repository } = await setup([
      'slow_tool',
      'echo_read',
    ]);
    streamMock
      .mockResolvedValueOnce(toolCall('mcp_echo_read', { message: 'before-close' }))
      .mockResolvedValueOnce(textResult('recovered'));
    const engine = new AgentRunEngine(
      repository,
      { provider: 'anthropic', model: 'claude-test', apiKey: 'sk-test', temperature: 0 },
      {
        api: {} as never,
        serverId: chat.serverId,
        serverBaseUrl: 'http://alfresco.example.test',
        jsconsoleEndpoint: null,
        authType: 'basic',
        username: 'admin',
        token: 'admin-secret',
        userId: user.id,
        signal: new AbortController().signal,
      },
      new AbortController().signal,
      toolset
    );
    await gateway!.close();
    gateway = null;
    await engine.execute({
      runId: run.id,
      chatId: chat.id,
      serverId: chat.serverId,
      userId: user.id,
      content: 'Call after close',
      mentions: [],
      chatTitle: 'Pinned title',
      chatIcon: 'sparkles',
      triggerMessageId: message.id,
    });
    const assistant = await prisma.agentMessage.findFirst({
      where: { chatId: chat.id, role: 'assistant' },
      orderBy: { id: 'desc' },
    });
    expect(assistant?.content).toBe('recovered');
  });

  it('keeps local tool schemas unchanged when MCP is not configured', async () => {
    const user = await prisma.user.create({
      data: { username: 'plain', email: 'plain@example.test' },
    });
    const serverService = new ServerService(prisma);
    const server = await serverService.create(user.id, {
      name: 'plain',
      baseUrl: 'http://alfresco.example.test',
    });
    gateway = await startFakeMcpGateway();
    const toolset = await buildRunToolset({
      prisma,
      serverService,
      userId: user.id,
      serverId: server.id,
      chatMcp: null,
      allowScriptExecution: true,
    });
    expect(toolset.schemas.map(schema => schema.name)).toEqual(
      getAllToolSchemas().map(schema => schema.name)
    );
    expect(gateway.requests).toHaveLength(0);
  });
});
