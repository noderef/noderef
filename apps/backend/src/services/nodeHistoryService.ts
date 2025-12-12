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

import type { NodeHistoryActivitySummary } from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  NodeHistoryRepository,
  type NodeHistoryRecordInput,
  type NodeHistoryActivityOptions,
} from '../repositories/nodeHistoryRepository.js';

const log = createLogger('nodeHistoryService');

/**
 * Persists recently accessed nodes so UI can present quick access history.
 * Failures are logged but never bubble up to calling code.
 */
export class NodeHistoryService {
  private repository: NodeHistoryRepository;

  constructor(prisma?: PrismaClient) {
    this.repository = new NodeHistoryRepository(prisma as any);
  }

  static async create(): Promise<NodeHistoryService> {
    const prisma = await getPrismaClient();
    return new NodeHistoryService(prisma);
  }

  async recordAccess(input: NodeHistoryRecordInput): Promise<void> {
    try {
      await this.repository.recordAccess(input);
    } catch (err) {
      // Failures are logged but never bubble up to calling code
      log.error({ err, input }, 'Failed to record node access');
    }
  }

  async getActivitySummary(
    userId: number,
    options: NodeHistoryActivityOptions = {}
  ): Promise<NodeHistoryActivitySummary> {
    return this.repository.getActivitySummary(userId, options);
  }
}
