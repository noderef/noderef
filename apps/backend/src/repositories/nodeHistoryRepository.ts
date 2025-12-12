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
 * Node History repository
 * Handles CRUD operations for node history
 */

import type { PrismaClient } from '@prisma/client';

export interface NodeHistoryRecordInput {
  userId: number;
  serverId: number;
  nodeRef: string | null | undefined;
  parentRef?: string | null;
  name?: string | null;
  path?: string | null;
  type?: string | null;
  mimetype?: string | null;
}

export interface NodeHistoryActivityOptions {
  serverId?: number;
  days?: number;
  limit?: number;
  offset?: number;
}

/**
 * Node History repository
 */
export class NodeHistoryRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Record a node access
   */
  async recordAccess(input: NodeHistoryRecordInput): Promise<void> {
    if (!input.nodeRef) {
      return;
    }

    await this.prisma.nodeHistory.create({
      data: {
        userId: input.userId,
        serverId: input.serverId,
        nodeRef: input.nodeRef,
        parentRef: input.parentRef ?? null,
        name: input.name ?? null,
        path: input.path ?? null,
        type: input.type ?? null,
        mimetype: input.mimetype ?? null,
      },
    });
  }

  /**
   * Get activity summary with timeline and heatmap
   */
  async getActivitySummary(
    userId: number,
    options: NodeHistoryActivityOptions = {}
  ): Promise<{
    timeline: Array<{
      id: number;
      nodeRef: string;
      parentRef: string | null;
      name: string | null;
      path: string | null;
      type: string | null;
      mimetype: string | null;
      accessedAt: string;
      serverId: number;
      serverName: string | null;
      serverLabel: string | null;
    }>;
    heatmap: Array<{ date: string; count: number }>;
  }> {
    const { serverId, days = 180, limit = 30, offset = 0 } = options;

    const normalizedDays = Math.max(1, Math.min(days, 366));
    const normalizedLimit = Math.max(1, Math.min(limit, 200));
    const normalizedOffset = Math.max(0, offset);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - (normalizedDays - 1));

    const whereClause: { userId: number; serverId?: number } = { userId };
    if (typeof serverId === 'number') {
      whereClause.serverId = serverId;
    }

    const timelineRecords = await this.prisma.nodeHistory.findMany({
      where: whereClause,
      orderBy: { accessedAt: 'desc' },
      skip: normalizedOffset,
      take: normalizedLimit,
      include: {
        server: {
          select: {
            id: true,
            name: true,
            label: true,
          },
        },
      },
    });

    const timeline = timelineRecords.map(record => ({
      id: record.id,
      nodeRef: record.nodeRef,
      parentRef: record.parentRef ?? null,
      name: record.name,
      path: record.path,
      type: record.type,
      mimetype: record.mimetype,
      accessedAt: record.accessedAt.toISOString(),
      serverId: record.serverId,
      serverName: record.server?.name ?? null,
      serverLabel: record.server?.label ?? null,
    }));

    const heatmapSource = await this.prisma.nodeHistory.findMany({
      where: {
        ...whereClause,
        accessedAt: {
          gte: windowStart,
        },
      },
      select: {
        accessedAt: true,
      },
    });

    const toLocalDateString = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const counts = new Map<string, number>();
    for (const record of heatmapSource) {
      const key = toLocalDateString(record.accessedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const heatmap: Array<{ date: string; count: number }> = [];
    for (let dayOffset = normalizedDays - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - dayOffset);
      const key = toLocalDateString(day);
      heatmap.push({
        date: key,
        count: counts.get(key) ?? 0,
      });
    }

    return {
      timeline,
      heatmap,
    };
  }
}
