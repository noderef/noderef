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
 * Search History repository
 * Handles CRUD operations for search history
 */

import type { PrismaClient, SearchHistory as PrismaSearchHistory } from '@prisma/client';

export interface SearchHistory {
  id: number;
  userId: number;
  searchId: number | null;
  query: string;
  resultsCount: number | null;
  executedAt: Date;
}

export interface CreateSearchHistory {
  userId: number;
  searchId?: number | null;
  query: string;
  resultsCount?: number | null;
}

/**
 * Search History repository
 */
export class SearchHistoryRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma SearchHistory model to DTO
   */
  private toDTO(history: PrismaSearchHistory): SearchHistory {
    return {
      id: history.id,
      userId: history.userId,
      searchId: history.searchId,
      query: history.query,
      resultsCount: history.resultsCount,
      executedAt: history.executedAt,
    };
  }

  /**
   * Create a new search history entry
   */
  async create(data: CreateSearchHistory): Promise<SearchHistory> {
    const history = await this.prisma.searchHistory.create({
      data: {
        userId: data.userId,
        searchId: data.searchId ?? null,
        query: data.query.trim(),
        resultsCount: data.resultsCount ?? null,
      },
    });
    return this.toDTO(history);
  }

  /**
   * List recent search history entries for a user
   */
  async list(userId: number, limit: number = 10): Promise<SearchHistory[]> {
    const history = await this.prisma.searchHistory.findMany({
      where: {
        userId,
      },
      orderBy: {
        executedAt: 'desc',
      },
      take: limit,
    });

    return history.map(item => this.toDTO(item));
  }
}
