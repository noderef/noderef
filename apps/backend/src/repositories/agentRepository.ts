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
  AgentMention,
  AgentMessageRole,
  AgentRunStatus,
  AgentRunStepStatus,
} from '@app/contracts';
import type {
  AgentChat as PrismaAgentChat,
  AgentMessage as PrismaAgentMessage,
  AgentOperationAudit as PrismaAgentOperationAudit,
  AgentRun as PrismaAgentRun,
  AgentRunEvent as PrismaAgentRunEvent,
  AgentRunStep as PrismaAgentRunStep,
  PrismaClient,
} from '@prisma/client';

export interface AgentChatSummary {
  id: number;
  userId: number;
  serverId: number;
  title: string;
  chatIcon: string;
  hasActiveRun: boolean;
  hasWaitingConfirmation: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMessage {
  id: number;
  chatId: number;
  userId: number;
  role: AgentMessageRole;
  content: string;
  mentions: AgentMention[];
  createdAt: Date;
}

export interface AgentRun {
  id: number;
  chatId: number;
  userId: number;
  serverId: number;
  triggerMessageId: number | null;
  status: AgentRunStatus;
  manifestVersion: string;
  plan: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRunStep {
  id: number;
  runId: number;
  ordinal: number;
  operation: string;
  status: AgentRunStepStatus;
  summary: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  requiresConfirmation: boolean;
  confirmationToken: string | null;
  confirmedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface AgentRunEvent {
  id: number;
  runId: number;
  stepId: number | null;
  type: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AgentOperationAudit {
  id: number;
  runId: number;
  stepId: number | null;
  userId: number;
  serverId: number;
  operation: string;
  action: string;
  targetSummary: string | null;
  requestMessageId: number | null;
  confirmationMessageId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

interface ListOptions {
  skipCount?: number;
  maxItems?: number;
}

const safeJsonParse = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid rows and return null.
  }

  return null;
};

const safeMentionsParse = (raw: string | null): AgentMention[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const typed = item as Partial<AgentMention>;
        if (!typed.id || !typed.type || !typed.label) {
          return null;
        }

        if (!['node', 'person', 'group', 'server'].includes(typed.type)) {
          return null;
        }

        return {
          id: String(typed.id),
          type: typed.type,
          label: String(typed.label),
          path: typed.path ?? null,
        } as AgentMention;
      })
      .filter((item): item is AgentMention => Boolean(item));
  } catch {
    return [];
  }
};

export class AgentRepository {
  constructor(private prisma: PrismaClient) {}

