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

/**
 * Insight Graph repository
 * Handles CRUD operations for insight graphs and snapshot storage
 */

import type {
  PrismaClient,
  InsightGraph as PrismaInsightGraph,
  InsightSnapshot as PrismaInsightSnapshot,
} from '@prisma/client';

export interface InsightGraph {
  id: number;
  userId: number;
  serverId: number;
  title: string;
  type: string;
  isPinned: boolean;
  pinnedAt: Date | null;
  filterQuery: string;
  dateField: string;
  color: string;
  displayOrder: number;
  columnSpan: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsightSnapshot {
  id: number;
  graphId: number;
  bucketDate: string;
  totalItems: number;
  queryHash: string;
  fetchedAt: Date;
}

export interface CreateInsightGraph {
  userId: number;
  serverId: number;
  title: string;
  type?: string;
  isPinned?: boolean;
  pinnedAt?: Date | null;
  filterQuery: string;
  dateField: string;
  color?: string;
  displayOrder?: number;
  columnSpan?: number;
}

export interface UpdateInsightGraph {
  title?: string;
  type?: string;
  isPinned?: boolean;
  pinnedAt?: Date | null;
  filterQuery?: string;
  dateField?: string;
  color?: string;
  displayOrder?: number;
  columnSpan?: number;
}

export interface PinnedInsightGraph extends InsightGraph {
  serverName: string;
  serverLabel: string | null;
}

/**
 * Insight Graph repository
 */
export class InsightGraphRepository {
  constructor(private prisma: PrismaClient) {}

  private toGraphDTO(graph: PrismaInsightGraph): InsightGraph {
    return {
      id: graph.id,
      userId: graph.userId,
      serverId: graph.serverId,
      title: graph.title,
      type: graph.type,
      isPinned: graph.isPinned,
      pinnedAt: graph.pinnedAt,
      filterQuery: graph.filterQuery,
      dateField: graph.dateField,
      color: graph.color,
      displayOrder: graph.displayOrder,
      columnSpan: graph.columnSpan,
      createdAt: graph.createdAt,
      updatedAt: graph.updatedAt,
    };
  }

  private toSnapshotDTO(snapshot: PrismaInsightSnapshot): InsightSnapshot {
    return {
      id: snapshot.id,
      graphId: snapshot.graphId,
      bucketDate: snapshot.bucketDate,
      totalItems: snapshot.totalItems,
      queryHash: snapshot.queryHash,
      fetchedAt: snapshot.fetchedAt,
    };
  }

  /**
   * Find insight graph by ID (scoped to user)
   */
  async findById(userId: number, id: number): Promise<InsightGraph | null> {
    const graph = await this.prisma.insightGraph.findFirst({
      where: { id, userId },
    });
    return graph ? this.toGraphDTO(graph) : null;
  }

  /**
   * Find all insight graphs for a user and server
   */
  async findAllByServer(userId: number, serverId: number): Promise<InsightGraph[]> {
    const graphs = await this.prisma.insightGraph.findMany({
      where: { userId, serverId },
      orderBy: { displayOrder: 'asc' },
    });
    return graphs.map(g => this.toGraphDTO(g));
  }

  /**
   * Create a new insight graph
   */
  async create(data: CreateInsightGraph): Promise<InsightGraph> {
    const graph = await this.prisma.insightGraph.create({
      data: {
        userId: data.userId,
        serverId: data.serverId,
        title: data.title.trim(),
        type: data.type?.trim() || 'area',
        isPinned: data.isPinned ?? false,
        pinnedAt: data.isPinned ? (data.pinnedAt ?? new Date()) : null,
        filterQuery: data.filterQuery.trim(),
        dateField: data.dateField.trim(),
        color: data.color || '#228be6',
        displayOrder: data.displayOrder ?? 0,
        columnSpan: data.columnSpan ?? 1,
      },
    });
    return this.toGraphDTO(graph);
  }

  /**
   * Update an insight graph (scoped to user)
   */
  async update(userId: number, id: number, data: UpdateInsightGraph): Promise<InsightGraph | null> {
    const existing = await this.prisma.insightGraph.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.type !== undefined) updateData.type = data.type.trim();
    if (data.isPinned !== undefined) {
      updateData.isPinned = data.isPinned;
      if (data.isPinned) {
        updateData.pinnedAt = existing.isPinned ? existing.pinnedAt : (data.pinnedAt ?? new Date());
      } else {
        updateData.pinnedAt = null;
      }
    } else if (data.pinnedAt !== undefined) {
      updateData.pinnedAt = data.pinnedAt;
    }
    if (data.filterQuery !== undefined) updateData.filterQuery = data.filterQuery.trim();
    if (data.dateField !== undefined) updateData.dateField = data.dateField.trim();
    if (data.color !== undefined) updateData.color = data.color;
    if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
    if (data.columnSpan !== undefined) updateData.columnSpan = data.columnSpan;

    const graph = await this.prisma.insightGraph.update({
      where: { id },
      data: updateData,
    });
    return this.toGraphDTO(graph);
  }

  /**
   * Find all pinned insight graphs for a user across all servers.
   */
  async findPinnedByUser(userId: number): Promise<PinnedInsightGraph[]> {
    const graphs = await this.prisma.insightGraph.findMany({
      where: { userId, isPinned: true },
      include: {
        server: {
          select: {
            name: true,
            label: true,
          },
        },
      },
      orderBy: [{ pinnedAt: 'asc' }, { id: 'asc' }],
    });

    return graphs.map(graph => ({
      ...this.toGraphDTO(graph),
      serverName: graph.server.name,
      serverLabel: graph.server.label,
    }));
  }

  /**
   * Delete an insight graph (scoped to user)
   */
  async delete(userId: number, id: number): Promise<boolean> {
    const graph = await this.prisma.insightGraph.findFirst({
      where: { id, userId },
    });
    if (!graph) {
      return false;
    }

    await this.prisma.insightGraph.delete({ where: { id } });
    return true;
  }

  /**
   * Find existing snapshots for given graph, hash, and dates
   */
  async findSnapshots(
    graphId: number,
    queryHash: string,
    bucketDates: string[]
  ): Promise<InsightSnapshot[]> {
    if (bucketDates.length === 0) return [];

    const snapshots = await this.prisma.insightSnapshot.findMany({
      where: {
        graphId,
        queryHash,
        bucketDate: { in: bucketDates },
      },
      orderBy: { bucketDate: 'asc' },
    });
    return snapshots.map(s => this.toSnapshotDTO(s));
  }

  /**
   * Upsert a snapshot for a specific day bucket
   */
  async upsertSnapshot(
    graphId: number,
    bucketDate: string,
    queryHash: string,
    totalItems: number
  ): Promise<InsightSnapshot> {
    const snapshot = await this.prisma.insightSnapshot.upsert({
      where: {
        graphId_bucketDate_queryHash: { graphId, bucketDate, queryHash },
      },
      create: {
        graphId,
        bucketDate,
        queryHash,
        totalItems,
        fetchedAt: new Date(),
      },
      update: {
        totalItems,
        fetchedAt: new Date(),
      },
    });
    return this.toSnapshotDTO(snapshot);
  }

  /**
   * Delete snapshots with a stale query hash
   */
  async deleteStaleSnapshots(graphId: number, currentQueryHash: string): Promise<number> {
    const result = await this.prisma.insightSnapshot.deleteMany({
      where: {
        graphId,
        queryHash: { not: currentQueryHash },
      },
    });
    return result.count;
  }
}
