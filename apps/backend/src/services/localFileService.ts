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
 * Local file service layer
 * Handles CRUD operations for text-based local files
 */

import type { LocalFile, CreateLocalFile, UpdateLocalFile } from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '@app/contracts';
import { getPrismaClient } from '../lib/prisma.js';
import { LocalFileRepository } from '../repositories/localFileRepository.js';

const MAX_LOCAL_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250MB (keep in sync with frontend cap)

export class LocalFileService {
  private repository: LocalFileRepository;

  constructor(prisma?: PrismaClient) {
    this.repository = new LocalFileRepository(prisma as any);
  }

  static async create(): Promise<LocalFileService> {
    const prisma = await getPrismaClient();
    return new LocalFileService(prisma);
  }

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
    return this.repository.list(userId, options);
  }

  async create(userId: number, data: Omit<CreateLocalFile, 'userId'>): Promise<LocalFile> {
    const name = data.name?.trim();
    if (!name) {
      const error = new Error('File name is required');
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }

    const content = data.content ?? '';
    this.ensureContentWithinLimit(content);

    return this.repository.create(userId, {
      name,
      type: data.type ?? 'text/plain',
      content,
    });
  }

  async update(userId: number, id: number, data: UpdateLocalFile): Promise<LocalFile | null> {
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        const error = new Error('File name cannot be empty');
        (error as any).code = ErrorCode.VALIDATION_ERROR;
        throw error;
      }
    }

    if (data.content !== undefined) {
      const content = data.content ?? '';
      this.ensureContentWithinLimit(content);
    }

    return this.repository.update(userId, id, data);
  }

  async softDelete(userId: number, id: number): Promise<boolean> {
    return this.repository.softDelete(userId, id);
  }

  private ensureContentWithinLimit(content: string) {
    const byteLength = Buffer.byteLength(content, 'utf8');
    if (byteLength > MAX_LOCAL_FILE_SIZE_BYTES) {
      const mb = Math.round(MAX_LOCAL_FILE_SIZE_BYTES / 1024 / 1024);
      const error = new Error(`File content exceeds ${mb}MB limit`);
      (error as any).code = ErrorCode.VALIDATION_ERROR;
      throw error;
    }
  }
}
