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

import { z } from 'zod';

/**
 * RPC request/response schemas for Alfresco operations
 */

/**
 * Server reference schema (used across all Alfresco RPC methods)
 */
export const ServerRefSchema = z.object({
  baseUrl: z.string().url(),
});

export type ServerRef = z.infer<typeof ServerRefSchema>;

/**
 * Login request and response
 */
export const LoginReqSchema = ServerRefSchema.extend({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const LoginResSchema = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.string().email().optional(),
  }),
});

export type LoginReq = z.infer<typeof LoginReqSchema>;
export type LoginRes = z.infer<typeof LoginResSchema>;

/**
 * Logout request and response
 */
export const LogoutReqSchema = ServerRefSchema;

export const LogoutResSchema = z.object({
  success: z.boolean(),
});

export type LogoutReq = z.infer<typeof LogoutReqSchema>;
export type LogoutRes = z.infer<typeof LogoutResSchema>;

/**
 * Get current user request and response
 */
export const GetCurrentUserReqSchema = ServerRefSchema;

export const GetCurrentUserResSchema = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.string().email().optional(),
  }),
});

export type GetCurrentUserReq = z.infer<typeof GetCurrentUserReqSchema>;
export type GetCurrentUserRes = z.infer<typeof GetCurrentUserResSchema>;

/**
 * Validate credentials request and response
 */
export const ValidateCredentialsReqSchema = z.object({
  baseUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
});

export const ValidateCredentialsResSchema = z.object({
  valid: z.boolean(),
  isAdmin: z.boolean().optional(),
  user: z
    .object({
      id: z.string(),
      displayName: z.string(),
      email: z.string().email().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export type ValidateCredentialsReq = z.infer<typeof ValidateCredentialsReqSchema>;
export type ValidateCredentialsRes = z.infer<typeof ValidateCredentialsResSchema>;

/**
 * Validate OIDC credentials request and response
 */
export const ValidateOidcCredentialsReqSchema = z.object({
  baseUrl: z.string().url(),
  accessToken: z.string().min(1),
  oidcHost: z.string().min(1),
  oidcRealm: z.string().min(1),
  oidcClientId: z.string().min(1),
});

export const ValidateOidcCredentialsResSchema = ValidateCredentialsResSchema;

export type ValidateOidcCredentialsReq = z.infer<typeof ValidateOidcCredentialsReqSchema>;
export type ValidateOidcCredentialsRes = z.infer<typeof ValidateOidcCredentialsResSchema>;

/**
 * List sites request and response
 */
export const ListSitesReqSchema = ServerRefSchema.extend({
  maxItems: z.number().int().min(1).max(1000).optional().default(100),
});

export const ListSitesResSchema = z.object({
  sites: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      visibility: z.enum(['PUBLIC', 'PRIVATE', 'MODERATED']),
    })
  ),
});

export type ListSitesReq = z.infer<typeof ListSitesReqSchema>;
export type ListSitesRes = z.infer<typeof ListSitesResSchema>;

/**
 * List groups request and response (with pagination)
 */
export const ListGroupsReqSchema = ServerRefSchema.extend({
  maxItems: z.number().int().min(1).max(1000).optional().default(100),
  skipCount: z.number().int().min(0).optional().default(0),
});

export const ListGroupsResSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      isRoot: z.boolean(),
      parentIds: z.array(z.string()),
    })
  ),
  pagination: z.object({
    totalItems: z.number().int(),
    hasMoreItems: z.boolean(),
    skipCount: z.number().int(),
    maxItems: z.number().int(),
  }),
});

export type ListGroupsReq = z.infer<typeof ListGroupsReqSchema>;
export type ListGroupsRes = z.infer<typeof ListGroupsResSchema>;

/**
 * Get group members request and response (with pagination)
 */
export const GetGroupMembersReqSchema = ServerRefSchema.extend({
  groupId: z.string().min(1),
  maxItems: z.number().int().min(1).max(1000).optional().default(100),
  skipCount: z.number().int().min(0).optional().default(0),
});

export const GetGroupMembersResSchema = z.object({
  members: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      memberType: z.enum(['PERSON', 'GROUP']),
      email: z.string().email().optional(),
    })
  ),
  pagination: z.object({
    totalItems: z.number().int(),
    hasMoreItems: z.boolean(),
    skipCount: z.number().int(),
    maxItems: z.number().int(),
  }),
});

export type GetGroupMembersReq = z.infer<typeof GetGroupMembersReqSchema>;
export type GetGroupMembersRes = z.infer<typeof GetGroupMembersResSchema>;

/**
 * OAuth2 configuration request and response
 */
export const ConfigureOAuth2ReqSchema = ServerRefSchema.extend({
  clientId: z.string().min(1),
  host: z.string().url(), // OAuth2 server host (e.g., Keycloak)
  realm: z.string().min(1), // OAuth2 realm
  scope: z.string().optional(),
  redirectUri: z.string().url().optional(),
  implicitFlow: z.boolean().optional().default(false),
});

export const ConfigureOAuth2ResSchema = z.object({
  success: z.boolean(),
});

export type ConfigureOAuth2Req = z.infer<typeof ConfigureOAuth2ReqSchema>;
export type ConfigureOAuth2Res = z.infer<typeof ConfigureOAuth2ResSchema>;

/**
 * OAuth2 token exchange request and response
 */
export const ExchangeOAuth2TokenReqSchema = ServerRefSchema.extend({
  clientId: z.string().min(1),
  host: z.string().url(),
  realm: z.string().min(1),
  code: z.string().min(1), // Authorization code from OAuth2 flow
  redirectUri: z.string().url().optional(),
  codeVerifier: z.string().optional(), // PKCE code verifier
});

export const ExchangeOAuth2TokenResSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number().optional(),
});

export type ExchangeOAuth2TokenReq = z.infer<typeof ExchangeOAuth2TokenReqSchema>;
export type ExchangeOAuth2TokenRes = z.infer<typeof ExchangeOAuth2TokenResSchema>;

/**
 * Poll for OAuth2 authorization code (for desktop OAuth flow)
 */
export const PollOAuth2CodeReqSchema = z.object({});

export const PollOAuth2CodeResSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  timestamp: z.number().optional(),
});

export type PollOAuth2CodeReq = z.infer<typeof PollOAuth2CodeReqSchema>;
export type PollOAuth2CodeRes = z.infer<typeof PollOAuth2CodeResSchema>;

/**
 * Get search dictionary request and response
 */
export const GetSearchDictionaryReqSchema = ServerRefSchema.extend({
  serverId: z.number().int(),
});

export const GetSearchDictionaryResSchema = z.object({
  types: z.array(z.string()),
  aspects: z.array(z.string()),
  sites: z.array(z.string()),
  properties: z.array(z.string()),
});

export type GetSearchDictionaryReq = z.infer<typeof GetSearchDictionaryReqSchema>;
export type GetSearchDictionaryRes = z.infer<typeof GetSearchDictionaryResSchema>;

/**
 * Get Tern definitions request and response
 */
export const GetTernDefinitionsReqSchema = ServerRefSchema.extend({
  serverId: z.number().int(),
});

export const GetTernDefinitionsResSchema = z.object({
  typeDefinitions: z.array(z.any()),
});

export type GetTernDefinitionsReq = z.infer<typeof GetTernDefinitionsReqSchema>;
export type GetTernDefinitionsRes = z.infer<typeof GetTernDefinitionsResSchema>;
