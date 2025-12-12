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
 * Saved Search service layer
 * Handles validation and business logic for saved search operations
 */

import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '@app/contracts';
import { getPrismaClient } from '../lib/prisma.js';
import {
  SavedSearchRepository,
  type SavedSearch,
  type CreateSavedSearch,
  type UpdateSavedSearch,
} from '../repositories/savedSearchRepository.js';

/**
 * Saved Search service class
 * Provides high-level operations with validation and user scoping
 */
export class SavedSearchService {
  private repository: SavedSearchRepository;

  constructor(prisma?: PrismaClient) {
    this.repository = new SavedSearchRepository(prisma as any);
  }

  /**
   * Initialize service with Prisma client
   */
  static async create(): Promise<SavedSearchService> {
    const prisma = await getPrismaClient();
    return new SavedSearchService(prisma);
  }

  /**
   * Find saved search by ID (scoped to user)
   */
  async findById(userId: number, id: number): Promise<SavedSearch | null> {
    return this.repository.findById(userId, id);
  }

  /**
   * Find all saved searches for a user and optionally filter by server
   */
  async findAll(userId: number, serverId?: number): Promise<SavedSearch[]> {
    return this.repository.findAll(userId, serverId);
  }

  /**
   * Create a new saved search with validation
   */
  async create(userId: number, data: Omit<CreateSavedSearch, 'userId'>): Promise<SavedSearch> {
    // Validate required fields
    if (!data.name || !data.name.trim()) {
      const error = new Error('Search name is required');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }
    if (!data.query || !data.query.trim()) {
      const error = new Error('Search query is required');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }
    if (!data.serverId) {
      const error = new Error('Server ID is required');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }

    const search = await this.repository.create({
      userId,
      serverId: data.serverId,
      name: data.name.trim(),
      query: data.query.trim(),
      columns: data.columns || null,
      isDefault: data.isDefault || false,
    });

    // If this search is default, unset others for this server
    if (data.isDefault) {
      await this.repository.unsetDefaultForServer(userId, data.serverId, search.id);
    }

    return search;
  }

  /**
   * Update a saved search (scoped to user)
   */
  async update(userId: number, id: number, data: UpdateSavedSearch): Promise<SavedSearch | null> {
    // Validate fields if provided
    if (data.name !== undefined && (!data.name || !data.name.trim())) {
      const error = new Error('Search name cannot be empty');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }
    if (data.query !== undefined && (!data.query || !data.query.trim())) {
      const error = new Error('Search query cannot be empty');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }

    const search = await this.repository.update(userId, id, data);
    if (!search) {
      return null;
    }

    // If this search is set to default, unset others for this server
    if (data.isDefault) {
      await this.repository.unsetDefaultForServer(userId, search.serverId, search.id);
    }

    return search;
  }

  /**
   * Delete a saved search (scoped to user)
   */
  async delete(userId: number, id: number): Promise<boolean> {
    return this.repository.delete(userId, id);
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: number, id: number): Promise<void> {
    await this.repository.updateLastAccessed(userId, id);
  }
}
