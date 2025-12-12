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
 * User repository
 * Handles CRUD operations for users
 */

import type { PrismaClient, User as PrismaUser } from '@prisma/client';

export interface User {
  id: number;
  username: string;
  email: string | null;
  password: string | null;
  fullName: string | null;
  thumbnail: string | null; // Base64 encoded
  aiAssistantEnabled: boolean;
  createdAt: Date;
}

export interface UpdateUserProfile {
  fullName?: string | null;
  thumbnail?: string | null; // Base64 encoded
}

/**
 * User repository
 */
export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma User model to DTO
   */
  private toDTO(user: PrismaUser): User {
    let thumbnail: string | null = null;
    if (user.thumbnail) {
      const raw = user.thumbnail as unknown as Buffer;
      thumbnail = Buffer.isBuffer(raw)
        ? raw.toString('base64')
        : Buffer.from(raw).toString('base64');
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      fullName: user.fullName,
      thumbnail,
      aiAssistantEnabled: user.aiAssistantEnabled,
      createdAt: user.createdAt,
    };
  }

  /**
   * Find user by ID
   */
  async findById(id: number): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    return user ? this.toDTO(user) : null;
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    return user ? this.toDTO(user) : null;
  }

  /**
   * Get user profile (public fields only)
   */
  async getProfile(id: number): Promise<{
    id: number;
    username: string;
    fullName: string | null;
    email: string | null;
    thumbnail: string | null;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, fullName: true, email: true, thumbnail: true },
    });
    if (!user) return null;

    let thumbnail: string | null = null;
    if (user.thumbnail) {
      const raw = user.thumbnail as unknown as Buffer;
      thumbnail = Buffer.isBuffer(raw)
        ? raw.toString('base64')
        : Buffer.from(raw).toString('base64');
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      thumbnail,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(id: number, data: UpdateUserProfile): Promise<User | null> {
    const updateData: Record<string, unknown> = {};

    if (data.fullName !== undefined) {
      updateData.fullName = data.fullName;
    }

    if (data.thumbnail !== undefined) {
      if (data.thumbnail === null) {
        updateData.thumbnail = null;
      } else {
        // Validate and decode thumbnail
        let buffer: Buffer;
        try {
          buffer = Buffer.from(data.thumbnail, 'base64');
        } catch (error) {
          throw new Error('Invalid thumbnail encoding');
        }

        const maxSize = 256 * 1024;
        if (buffer.byteLength > maxSize) {
          throw new Error('Thumbnail exceeds 256 KB');
        }

        const isPng =
          buffer.length >= 8 &&
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47 &&
          buffer[4] === 0x0d &&
          buffer[5] === 0x0a &&
          buffer[6] === 0x1a &&
          buffer[7] === 0x0a;
        const isJpeg = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;

        if (!isPng && !isJpeg) {
          throw new Error('Thumbnail must be a PNG or JPG image');
        }

        updateData.thumbnail = buffer;
      }
    }

    if (Object.keys(updateData).length === 0) {
      const user = await this.prisma.user.findUnique({ where: { id } });
      return user ? this.toDTO(user) : null;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    return this.toDTO(user);
  }

  /**
   * Get AI assistant enabled status
   */
  async getAiAssistantEnabled(id: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { aiAssistantEnabled: true },
    });
    return Boolean(user?.aiAssistantEnabled);
  }

  /**
   * Set AI assistant enabled status
   */
  async setAiAssistantEnabled(id: number, enabled: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { aiAssistantEnabled: enabled },
    });
  }
}
