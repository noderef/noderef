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
 * Search History service layer
 * Handles saving and retrieving search history
 */

import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '@app/contracts';
import { getPrismaClient } from '../lib/prisma.js';
import {
  SearchHistoryRepository,
  type SearchHistory,
  type CreateSearchHistory,
} from '../repositories/searchHistoryRepository.js';

/**
 * Search History service class
 * Provides high-level operations for search history
 */
export class SearchHistoryService {
  private repository: SearchHistoryRepository;

  constructor(prisma?: PrismaClient) {
    this.repository = new SearchHistoryRepository(prisma as any);
  }

  /**
   * Initialize service with Prisma client
   */
  static async create(): Promise<SearchHistoryService> {
    const prisma = await getPrismaClient();
    return new SearchHistoryService(prisma);
  }

  /**
   * Create a new search history entry
   */
  async create(userId: number, data: Omit<CreateSearchHistory, 'userId'>): Promise<SearchHistory> {
    // Validate required fields
    if (!data.query || !data.query.trim()) {
      const error = new Error('Search query is required');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }

    return this.repository.create({
      userId,
      searchId: data.searchId ?? null,
      query: data.query.trim(),
      resultsCount: data.resultsCount ?? null,
    });
  }

  /**
   * List recent search history entries for a user
   */
  async list(userId: number, limit: number = 10): Promise<SearchHistory[]> {
    return this.repository.list(userId, limit);
  }
}