  private toChatDTO(
    chat: PrismaAgentChat,
    flags?: { hasActiveRun?: boolean; hasWaitingConfirmation?: boolean }
  ): AgentChatSummary {
    return {
      id: chat.id,
      userId: chat.userId,
      serverId: chat.serverId,
      title: chat.title,
      chatIcon: chat.chatIcon,
      hasActiveRun: Boolean(flags?.hasActiveRun),
      hasWaitingConfirmation: Boolean(flags?.hasWaitingConfirmation),
      lastMessageAt: chat.lastMessageAt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  private toMessageDTO(message: PrismaAgentMessage): AgentMessage {
    return {
      id: message.id,
      chatId: message.chatId,
      userId: message.userId,
      role: message.role as AgentMessageRole,
      content: message.content,
      mentions: safeMentionsParse(message.mentionsJson),
      createdAt: message.createdAt,
    };
  }

  private toRunDTO(run: PrismaAgentRun): AgentRun {
    return {
      id: run.id,
      chatId: run.chatId,
      userId: run.userId,
      serverId: run.serverId,
      triggerMessageId: run.triggerMessageId,
      status: run.status as AgentRunStatus,
      manifestVersion: run.manifestVersion,
      plan: safeJsonParse(run.planJson),
      error: run.error,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private toRunStepDTO(step: PrismaAgentRunStep): AgentRunStep {
    return {
      id: step.id,
      runId: step.runId,
      ordinal: step.ordinal,
      operation: step.operation,
      status: step.status as AgentRunStepStatus,
      summary: step.summary,
      input: safeJsonParse(step.inputJson),
      output: safeJsonParse(step.outputJson),
      requiresConfirmation: step.requiresConfirmation,
      confirmationToken: step.confirmationToken,
      confirmedAt: step.confirmedAt,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      createdAt: step.createdAt,
    };
  }

  private toRunEventDTO(event: PrismaAgentRunEvent): AgentRunEvent {
    const payload = safeJsonParse(event.payloadJson);
    return {
      id: event.id,
      runId: event.runId,
      stepId: event.stepId,
      type: event.type,
      level: event.level as AgentRunEvent['level'],
      payload,
      createdAt: event.createdAt,
    };
  }

  private toAuditDTO(audit: PrismaAgentOperationAudit): AgentOperationAudit {
    return {
      id: audit.id,
      runId: audit.runId,
      stepId: audit.stepId,
      userId: audit.userId,
      serverId: audit.serverId,
      operation: audit.operation,
      action: audit.action,
      targetSummary: audit.targetSummary,
      requestMessageId: audit.requestMessageId,
      confirmationMessageId: audit.confirmationMessageId,
      metadata: safeJsonParse(audit.metadataJson),
      createdAt: audit.createdAt,
    };
  }

  async listChats(
    userId: number,
    options: ListOptions & { serverId?: number } = {}
  ): Promise<{ items: AgentChatSummary[]; totalItems: number }> {
    const maxItems = Math.max(1, Math.min(options.maxItems ?? 50, 100));
    const skipCount = Math.max(0, options.skipCount ?? 0);

    const where = {
      userId,
      ...(options.serverId ? { serverId: options.serverId } : {}),
    };

    const [rows, totalItems] = await Promise.all([
      this.prisma.agentChat.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip: skipCount,
        take: maxItems,
      }),
      this.prisma.agentChat.count({ where }),
    ]);

    let activeChatIds = new Set<number>();
    let waitingConfirmationChatIds = new Set<number>();
    if (rows.length > 0) {
      const activeRunGroups = await this.prisma.agentRun.groupBy({
        by: ['chatId', 'status'],
        where: {
          userId,
          chatId: { in: rows.map(row => row.id) },
          status: { in: ['queued', 'running', 'waiting_confirmation'] },
        },
      });
      activeChatIds = new Set(activeRunGroups.map(group => group.chatId));
      waitingConfirmationChatIds = new Set(
        activeRunGroups
          .filter(group => group.status === 'waiting_confirmation')
          .map(group => group.chatId)
      );
    }

    return {
      items: rows.map(row =>
        this.toChatDTO(row, {
          hasActiveRun: activeChatIds.has(row.id),
          hasWaitingConfirmation: waitingConfirmationChatIds.has(row.id),
        })
      ),
      totalItems,
    };
  }

  async searchChats(
    userId: number,
    options: { query: string; serverId?: number; maxItems?: number }
  ): Promise<AgentChatSummary[]> {
    const maxItems = Math.max(1, Math.min(options.maxItems ?? 10, 50));

    const rows = await this.prisma.agentChat.findMany({
      where: {
        userId,
        ...(options.serverId ? { serverId: options.serverId } : {}),
        messages: {
          some: {
            content: {
              contains: options.query,
            },
          },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      take: maxItems,
    });

    let activeChatIds = new Set<number>();
    let waitingConfirmationChatIds = new Set<number>();
    if (rows.length > 0) {
      const activeRunGroups = await this.prisma.agentRun.groupBy({
        by: ['chatId', 'status'],
        where: {
          userId,
          chatId: { in: rows.map(row => row.id) },
          status: { in: ['queued', 'running', 'waiting_confirmation'] },
        },
      });
      activeChatIds = new Set(activeRunGroups.map(group => group.chatId));
      waitingConfirmationChatIds = new Set(
        activeRunGroups
          .filter(group => group.status === 'waiting_confirmation')
          .map(group => group.chatId)
      );
    }

    return rows.map(row =>
      this.toChatDTO(row, {
        hasActiveRun: activeChatIds.has(row.id),
        hasWaitingConfirmation: waitingConfirmationChatIds.has(row.id),
      })
    );
  }

  async findChatById(userId: number, chatId: number): Promise<AgentChatSummary | null> {
    const chat = await this.prisma.agentChat.findFirst({ where: { id: chatId, userId } });
    return chat ? this.toChatDTO(chat) : null;
  }

  async createChat(
    userId: number,
    serverId: number,
    title: string,
    chatIcon = 'hash'
  ): Promise<AgentChatSummary> {
    const chat = await this.prisma.agentChat.create({
      data: {
        userId,
        serverId,
        title,
        chatIcon,
      },
    });

    return this.toChatDTO(chat);
  }

  async updateChatPresentation(
    userId: number,
    chatId: number,
    data: { title?: string; chatIcon?: string }
  ): Promise<AgentChatSummary | null> {
    const existing = await this.prisma.agentChat.findFirst({ where: { id: chatId, userId } });
    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = {};
    if (typeof data.title === 'string' && data.title.trim()) {
      updates.title = data.title.trim();
    }
    if (typeof data.chatIcon === 'string' && data.chatIcon.trim()) {
      updates.chatIcon = data.chatIcon.trim();
    }
    if (!Object.keys(updates).length) {
      return this.toChatDTO(existing);
    }

    const updated = await this.prisma.agentChat.update({
      where: { id: chatId },
      data: updates,
    });

    return this.toChatDTO(updated);
  }

  async deleteChat(userId: number, chatId: number): Promise<boolean> {
    const existing = await this.prisma.agentChat.findFirst({ where: { id: chatId, userId } });
    if (!existing) {
      return false;
    }

    await this.prisma.agentChat.delete({ where: { id: chatId } });
    return true;
  }

  async listMessages(
    userId: number,
    chatId: number,
    options: { beforeId?: number; maxItems?: number } = {}
  ): Promise<AgentMessage[]> {
    const maxItems = Math.max(1, Math.min(options.maxItems ?? 100, 200));
    const beforeId = options.beforeId;

    const chat = await this.prisma.agentChat.findFirst({ where: { id: chatId, userId } });
    if (!chat) {
      return [];
    }

    const rows = await this.prisma.agentMessage.findMany({
      where: {
        chatId,
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      orderBy: { id: 'desc' },
      take: maxItems,
    });

    return rows.reverse().map(row => this.toMessageDTO(row));
  }

  async getRecentMessages(
    chatId: number,
    options: { maxItems?: number; excludeMessageId?: number } = {}
  ): Promise<AgentMessage[]> {
    const maxItems = Math.max(1, Math.min(options.maxItems ?? 20, 50));

    const rows = await this.prisma.agentMessage.findMany({
      where: {
        chatId,
        ...(options.excludeMessageId ? { id: { not: options.excludeMessageId } } : {}),
      },
      orderBy: { id: 'desc' },
      take: maxItems,
      select: {
        id: true,
        chatId: true,
        userId: true,
        role: true,
        content: true,
        mentionsJson: true,
        createdAt: true,
      },
    });

    return rows.reverse().map(row => this.toMessageDTO(row));
  }

  async createMessage(data: {
    chatId: number;
    userId: number;
    role: AgentMessageRole;
    content: string;
    mentions?: AgentMention[];
  }): Promise<AgentMessage> {
    const now = new Date();
    const mentionsJson =
      data.mentions && data.mentions.length ? JSON.stringify(data.mentions) : null;

    const message = await this.prisma.$transaction(async tx => {
      const created = await tx.agentMessage.create({
        data: {
          chatId: data.chatId,
          userId: data.userId,
          role: data.role,
          content: data.content,
          mentionsJson,
        },
      });

      await tx.agentChat.update({
        where: { id: data.chatId },
        data: {
          lastMessageAt: now,
          updatedAt: now,
        },
      });

      return created;
    });

    return this.toMessageDTO(message);
  }

  async createRun(data: {
    chatId: number;
    userId: number;
    serverId: number;
    triggerMessageId?: number | null;
    manifestVersion: string;
    plan?: Record<string, unknown> | null;
  }): Promise<AgentRun> {
    const run = await this.prisma.agentRun.create({
      data: {
        chatId: data.chatId,
        userId: data.userId,
        serverId: data.serverId,
        triggerMessageId: data.triggerMessageId ?? null,
        status: 'queued',
        manifestVersion: data.manifestVersion,
        planJson: data.plan ? JSON.stringify(data.plan) : null,
      },
    });

    return this.toRunDTO(run);
  }

  async findRunById(userId: number, runId: number): Promise<AgentRun | null> {
    const run = await this.prisma.agentRun.findFirst({ where: { id: runId, userId } });
    return run ? this.toRunDTO(run) : null;
  }

  async listRuns(
    userId: number,
    chatId: number,
    options: ListOptions = {}
  ): Promise<{
    items: Array<AgentRun & { pendingStep: AgentRunStep | null }>;
    totalItems: number;
  }> {
    const maxItems = Math.max(1, Math.min(options.maxItems ?? 50, 100));
    const skipCount = Math.max(0, options.skipCount ?? 0);

    const [rows, totalItems] = await Promise.all([
      this.prisma.agentRun.findMany({
        where: { userId, chatId },
        include: {
          steps: {
            where: {
              status: 'waiting_confirmation',
            },
            orderBy: { ordinal: 'asc' },
            take: 1,
          },
        },
        orderBy: { id: 'desc' },
        skip: skipCount,
        take: maxItems,
      }),
      this.prisma.agentRun.count({ where: { userId, chatId } }),
    ]);

    return {
      items: rows.map(row => ({
        ...this.toRunDTO(row),
        pendingStep: row.steps[0] ? this.toRunStepDTO(row.steps[0]) : null,
      })),
      totalItems,
    };
  }

  async updateRun(
    userId: number,
    runId: number,
    data: {
      status?: AgentRunStatus;
      plan?: Record<string, unknown> | null;
      error?: string | null;
      startedAt?: Date | null;
      finishedAt?: Date | null;
    }
  ): Promise<AgentRun | null> {
    const existing = await this.prisma.agentRun.findFirst({ where: { id: runId, userId } });
    if (!existing) {
      return null;
    }

    const run = await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.plan !== undefined
          ? { planJson: data.plan ? JSON.stringify(data.plan) : null }
          : {}),
        ...(data.error !== undefined ? { error: data.error } : {}),
        ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
      },
    });

    return this.toRunDTO(run);
  }

  async createRunStep(data: {
    runId: number;
    ordinal: number;
    operation: string;
    status: AgentRunStepStatus;
    summary?: string | null;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    requiresConfirmation?: boolean;
    confirmationToken?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    confirmedAt?: Date | null;
  }): Promise<AgentRunStep> {
    const row = await this.prisma.agentRunStep.create({
      data: {
        runId: data.runId,
        ordinal: data.ordinal,
        operation: data.operation,
        status: data.status,
        summary: data.summary ?? null,
        inputJson: data.input ? JSON.stringify(data.input) : null,
        outputJson: data.output ? JSON.stringify(data.output) : null,
        requiresConfirmation: data.requiresConfirmation ?? false,
        confirmationToken: data.confirmationToken ?? null,
        startedAt: data.startedAt ?? null,
        completedAt: data.completedAt ?? null,
        confirmedAt: data.confirmedAt ?? null,
      },
    });

    return this.toRunStepDTO(row);
  }

  async getMaxRunStepOrdinal(runId: number): Promise<number> {
    const row = await this.prisma.agentRunStep.findFirst({
      where: { runId },
      orderBy: { ordinal: 'desc' },
      select: { ordinal: true },
    });
    return row?.ordinal ?? 0;
  }

  async findRunStep(userId: number, runId: number, stepId: number): Promise<AgentRunStep | null> {
    const row = await this.prisma.agentRunStep.findFirst({
      where: {
        id: stepId,
        runId,
        run: { userId },
      },
    });

    return row ? this.toRunStepDTO(row) : null;
  }

  async updateRunStep(
    userId: number,
    runId: number,
    stepId: number,
    data: {
      status?: AgentRunStepStatus;
      summary?: string | null;
      input?: Record<string, unknown> | null;
      output?: Record<string, unknown> | null;
      confirmationToken?: string | null;
      confirmedAt?: Date | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
    }
  ): Promise<AgentRunStep | null> {
    const existing = await this.prisma.agentRunStep.findFirst({
      where: {
        id: stepId,
        runId,
        run: { userId },
      },
    });

    if (!existing) {
      return null;
    }

    const row = await this.prisma.agentRunStep.update({
      where: { id: stepId },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.summary !== undefined ? { summary: data.summary } : {}),
        ...(data.input !== undefined
          ? { inputJson: data.input ? JSON.stringify(data.input) : null }
          : {}),
        ...(data.output !== undefined
          ? { outputJson: data.output ? JSON.stringify(data.output) : null }
          : {}),
        ...(data.confirmationToken !== undefined
          ? { confirmationToken: data.confirmationToken }
          : {}),
        ...(data.confirmedAt !== undefined ? { confirmedAt: data.confirmedAt } : {}),
        ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
        ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
      },
    });

