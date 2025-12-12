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
 * Server data models
 * These DTOs represent server entities stored in the database
 */

import { z } from 'zod';

/**
 * Server type enum
 */
export const ServerTypeSchema = z.enum(['alfresco', 'process_services', 'elastic']);
export type ServerType = z.infer<typeof ServerTypeSchema>;

/**
 * Auth type enum
 * - basic: Username + password authentication
 * - openid_connect: OAuth 2.0 / OpenID Connect with PKCE
 */
export const AuthTypeSchema = z.enum(['basic', 'openid_connect']);
export type AuthType = z.infer<typeof AuthTypeSchema>;

/**
 * Server DTO schema
 * Represents a complete server entity with all fields
 */
export const ServerSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
  serverType: ServerTypeSchema.default('alfresco'),
  authType: AuthTypeSchema.nullable(),
  isAdmin: z.boolean().default(true),
  username: z.string().nullable(),
  token: z.string().nullable(), // Encrypted: password for basic auth OR access_token for OAuth
  refreshToken: z.string().nullable(), // Encrypted: OAuth refresh token
  tokenExpiry: z.date().nullable(), // OAuth token expiration time
  oidcHost: z.string().nullable(), // OAuth/OIDC identity provider host
  oidcRealm: z.string().nullable(), // OAuth/OIDC realm
  oidcClientId: z.string().nullable(), // OAuth/OIDC client ID
  jsconsoleEndpoint: z.string().nullable(), // JS Console endpoint path (e.g., /alfresco/s/jsconsole)
  thumbnail: z.string().nullable(), // Base64 string or null
  color: z.string().max(50).nullable(),
  label: z.string().max(4).nullable(), // Environment label (e.g., PROD, TEST, ACC)
  displayOrder: z.number().int().min(0).default(0),
  lastAccessed: z.date().nullable(),
  createdAt: z.date(),
});

export type Server = z.infer<typeof ServerSchema>;

/**
 * Create server input DTO
 */
export const CreateServerSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
  serverType: ServerTypeSchema.optional().default('alfresco'),
  authType: AuthTypeSchema.nullable().optional(),
  isAdmin: z.boolean().optional().default(true),
  username: z.string().nullable().optional(),
  token: z.string().nullable().optional(), // Password for basic auth OR access_token for OAuth
  refreshToken: z.string().nullable().optional(), // OAuth refresh token
  tokenExpiry: z.date().nullable().optional(), // OAuth token expiration time
  oidcHost: z.string().nullable().optional(), // OAuth/OIDC identity provider host
  oidcRealm: z.string().nullable().optional(), // OAuth/OIDC realm
  oidcClientId: z.string().nullable().optional(), // OAuth/OIDC client ID
  jsconsoleEndpoint: z.string().nullable().optional(), // Must start with / if provided
  thumbnail: z.string().nullable().optional(), // Base64 string or null
  color: z.string().max(50).nullable().optional(),
  label: z.string().max(4).nullable().optional(), // Environment label (e.g., PROD, TEST, ACC)
  displayOrder: z.number().int().min(0).optional(),
});

export type CreateServer = z.infer<typeof CreateServerSchema>;

/**
 * Update server input DTO (all fields optional)
 */
export const UpdateServerSchema = CreateServerSchema.partial().omit({ userId: true });

export type UpdateServer = z.infer<typeof UpdateServerSchema>;

/**
 * Public server DTO for frontend
 * Omits sensitive credentials (token, username, refreshToken) and only indicates their presence
 */
export type PublicServer = Omit<Server, 'token' | 'username' | 'refreshToken'> & {
  hasCredentials: boolean;
};
