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
 * Saved Search repository
 * Handles CRUD operations for saved searches with user scoping
 */

import type { PrismaClient, SavedSearch as PrismaSavedSearch } from '@prisma/client';

export interface SavedSearch {
  id: number;
  userId: number;
  serverId: number;
  name: string;
  query: string;
  columns: string | null;
  lastAccessed: Date | null;
  lastDiffCount: number;
  isDefault: boolean;
  createdAt: Date;
}

export interface CreateSavedSearch {
  userId: number;
  serverId: number;
  name: string;
  query: string;
  columns?: string | null;
  isDefault?: boolean;
}

export interface UpdateSavedSearch {
  name?: string;
  query?: string;
  columns?: string | null;
  isDefault?: boolean;
}

/**
 * Saved Search repository
 */
export class SavedSearchRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma SavedSearch model to DTO
   */
  private toDTO(search: PrismaSavedSearch): SavedSearch {
    return {
      id: search.id,
      userId: search.userId,
      serverId: search.serverId,
      name: search.name,
      query: search.query,
      columns: search.columns,
      lastAccessed: search.lastAccessed,
      lastDiffCount: search.lastDiffCount,
      isDefault: search.isDefault,
      createdAt: search.createdAt,
    };
  }

  /**
   * Find saved search by ID (scoped to user)
   */
  async findById(userId: number, id: number): Promise<SavedSearch | null> {
    const search = await this.prisma.savedSearch.findFirst({
      where: { id, userId },
    });
    return search ? this.toDTO(search) : null;
  }

  /**
   * Find all saved searches for a user and optionally filter by server
   */
  async findAll(userId: number, serverId?: number): Promise<SavedSearch[]> {
    const where: { userId: number; serverId?: number } = { userId };
    if (serverId !== undefined) {
      where.serverId = serverId;
    }
    const searches = await this.prisma.savedSearch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return searches.map(search => this.toDTO(search));
  }

  /**
   * Create a new saved search
   */
  async create(data: CreateSavedSearch): Promise<SavedSearch> {
    const search = await this.prisma.savedSearch.create({
      data: {
        userId: data.userId,
        serverId: data.serverId,
        name: data.name.trim(),
        query: data.query.trim(),
        columns: data.columns || null,
        isDefault: data.isDefault || false,
      },
    });
    return this.toDTO(search);
  }

  /**
   * Update a saved search (scoped to user)
   */
  async update(userId: number, id: number, data: UpdateSavedSearch): Promise<SavedSearch | null> {
    const existing = await this.prisma.savedSearch.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return null;
    }

    const updateData: Partial<{
      name: string;
      query: string;
      columns: string | null;
      isDefault: boolean;
    }> = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.query !== undefined) {
      updateData.query = data.query.trim();
    }
    if (data.columns !== undefined) {
      updateData.columns = data.columns;
    }
    if (data.isDefault !== undefined) {
      updateData.isDefault = data.isDefault;
    }

    const search = await this.prisma.savedSearch.update({
      where: { id },
      data: updateData,
    });

    return this.toDTO(search);
  }

  /**
   * Unset default flag for all saved searches for a server (except the specified one)
   */
  async unsetDefaultForServer(userId: number, serverId: number, excludeId: number): Promise<void> {
    await this.prisma.savedSearch.updateMany({
      where: {
        userId,
        serverId,
        id: { not: excludeId },
      },
      data: { isDefault: false },
    });
  }

  /**
   * Delete a saved search (scoped to user)
   */
  async delete(userId: number, id: number): Promise<boolean> {
    const search = await this.prisma.savedSearch.findFirst({
      where: { id, userId },
    });
    if (!search) {
      return false;
    }

    await this.prisma.savedSearch.delete({
      where: { id },
    });
    return true;
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: number, id: number): Promise<void> {
    const search = await this.prisma.savedSearch.findFirst({
      where: { id, userId },
    });
    if (!search) {
      return;
    }

    await this.prisma.savedSearch.update({
      where: { id },
      data: { lastAccessed: new Date() },
    });
  }
}
