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
 * Local File repository
 * Handles CRUD operations for local files
 */

import type { LocalFile, CreateLocalFile, UpdateLocalFile } from '@app/contracts';
import type { PrismaClient, LocalFile as PrismaLocalFile } from '@prisma/client';

/**
 * Local File repository
 */
export class LocalFileRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma LocalFile model to DTO
   */
  private toDTO(file: PrismaLocalFile): LocalFile {
    return {
      id: file.id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      content: file.content,
      deletedAt: file.deletedAt,
      lastModified: file.lastModified,
      createdAt: file.createdAt,
    };
  }

  /**
   * List local files with pagination and filtering
   */
  async list(
    userId: number,
    options?: {
      search?: string;
      skip?: number;
      take?: number;
      sortBy?: 'name' | 'lastModified' | 'createdAt' | 'type';
      sortDir?: 'asc' | 'desc';
    }
  ): Promise<{
    items: LocalFile[];
    total: number;
    hasMoreItems: boolean;
    skip: number;
    take: number;
  }> {
    const search = options?.search?.trim() || undefined;
    const skip = options?.skip ?? 0;
    const take = options?.take ?? 20;
    const sortBy = options?.sortBy ?? 'lastModified';
    const sortDir = options?.sortDir ?? 'desc';

    const where: Record<string, unknown> = {
      userId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [{ name: { contains: search } }, { content: { contains: search } }];
    }

    const [total, files] = await Promise.all([
      this.prisma.localFile.count({ where }),
      this.prisma.localFile.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take,
      }),
    ]);

    const items = files.map(file => this.toDTO(file));
    const hasMoreItems = skip + items.length < total;

    return { items, total, hasMoreItems, skip, take };
  }

  /**
   * Find local file by ID (scoped to user)
   */
  async findById(userId: number, id: number): Promise<LocalFile | null> {
    const file = await this.prisma.localFile.findFirst({
      where: { id, userId, deletedAt: null },
    });
    return file ? this.toDTO(file) : null;
  }

  /**
   * Create a new local file
   */
  async create(userId: number, data: Omit<CreateLocalFile, 'userId'>): Promise<LocalFile> {
    const now = new Date();
    const created = await this.prisma.localFile.create({
      data: {
        userId,
        name: data.name.trim(),
        type: data.type ?? 'text/plain',
        content: data.content ?? '',
        lastModified: now,
      },
    });

    return this.toDTO(created);
  }

  /**
   * Update a local file (scoped to user)
   */
  async update(userId: number, id: number, data: UpdateLocalFile): Promise<LocalFile | null> {
    const existing = await this.prisma.localFile.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      return null;
    }

    const updateData: {
      name?: string;
      type?: string | null;
      content?: string | null;
      lastModified: Date;
    } = {
      lastModified: new Date(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.type !== undefined) {
      updateData.type = data.type ?? null;
    }
    if (data.content !== undefined) {
      updateData.content = data.content ?? '';
    }

    const updated = await this.prisma.localFile.update({
      where: { id },
      data: updateData,
    });

    return this.toDTO(updated);
  }

  /**
   * Soft delete a local file (scoped to user)
   */
  async softDelete(userId: number, id: number): Promise<boolean> {
    const existing = await this.prisma.localFile.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      return false;
    }

    await this.prisma.localFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return true;
  }
}
