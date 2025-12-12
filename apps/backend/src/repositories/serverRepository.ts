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
 * Server repository
 * Handles CRUD operations for servers table with user scoping
 * Note: Encryption/decryption of credentials is handled by the service layer
 */

import type { CreateServer, Server, UpdateServer } from '@app/contracts';
import type { PrismaClient, Server as PrismaServer } from '@prisma/client';

/**
 * Utility to build partial update object with only defined fields
 */
function buildPartialUpdate<T extends Record<string, unknown>>(data: Partial<T>): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  }
  return result;
}

/**
 * Server repository interface
 * Stateless repository that accepts Prisma client and returns DTOs
 */
export class ServerRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Convert Prisma Server model to DTO
   * Note: Credentials should be decrypted before conversion (handled by service layer)
   */
  private toDTO(server: PrismaServer): Server {
    return {
      id: server.id,
      userId: server.userId,
      name: server.name,
      baseUrl: server.baseUrl,
      serverType: server.serverType as Server['serverType'],
      authType: server.authType as Server['authType'],
      isAdmin: server.isAdmin ?? true,
      username: server.username,
      token: server.token,
      refreshToken: server.refreshToken,
      tokenExpiry: server.tokenExpiry,
      oidcHost: server.oidcHost,
      oidcRealm: server.oidcRealm,
      oidcClientId: server.oidcClientId,
      jsconsoleEndpoint: server.jsconsoleEndpoint ?? null,
      thumbnail: server.thumbnail ? Buffer.from(server.thumbnail).toString('base64') : null,
      color: server.color,
      label: server.label,
      displayOrder: server.displayOrder ?? 0,
      lastAccessed: server.lastAccessed,
      createdAt: server.createdAt,
    };
  }

  /**
   * Find server by ID (scoped to user)
   */
  async findById(userId: number, id: number): Promise<Server | null> {
    const server = await this.prisma.server.findFirst({
      where: { id, userId },
    });
    return server ? this.toDTO(server) : null;
  }

  /**
   * Find server by URL (scoped to user)
   */
  async findByUrl(userId: number, baseUrl: string): Promise<Server | null> {
    const server = await this.prisma.server.findFirst({
      where: { userId, baseUrl },
    });
    return server ? this.toDTO(server) : null;
  }

  /**
   * Find all servers for a user (ordered by displayOrder)
   */
  async findAll(userId: number): Promise<Server[]> {
    const servers = await this.prisma.server.findMany({
      where: { userId },
      orderBy: { displayOrder: 'asc' },
    });
    return servers.map(server => this.toDTO(server));
  }

  /**
   * Create a new server
   * Note: Encryption of credentials should be handled by service layer before calling this
   */
  async create(data: CreateServer): Promise<Server> {
    const displayOrder = data.displayOrder ?? (await this.getNextDisplayOrder(data.userId));

    const server = await this.prisma.server.create({
      data: {
        ...data,
        serverType: data.serverType ?? 'alfresco',
        authType: data.authType ?? null,
        isAdmin: data.isAdmin ?? true,
        username: data.username ?? null,
        token: data.token ?? null,
        refreshToken: data.refreshToken ?? null,
        tokenExpiry: data.tokenExpiry ?? null,
        oidcHost: data.oidcHost ?? null,
        oidcRealm: data.oidcRealm ?? null,
        oidcClientId: data.oidcClientId ?? null,
        jsconsoleEndpoint: data.jsconsoleEndpoint ?? null,
        thumbnail: data.thumbnail ? Buffer.from(data.thumbnail, 'base64') : null,
        color: data.color ?? null,
        label: data.label ?? null,
        displayOrder,
      },
    });

    return this.toDTO(server);
  }

  /**
   * Update a server (scoped to user)
   * Note: Encryption of credentials should be handled by service layer before calling this
   */
  async update(
    userId: number,
    id: number,
    data: Omit<UpdateServer, 'userId'> & { lastAccessed?: Date }
  ): Promise<Server | null> {
    const existing = await this.prisma.server.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return null;
    }

    const updateData = buildPartialUpdate(data);
    const prismaData: Record<string, unknown> = { ...updateData };
    if (prismaData.thumbnail && typeof prismaData.thumbnail === 'string') {
      prismaData.thumbnail = Buffer.from(prismaData.thumbnail, 'base64');
    }

    const server = await this.prisma.server.update({
      where: { id },
      data: prismaData,
    });

    return this.toDTO(server);
  }

  /**
   * Get next display order for a user
   */
  private async getNextDisplayOrder(userId: number): Promise<number> {
    const maxOrder = await this.prisma.server.findFirst({
      where: { userId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    return (maxOrder?.displayOrder ?? -1) + 1;
  }

  /**
   * Delete a server (scoped to user)
   */
  async delete(userId: number, id: number): Promise<boolean> {
    const result = await this.prisma.server.deleteMany({
      where: {
        id,
        userId,
      },
    });

    return result.count > 0;
  }

  /**
   * Reorder servers atomically
   */
  async reorder(
    userId: number,
    orders: Array<{ id: number; displayOrder: number }>
  ): Promise<void> {
    await this.prisma.$transaction(
      orders.map(({ id, displayOrder }) =>
        this.prisma.server.updateMany({
          where: { id, userId },
          data: { displayOrder },
        })
      )
    );
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: number, id: number): Promise<void> {
    await this.prisma.server.updateMany({
      where: { id, userId },
      data: { lastAccessed: new Date() },
    });
  }
}
