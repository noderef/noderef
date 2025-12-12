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
 * JavaScript Console History service layer
 * Handles business logic for JS console execution history
 */

import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger.js';
import { JsConsoleHistoryRepository } from '../repositories/jsConsoleHistoryRepository.js';

const log = createLogger('jsConsoleHistory.service');

/**
 * JavaScript Console History service
 */
export class JsConsoleHistoryService {
  private repository: JsConsoleHistoryRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new JsConsoleHistoryRepository(prisma);
  }

  /**
   * Create a new JS console history entry
   */
  async create(data: {
    userId: number;
    serverId?: number | null;
    script: string;
    output?: string | null;
    error?: string | null;
  }): Promise<void> {
    try {
      await this.repository.create({
        userId: data.userId,
        serverId: data.serverId ?? null,
        script: data.script,
        output: data.output ?? null,
        error: data.error ?? null,
      });
    } catch (err) {
      log.error(
        { err, userId: data.userId, serverId: data.serverId },
        'Failed to create JS console history'
      );
      // Don't throw - history recording should not fail the main operation
    }
  }

  /**
   * List JS console history with pagination
   */
  async list(
    userId: number,
    options: {
      serverId?: number;
      limit?: number;
      cursor?: number;
    } = {}
  ): Promise<{
    items: Array<{
      id: number;
      userId: number;
      serverId: number | null;
      script: string;
      output: string | null;
      error: string | null;
      executedAt: Date;
      server?: { id: number; name: string } | null;
    }>;
    hasMore: boolean;
    nextCursor: number | null;
  }> {
    return this.repository.list(userId, options);
  }
}