    return this.toRunStepDTO(row);
  }

  async createRunEvent(data: {
    runId: number;
    stepId?: number | null;
    type: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    payload?: Record<string, unknown> | null;
  }): Promise<AgentRunEvent> {
    const row = await this.prisma.agentRunEvent.create({
      data: {
        runId: data.runId,
        stepId: data.stepId ?? null,
        type: data.type,
        level: data.level,
        payloadJson: data.payload ? JSON.stringify(data.payload) : null,
      },
    });

    return this.toRunEventDTO(row);
  }

  async listRunEvents(
    userId: number,
    runId: number,
    options: { afterId?: number; maxItems?: number } = {}
  ): Promise<AgentRunEvent[]> {
    const maxItems = Math.max(1, Math.min(options.maxItems ?? 200, 500));
    const afterId = options.afterId;

    const run = await this.prisma.agentRun.findFirst({ where: { id: runId, userId } });
    if (!run) {
      return [];
    }

    const rows = await this.prisma.agentRunEvent.findMany({
      where: {
        runId,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: maxItems,
    });

    return rows.map(row => this.toRunEventDTO(row));
  }

  async createOperationAudit(data: {
    runId: number;
    stepId?: number | null;
    userId: number;
    serverId: number;
    operation: string;
    action: string;
    targetSummary?: string | null;
    requestMessageId?: number | null;
    confirmationMessageId?: number | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<AgentOperationAudit> {
    const row = await this.prisma.agentOperationAudit.create({
      data: {
        runId: data.runId,
        stepId: data.stepId ?? null,
        userId: data.userId,
        serverId: data.serverId,
        operation: data.operation,
        action: data.action,
        targetSummary: data.targetSummary ?? null,
        requestMessageId: data.requestMessageId ?? null,
        confirmationMessageId: data.confirmationMessageId ?? null,
        metadataJson: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });

    return this.toAuditDTO(row);
  }
}
