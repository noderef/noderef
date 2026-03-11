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
 * Insight Graph Service
 * Business logic for insight graph CRUD, dashboard resolution,
 * missing bucket detection, and chart series building.
 */

import type { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { createLogger } from '../lib/logger.js';
import {
  InsightGraphRepository,
  type InsightGraph,
  type CreateInsightGraph,
  type PinnedInsightGraph,
  type UpdateInsightGraph,
  type InsightSnapshot,
} from '../repositories/insightGraphRepository.js';
import { executeCountQuery, getDayBounds, type SearchFn } from './insightCountService.js';

const log = createLogger('insight.graph');
const DEFAULT_RANGE_DAYS = 7;
export const VALID_RANGE_DAYS = new Set([7, 14, 30, 90]);

/** TTL for today's bucket refresh (15 minutes) */
const TODAY_BUCKET_TTL_MS = 15 * 60 * 1000;

/** A single day data point in a chart series */
export interface InsightSeriesPoint {
  date: string;
  count: number;
}

/** Dashboard data for a single graph */
export interface InsightGraphDashboardItem {
  graphId: number;
  title: string;
  type: string;
  color: string;
  columnSpan: number;
  series: InsightSeriesPoint[];
}

/** Full dashboard response */
export interface InsightDashboard {
  graphs: InsightGraphDashboardItem[];
}

export interface PinnedInsightGraphDashboardItem extends InsightGraphDashboardItem {
  serverId: number;
  serverName: string;
  serverLabel: string | null;
  rangeDays: number;
  isPinned: boolean;
}

export interface PinnedInsightDashboard {
  graphs: PinnedInsightGraphDashboardItem[];
}

/**
 * Compute a short query hash from normalized filterQuery + dateField.
 * Used to invalidate snapshots when graph definition changes.
 */
function computeQueryHash(filterQuery: string, dateField: string): string {
  const normalized = `${filterQuery.trim().toLowerCase()}|${dateField.trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
function formatDateYMD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generate an array of YYYY-MM-DD bucket date strings for the given range.
 * @param rangeDays Number of days to look back (including today)
 */
function generateBucketDates(rangeDays: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(formatDateYMD(d));
  }
  return dates;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayString(): string {
  return formatDateYMD(new Date());
}

function normalizeRangeDays(rangeDays: number | undefined): number {
  return rangeDays && VALID_RANGE_DAYS.has(rangeDays) ? rangeDays : DEFAULT_RANGE_DAYS;
}

export class InsightGraphService {
  private repository: InsightGraphRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new InsightGraphRepository(prisma);
  }

  // ─── Graph CRUD ───────────────────────────────────────────────

  async findById(userId: number, id: number): Promise<InsightGraph | null> {
    return this.repository.findById(userId, id);
  }

  async findAllByServer(userId: number, serverId: number): Promise<InsightGraph[]> {
    return this.repository.findAllByServer(userId, serverId);
  }

  async create(userId: number, data: Omit<CreateInsightGraph, 'userId'>): Promise<InsightGraph> {
    if (!data.title?.trim()) {
      throw new Error('Graph title is required');
    }
    if (!data.type?.trim()) {
      data.type = 'area';
    }
    if (!data.filterQuery?.trim()) {
      throw new Error('Filter query is required');
    }
    if (!data.dateField?.trim()) {
      throw new Error('Date field is required');
    }

    return this.repository.create({ userId, ...data });
  }

  async update(
    userId: number,
    id: number,
    data: UpdateInsightGraph
  ): Promise<InsightGraph | null> {
    const existing = await this.repository.findById(userId, id);
    if (!existing) return null;

    const updated = await this.repository.update(userId, id, data);
    if (!updated) return null;

    // If filterQuery or dateField changed, clean up stale snapshots
    const oldHash = computeQueryHash(existing.filterQuery, existing.dateField);
    const newHash = computeQueryHash(updated.filterQuery, updated.dateField);
    if (oldHash !== newHash) {
      const deleted = await this.repository.deleteStaleSnapshots(id, newHash);
      if (deleted > 0) {
        log.info({ graphId: id, oldHash, newHash, deleted }, 'Cleaned stale snapshots');
      }
    }

    return updated;
  }

  async delete(userId: number, id: number): Promise<boolean> {
    return this.repository.delete(userId, id);
  }

  async findPinnedByUser(userId: number): Promise<PinnedInsightGraph[]> {
    return this.repository.findPinnedByUser(userId);
  }

  // ─── Dashboard ────────────────────────────────────────────────

  /**
   * Resolve dashboard data for a server.
   * 1. Load all graphs for the server
   * 2. For each graph, find existing snapshots and determine missing buckets
   * 3. Fetch missing counts from Alfresco
   * 4. Return chart-ready series data
   */
  async getDashboard(
    userId: number,
    serverId: number,
    rangeDays: number,
    searchFn: SearchFn
  ): Promise<InsightDashboard> {
    const graphs = await this.repository.findAllByServer(userId, serverId);
    if (graphs.length === 0) {
      return { graphs: [] };
    }

    const bucketDates = generateBucketDates(rangeDays);
    const today = getTodayString();

    const dashboardItems = await Promise.all(
      graphs.map(graph => this.resolveGraphSeries(graph, bucketDates, today, searchFn))
    );

    return { graphs: dashboardItems };
  }

  async getPinnedDashboard(
    userId: number,
    rangesByServer: Record<number, number>,
    resolveServerSearch: (
      serverId: number
    ) => Promise<{ searchFn: SearchFn; serverName: string; serverLabel: string | null }>
  ): Promise<PinnedInsightDashboard> {
    const graphs = await this.repository.findPinnedByUser(userId);
    if (graphs.length === 0) {
      return { graphs: [] };
    }

    const today = getTodayString();
    const graphOrder = new Map(graphs.map((graph, index) => [graph.id, index]));
    const graphsByServer = new Map<number, PinnedInsightGraph[]>();
    for (const graph of graphs) {
      const group = graphsByServer.get(graph.serverId);
      if (group) {
        group.push(graph);
      } else {
        graphsByServer.set(graph.serverId, [graph]);
      }
    }

    const dashboardItems: PinnedInsightGraphDashboardItem[] = [];

    for (const [serverId, serverGraphs] of graphsByServer.entries()) {
      try {
        const { searchFn, serverName, serverLabel } = await resolveServerSearch(serverId);
        const rangeDays = normalizeRangeDays(rangesByServer[serverId]);
        const bucketDates = generateBucketDates(rangeDays);

        const items = await Promise.all(
          serverGraphs.map(async graph => {
            const item = await this.resolveGraphSeries(graph, bucketDates, today, searchFn);
            return {
              ...item,
              serverId,
              serverName,
              serverLabel,
              rangeDays,
              isPinned: graph.isPinned,
            };
          })
        );

        dashboardItems.push(...items);
      } catch (error) {
        log.warn({ serverId, error }, 'Failed to resolve pinned insight server dashboard');
      }
    }

    dashboardItems.sort(
      (left, right) =>
        (graphOrder.get(left.graphId) ?? Number.MAX_SAFE_INTEGER) -
        (graphOrder.get(right.graphId) ?? Number.MAX_SAFE_INTEGER)
    );

    return { graphs: dashboardItems };
  }

  /**
   * Resolve chart series for a single graph.
   * Fetches only missing or stale buckets.
   */
  private async resolveGraphSeries(
    graph: InsightGraph,
    bucketDates: string[],
    today: string,
    searchFn: SearchFn
  ): Promise<InsightGraphDashboardItem> {
    const queryHash = computeQueryHash(graph.filterQuery, graph.dateField);

    // Get existing snapshots for matching hash
    const existingSnapshots = await this.repository.findSnapshots(
      graph.id,
      queryHash,
      bucketDates
    );

    // Build a lookup map
    const snapshotMap = new Map<string, InsightSnapshot>();
    for (const snap of existingSnapshots) {
      snapshotMap.set(snap.bucketDate, snap);
    }

    // Determine which dates need fetching
    const missingDates: string[] = [];
    const staleTodayDates: string[] = [];

    for (const date of bucketDates) {
      const existing = snapshotMap.get(date);
      if (!existing) {
        missingDates.push(date);
      } else if (date === today) {
        // Refresh today's bucket if stale
        const age = Date.now() - existing.fetchedAt.getTime();
        if (age > TODAY_BUCKET_TTL_MS) {
          staleTodayDates.push(date);
        }
      }
    }

    const datesToFetch = [...missingDates, ...staleTodayDates];

    // Fetch missing/stale counts concurrently
    if (datesToFetch.length > 0) {
      const fetchResults = await Promise.allSettled(
        datesToFetch.map(async date => {
          const bounds = getDayBounds(date);
          const totalItems = await executeCountQuery(
            searchFn,
            graph.filterQuery,
            graph.dateField,
            bounds.start,
            bounds.end
          );
          return { date, totalItems };
        })
      );

      // Upsert successful results
      for (const result of fetchResults) {
        if (result.status === 'fulfilled') {
          const { date, totalItems } = result.value;
          const snapshot = await this.repository.upsertSnapshot(
            graph.id,
            date,
            queryHash,
            totalItems
          );
          snapshotMap.set(date, snapshot);
        } else {
          log.warn(
            { graphId: graph.id, error: result.reason },
            'Failed to fetch count for bucket'
          );
        }
      }
    }

    // Build series from snapshot map
    const series: InsightSeriesPoint[] = bucketDates.map(date => ({
      date,
      count: snapshotMap.get(date)?.totalItems ?? 0,
    }));

    return {
      graphId: graph.id,
      title: graph.title,
      type: graph.type,
      color: graph.color,
      columnSpan: graph.columnSpan,
      series,
    };
  }
}
