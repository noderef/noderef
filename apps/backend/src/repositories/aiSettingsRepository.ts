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
 * AI Settings repository
 * Handles CRUD operations for user AI settings
 * Note: Encryption/decryption of tokens is handled by the service layer
 */

import type { PrismaClient, UserAiSettings as PrismaUserAiSettings } from '@prisma/client';

export interface UserAiSettings {
  id: number;
  userId: number;
  provider: string;
  model: string;
  token: string; // Encrypted
  label: string | null;
  isDefault: boolean;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserAiSettings {
  userId: number;
  provider: string;
  model: string;
  token: string; // Should be encrypted before calling
  label?: string | null;
  isDefault?: boolean;
  metadata?: string | null;
}

export interface UpdateUserAiSettings {
  model?: string;
  token?: string; // Should be encrypted before calling
  label?: string | null;
  isDefault?: boolean;
  metadata?: string | null;
}

/**
 * AI Settings repository
 */
export class AiSettingsRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma UserAiSettings model to DTO
   */
  private toDTO(settings: PrismaUserAiSettings): UserAiSettings {
    return {
      id: settings.id,
      userId: settings.userId,
      provider: settings.provider,
      model: settings.model,
      token: settings.token,
      label: settings.label,
      isDefault: settings.isDefault,
      metadata: settings.metadata,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  /**
   * List all AI settings for a user
   */
  async findAll(userId: number): Promise<UserAiSettings[]> {
    const settings = await this.prisma.userAiSettings.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return settings.map(s => this.toDTO(s));
  }

  /**
   * Find AI settings by provider (scoped to user)
   */
  async findByProvider(userId: number, provider: string): Promise<UserAiSettings | null> {
    const settings = await this.prisma.userAiSettings.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });
    return settings ? this.toDTO(settings) : null;
  }

  /**
   * Find default AI settings for a user
   */
  async findDefault(userId: number): Promise<UserAiSettings | null> {
    const settings = await this.prisma.userAiSettings.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return settings ? this.toDTO(settings) : null;
  }

  /**
   * Upsert AI settings (create or update)
   */
  async upsert(userId: number, data: CreateUserAiSettings): Promise<UserAiSettings> {
    // If setting as default, unset others
    if (data.isDefault) {
      await this.prisma.userAiSettings.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const settings = await this.prisma.userAiSettings.upsert({
      where: {
        userId_provider: {
          userId,
          provider: data.provider,
        },
      },
      create: {
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        token: data.token,
        label: data.label ?? null,
        metadata: data.metadata ?? null,
        isDefault: data.isDefault ?? true,
      },
      update: {
        model: data.model,
        token: data.token,
        label: data.label ?? null,
        metadata: data.metadata ?? null,
        isDefault: data.isDefault ?? false,
        updatedAt: new Date(),
      },
    });

    return this.toDTO(settings);
  }

  /**
   * Update AI settings (scoped to user)
   */
  async update(
    userId: number,
    provider: string,
    data: UpdateUserAiSettings
  ): Promise<UserAiSettings | null> {
    const existing = await this.prisma.userAiSettings.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!existing) {
      return null;
    }

    // If setting as default, unset others
    if (data.isDefault) {
      await this.prisma.userAiSettings.updateMany({
        where: { userId, provider: { not: provider } },
        data: { isDefault: false },
      });
    }

    const updateData: Partial<{
      model: string;
      token: string;
      label: string | null;
      isDefault: boolean;
      metadata: string | null;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    if (data.model !== undefined) {
      updateData.model = data.model;
    }
    if (data.token !== undefined) {
      updateData.token = data.token;
    }
    if (data.label !== undefined) {
      updateData.label = data.label;
    }
    if (data.isDefault !== undefined) {
      updateData.isDefault = data.isDefault;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata ?? null;
    }

    const settings = await this.prisma.userAiSettings.update({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      data: updateData,
    });

    return this.toDTO(settings);
  }

  /**
   * Delete AI settings (scoped to user)
   */
  async delete(userId: number, provider: string): Promise<boolean> {
    const result = await this.prisma.userAiSettings.deleteMany({
      where: {
        userId,
        provider,
      },
    });
    return result.count > 0;
  }
}
