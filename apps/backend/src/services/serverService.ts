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
 * Server service layer
 * Handles validation, encryption, and business logic for server operations
 */

import type { Server, CreateServer, UpdateServer, PublicServer } from '@app/contracts';
import type { PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../lib/encryption.js';
import { getPrismaClient } from '../lib/prisma.js';
import { ServerRepository } from '../repositories/serverRepository.js';
import { validateCreateServerInput, validateUpdateServerInput } from './validators.js';
import { refreshOidcTokens } from './alfresco/oidcTicketService.js';

/**
 * Server service class
 * Provides high-level operations with validation and user scoping
 */
export class ServerService {
  private repository: ServerRepository;

  constructor(prisma?: PrismaClient) {
    // Allow injection of Prisma client for testing, or use singleton
    this.repository = new ServerRepository(prisma as any);
  }

  /**
   * Initialize service with Prisma client
   */
  static async create(): Promise<ServerService> {
    const prisma = await getPrismaClient();
    return new ServerService(prisma);
  }

  /**
   * Find server by ID (scoped to user) - returns public safe version
   */
  async findById(userId: number, id: number): Promise<PublicServer | null> {
    const server = await this.repository.findById(userId, id);
    return this.toPublicServer(server);
  }

  /**
   * Find all servers for a user (ordered by displayOrder) - returns public safe versions
   */
  async findAll(userId: number): Promise<PublicServer[]> {
    const servers = await this.repository.findAll(userId);
    return servers.map(s => this.toPublicServer(s)).filter((s): s is PublicServer => s !== null);
  }

  /**
   * Create a new server with validation - returns public safe version
   */
  async create(userId: number, data: Omit<CreateServer, 'userId'>): Promise<PublicServer> {
    const validated = validateCreateServerInput({ ...data, userId });
    // Normalize 'oauth' to 'openid_connect' for compatibility
    const normalized = {
      ...validated,
      authType: validated.authType === 'oauth' ? 'openid_connect' : validated.authType,
    };
    const encryptedInput = await this.encryptCredentialPayload(normalized);
    const server = await this.repository.create(encryptedInput);
    return this.toPublicServer(server)!;
  }

  /**
   * Update a server with validation (scoped to user) - returns public safe version
   */
  async update(userId: number, id: number, data: UpdateServer): Promise<PublicServer | null> {
    const validated = validateUpdateServerInput(data, id);
    // Normalize 'oauth' to 'openid_connect' for compatibility
    const normalized: UpdateServer =
      validated.authType === 'oauth'
        ? ({ ...validated, authType: 'openid_connect' as const } as unknown as UpdateServer)
        : (validated as UpdateServer);
    const encryptedInput = await this.encryptCredentialPayload(normalized);
    const server = await this.repository.update(
      userId,
      id,
      encryptedInput as Omit<UpdateServer, 'userId'>
    );
    return this.toPublicServer(server);
  }

  /**
   * Get decrypted credentials for backend use only (NEVER expose to frontend)
   * Used internally when making authenticated calls to external services
   */
  async getCredentialsForBackend(
    userId: number,
    serverId: number
  ): Promise<{
    username: string | null;
    token: string | null;
    refreshToken: string | null;
    tokenExpiry: Date | null;
    oidcHost: string | null;
    oidcRealm: string | null;
    oidcClientId: string | null;
    authType: string | null;
  } | null> {
    const server = await this.repository.findById(userId, serverId);
    if (!server) {
      return null;
    }

    const [username, token, refreshToken] = await Promise.all([
      this.decryptCredentialValue(server.username),
      this.decryptCredentialValue(server.token),
      this.decryptCredentialValue(server.refreshToken),
    ]);

    return {
      username,
      token,
      refreshToken,
      tokenExpiry: server.tokenExpiry,
      oidcHost: server.oidcHost,
      oidcRealm: server.oidcRealm,
      oidcClientId: server.oidcClientId,
      authType: server.authType,
    };
  }

  /**
   * Delete a server (scoped to user)
   */
  async delete(userId: number, id: number): Promise<boolean> {
    return this.repository.delete(userId, id);
  }

  /**
   * Reorder servers atomically
   */
  async reorder(
    userId: number,
    orders: Array<{ id: number; displayOrder: number }>
  ): Promise<void> {
    // Verify all servers belong to user
    for (const order of orders) {
      const server = await this.repository.findById(userId, order.id);
      if (!server) {
        throw new Error(`Server ${order.id} not found or does not belong to user ${userId}`);
      }
    }

    await this.repository.reorder(userId, orders);
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: number, id: number): Promise<void> {
    await this.repository.updateLastAccessed(userId, id);
  }

  /**
   * Encrypt credential-bearing fields before persistence.
   * Encrypts: username, token (password OR access_token), refreshToken
   */
  private async encryptCredentialPayload<
    T extends {
      username?: string | null;
      token?: string | null;
      refreshToken?: string | null;
    },
  >(data: T): Promise<T> {
    const result = { ...data } as T & {
      username?: string | null;
      token?: string | null;
      refreshToken?: string | null;
    };

    if (Object.prototype.hasOwnProperty.call(result, 'username')) {
      result.username = (await this.encryptCredentialValue(
        result.username
      )) as typeof result.username;
    }

    if (Object.prototype.hasOwnProperty.call(result, 'token')) {
      result.token = (await this.encryptCredentialValue(result.token)) as typeof result.token;
    }

    if (Object.prototype.hasOwnProperty.call(result, 'refreshToken')) {
      result.refreshToken = (await this.encryptCredentialValue(
        result.refreshToken
      )) as typeof result.refreshToken;
    }

    return result;
  }

  private async encryptCredentialValue(
    value: string | null | undefined
  ): Promise<string | null | undefined> {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    return encryptSecret(value);
  }

  private async decryptCredentialValue(value: string | null | undefined): Promise<string | null> {
    if (value === null || value === undefined) {
      return null;
    }
    return decryptSecret(value);
  }

  /**
   * Refresh OAuth tokens if expired or about to expire
   * Returns updated server with new tokens
   */
  async refreshOAuthTokens(userId: number, serverId: number): Promise<PublicServer | null> {
    const server = await this.repository.findById(userId, serverId);
    if (!server || server.authType !== 'openid_connect') {
      return null;
    }

    // Check if token needs refresh (expired or expires within 5 minutes)
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now

    if (!server.tokenExpiry || server.tokenExpiry > expiryThreshold) {
      // Token is still valid, no refresh needed
      return this.toPublicServer(server);
    }

    // Decrypt refresh token
    const refreshToken = await this.decryptCredentialValue(server.refreshToken);
    if (!refreshToken || !server.oidcHost || !server.oidcRealm || !server.oidcClientId) {
      throw new Error('Missing OAuth configuration for token refresh');
    }

    // Use shared refresh function (DRY principle)
    const tokenResponse = await refreshOidcTokens(
      server.oidcHost,
      server.oidcRealm,
      server.oidcClientId,
      refreshToken
    );

    // Calculate new expiry
    const newExpiry = tokenResponse.expiresIn
      ? new Date(Date.now() + tokenResponse.expiresIn * 1000)
      : null;

    // Update server with new tokens (encrypted)
    const updatedServer = await this.repository.update(userId, serverId, {
      token: await this.encryptCredentialValue(tokenResponse.accessToken),
      refreshToken: tokenResponse.refreshToken
        ? await this.encryptCredentialValue(tokenResponse.refreshToken)
        : server.refreshToken, // Keep old refresh token if not provided
      tokenExpiry: newExpiry,
    });

    return this.toPublicServer(updatedServer);
  }

  /**
   * Convert a server to public-safe version (no decrypted credentials)
   * IMPORTANT: Never include token, refreshToken, or username in public response
   */
  private toPublicServer(server: Server | null): PublicServer | null {
    if (!server) {
      return null;
    }

    const { username, token, refreshToken, ...rest } = server;

    return {
      ...rest,
      hasCredentials: !!(username || token || refreshToken),
    };
  }
}
