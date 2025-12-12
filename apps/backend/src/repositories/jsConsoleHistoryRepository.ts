/**
 * Copyright 2025 NodeRef
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
 * JavaScript Console History repository
 * Handles CRUD operations for JS console execution history
 */

import type { PrismaClient, JsConsoleHistory as PrismaJsConsoleHistory } from '@prisma/client';

export interface JsConsoleHistory {
  id: number;
  userId: number;
  serverId: number | null;
  script: string;
  output: string | null;
  error: string | null;
  executedAt: Date;
}

export interface CreateJsConsoleHistory {
  userId: number;
  serverId?: number | null;
  script: string;
  output?: string | null;
  error?: string | null;
}

export interface JsConsoleHistoryListOptions {
  serverId?: number;
  limit?: number;
  cursor?: number; // ID of the last item from previous page
}

/**
 * JavaScript Console History repository
 */
export class JsConsoleHistoryRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma JsConsoleHistory model to DTO
   */
  private toDTO(
    history: PrismaJsConsoleHistory & { server?: { id: number; name: string } | null }
  ): JsConsoleHistory & { server?: { id: number; name: string } | null } {
    return {
      id: history.id,
      userId: history.userId,
      serverId: history.serverId,
      script: history.script,
      output: history.output,
      error: history.error,
      executedAt: history.executedAt,
      server: history.server || undefined,
    };
  }

  /**
   * Create a new JS console history entry
   */
  async create(data: CreateJsConsoleHistory): Promise<JsConsoleHistory> {
    const history = await this.prisma.jsConsoleHistory.create({
      data: {
        userId: data.userId,
        serverId: data.serverId ?? null,
        script: data.script,
        output: data.output ?? null,
        error: data.error ?? null,
      },
    });
    return this.toDTO(history);
  }

  /**
   * List JS console history with pagination
   */
  async list(
    userId: number,
    options: JsConsoleHistoryListOptions = {}
  ): Promise<{
    items: Array<JsConsoleHistory & { server?: { id: number; name: string } | null }>;
    hasMore: boolean;
    nextCursor: number | null;
  }> {
    const { serverId, limit = 25, cursor } = options;

    const whereClause: any = {
      userId,
      ...(serverId ? { serverId } : {}),
    };

    // If cursor is provided, only fetch items with ID less than cursor
    if (cursor) {
      whereClause.id = { lt: cursor };
    }

    const history = await this.prisma.jsConsoleHistory.findMany({
      where: whereClause,
      orderBy: {
        executedAt: 'desc',
      },
      take: limit + 1, // Fetch one extra to check if there are more items
      include: {
        server: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const hasMore = history.length > limit;
    const items = hasMore ? history.slice(0, limit) : history;

    return {
      items: items.map(item => this.toDTO(item)),
      hasMore,
      nextCursor: items.length > 0 ? items[items.length - 1].id : null,
    };
  }
}
