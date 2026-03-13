/**
 * Copyright 2025-2026 NodeRef
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

import type { AlfrescoApi } from '@alfresco/js-api';
import { z } from 'zod';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import { getPrismaClient } from '../../lib/prisma.js';
import * as authSvc from '../../services/alfresco/authService.js';
import { getAuthenticatedClientWithRefresh } from '../../services/alfresco/authenticationHelper.js';
import { callMethod } from '../../services/alfresco/proxyService.js';
import { getCurrentUserId } from '../../services/userBootstrap.js';

const log = createLogger('alfresco.rpc');

type ZSchema = z.ZodTypeAny;
type Routes = Record<string, { schema: ZSchema; handler: (p: unknown) => Promise<unknown> }>;

/**
 * Authenticate using stored server credentials
 * Handles automatic token refresh for OIDC if token is expired or expiring soon
 */
async function authenticateWithStoredCredentials(
  serverId: number,
  baseUrl: string
): Promise<AlfrescoApi | undefined> {
  const userId = await getCurrentUserId();
  const prisma = await getPrismaClient();

  // Use centralized authentication helper (DRY principle)
  return getAuthenticatedClientWithRefresh(userId, serverId, baseUrl, prisma);
}

/**
 * Register all Alfresco RPC methods
 * @param routes The routes object to register methods on
 * @param contracts The contracts module (imported in server.ts to avoid nested dynamic imports)
 */
export function registerAlfrescoRpc(
  routes: Routes,
  contracts: typeof import('@app/contracts')
): void {
  const required = [
    'LoginReqSchema',
    'LogoutReqSchema',
    'ValidateCredentialsReqSchema',
    'ValidateOidcCredentialsReqSchema',
    'AlfrescoRpcCallSchema',
    'ConfigureOAuth2ReqSchema',
    'ExchangeOAuth2TokenReqSchema',
    'PollOAuth2CodeReqSchema',
    'GetTernDefinitionsReqSchema',
  ];

  const missing = required.filter(n => !(n in contracts));
  if (missing.length) {
    AppErrors.internalError(`Missing required schemas: ${missing.join(', ')}`);
  }

  const {
    LoginReqSchema,
    LogoutReqSchema,
    ValidateCredentialsReqSchema,
    ValidateOidcCredentialsReqSchema,
    AlfrescoRpcCallSchema,
    ConfigureOAuth2ReqSchema,
    ExchangeOAuth2TokenReqSchema,
    PollOAuth2CodeReqSchema,
    GetTernDefinitionsReqSchema,
  } = contracts;

  routes['alfresco.login'] = {
    schema: LoginReqSchema as unknown as ZSchema,
    handler: async params => authSvc.login(LoginReqSchema.parse(params)),
  };

  routes['alfresco.logout'] = {
    schema: LogoutReqSchema as unknown as ZSchema,
    handler: async params => authSvc.logout(LogoutReqSchema.parse(params)),
  };

  routes['alfresco.validateCredentials'] = {
    schema: ValidateCredentialsReqSchema as unknown as ZSchema,
    handler: async params => {
      try {
        return await authSvc.validateCredentials(ValidateCredentialsReqSchema.parse(params));
      } catch (error: any) {
        // Ensure errors never escape - always return a validation response
        return {
          valid: false,
          isAdmin: false,
          error: 'Authentication failed',
        };
      }
    },
  };

  routes['alfresco.validateOidcCredentials'] = {
    schema: ValidateOidcCredentialsReqSchema as unknown as ZSchema,
    handler: async params => {
      try {
        return await authSvc.validateOidcCredentials(
          ValidateOidcCredentialsReqSchema.parse(params)
        );
      } catch (error: any) {
        // Ensure errors never escape - always return a validation response
        return {
          valid: false,
          isAdmin: false,
          error: 'Authentication failed',
        };
      }
    },
  };

  routes['alfresco.call'] = {
    schema: AlfrescoRpcCallSchema as unknown as ZSchema,
    handler: async params => {
      const input = AlfrescoRpcCallSchema.parse(params);

      // If serverId is provided, authenticate using stored credentials
      if (input.serverId) {
        const authenticatedApi = await authenticateWithStoredCredentials(
          input.serverId,
          input.baseUrl
        );
        if (authenticatedApi) {
          return callMethod(input.baseUrl, input.method, input.args, authenticatedApi);
        }
      }

      // No serverId or authentication failed - call without auth
      return callMethod(input.baseUrl, input.method, input.args);
    },
  };

  routes['alfresco.auth.configureOAuth2'] = {
    schema: ConfigureOAuth2ReqSchema as unknown as ZSchema,
    handler: async params => authSvc.configureOAuth2(ConfigureOAuth2ReqSchema.parse(params)),
  };

  routes['alfresco.auth.exchangeOAuth2Token'] = {
    schema: ExchangeOAuth2TokenReqSchema as unknown as ZSchema,
    handler: async params =>
      authSvc.exchangeOAuth2Token(ExchangeOAuth2TokenReqSchema.parse(params)),
  };

  routes['alfresco.auth.pollOAuth2Code'] = {
    schema: PollOAuth2CodeReqSchema as unknown as ZSchema,
    handler: async () => {
      // Return the pending OAuth code if available
      const authData = (global as any).__oauth_pending_auth;
      if (authData) {
        // Clear it after reading
        delete (global as any).__oauth_pending_auth;
        return {
          code: authData.code,
          state: authData.state,
          timestamp: authData.timestamp,
        };
      }
      return {};
    },
  };

  routes['alfresco.search.getDictionary'] = {
    schema: contracts.GetSearchDictionaryReqSchema as unknown as ZSchema,
    handler: async params => {
      const { serverId, baseUrl } = contracts.GetSearchDictionaryReqSchema.parse(params);
      const { getSearchDictionary } = await import('../../services/alfresco/dictionaryService.js');

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }
      // TypeScript doesn't recognize never-return, so we assert api is defined
      return getSearchDictionary(api!, serverId);
    },
  };

  routes['alfresco.search.propertiesByPrefix'] = {
    schema: z.object({
      serverId: z.number(),
      baseUrl: z.string().url(),
      prefix: z.string().min(1),
    }),
    handler: async params => {
      const { serverId, baseUrl, prefix } = params as {
        serverId: number;
        baseUrl: string;
        prefix: string;
      };
      const { getPropertiesByPrefix } = await import(
        '../../services/alfresco/dictionaryService.js'
      );

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }
      // TypeScript doesn't recognize never-return, so we assert api is defined
      const apiDefined = api!;
      return getPropertiesByPrefix(apiDefined, serverId, prefix);
    },
  };

  routes['alfresco.search.propertyDataTypesByPrefix'] = {
    schema: z.object({
      serverId: z.number(),
      baseUrl: z.string().url(),
      prefix: z.string().min(1),
    }),
    handler: async params => {
      const { serverId, baseUrl, prefix } = params as {
        serverId: number;
        baseUrl: string;
        prefix: string;
      };
      const { getPropertyDataTypesByPrefix } = await import(
        '../../services/alfresco/dictionaryService.js'
      );

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }
      return getPropertyDataTypesByPrefix(api!, serverId, prefix);
    },
  };

  routes['alfresco.search.classesByPrefix'] = {
    schema: z.object({
      serverId: z.number(),
      baseUrl: z.string().url(),
      prefix: z.string().min(1),
    }),
    handler: async params => {
      const { serverId, baseUrl, prefix } = params as {
        serverId: number;
        baseUrl: string;
        prefix: string;
      };
      const { getClassNamesByPrefix } = await import(
        '../../services/alfresco/dictionaryService.js'
      );

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }
      // TypeScript doesn't recognize never-return, so we assert api is defined
      const apiDefined = api!;
      return getClassNamesByPrefix(apiDefined, serverId, prefix);
    },
  };

  routes['alfresco.search.searchPaths'] = {
    schema: z.object({
      serverId: z.number(),
      baseUrl: z.string().url(),
      query: z.string().min(1),
    }),
    handler: async params => {
      const { serverId, baseUrl, query } = params as {
        serverId: number;
        baseUrl: string;
        query: string;
      };

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }

      try {
        const { SearchApi } = await import('@alfresco/js-api');
        const searchApi = new SearchApi(api);

        // Search for folders matching the query
        // Use AFTS to search for folders (cm:folder) with name matching query
        // TEXT field supports partial matching without wildcards
        const escapedQuery = query.replace(/"/g, '\\"').replace(/'/g, "\\'");
        const aftsQuery = `TYPE:"cm:folder" AND TEXT:"${escapedQuery}"`;

        const searchRequest = {
          query: {
            query: aftsQuery,
            language: 'afts',
          },
          include: ['path'],
          fields: ['id', 'name', 'path'],
          paging: {
            maxItems: 20,
            skipCount: 0,
          },
        };

        const searchResult = await searchApi.search(searchRequest);
        const entries = searchResult.list?.entries || [];

        // Extract path and name from results
        const paths = entries
          .map((entry: any) => {
            const node = entry.entry;
            if (!node || !node.name) return null;

            // Build display path (for UI display)
            let displayPath = '';
            if (node.path?.name) {
              displayPath = node.path.name;
            } else if (node.path?.elements && Array.isArray(node.path.elements)) {
              // Construct display path from elements
              const pathParts = node.path.elements
                .filter((el: any) => el.name && el.name !== 'Company Home')
                .map((el: any) => el.name);
              displayPath = '/' + pathParts.join('/');
            } else if (node.path) {
              // Fallback: use path as string if it's a string
              displayPath = typeof node.path === 'string' ? node.path : '';
            }

            // Build qname path (for PATH query)
            // PATH queries in Alfresco require full path from root: /app:company_home/...
            let qnamePath = '';
            if (node.path?.elements && Array.isArray(node.path.elements)) {
              // ISO 9075 encoding for qname local names
              // XML names cannot start with digits or contain certain special characters
              // These need to be encoded as _xHHHH_ where HHHH is the hex Unicode code point
              const encodeISO9075 = (name: string): string => {
                if (!name) return name;

                let result = '';
                for (let i = 0; i < name.length; i++) {
                  const char = name[i];
                  const code = char.charCodeAt(0);

                  // Check if character needs encoding:
                  // - First char: must be letter or underscore (not digit, hyphen, or special)
                  // - Other chars: letters, digits, hyphens, underscores, periods are OK
                  const isFirstChar = i === 0;
                  const isLetter = /[a-zA-Z]/.test(char);
                  const isDigit = /[0-9]/.test(char);
                  const isUnderscore = char === '_';
                  const isHyphen = char === '-';
                  const isPeriod = char === '.';

                  let needsEncoding = false;
                  if (isFirstChar) {
                    // First char can only be letter or underscore
                    // But underscore followed by 'x' could conflict with encoding, so encode digits and hyphens
                    needsEncoding = !isLetter && !isUnderscore;
                  } else {
                    // Subsequent chars: encode special chars (but keep letters, digits, underscore, hyphen, period)
                    needsEncoding =
                      !isLetter && !isDigit && !isUnderscore && !isHyphen && !isPeriod;
                  }

                  if (needsEncoding) {
                    // Encode as _xHHHH_ format
                    result += `_x${code.toString(16).padStart(4, '0')}_`;
                  } else {
                    result += char;
                  }
                }
                return result;
              };

              // Helper to convert name + nodeType to qname format
              // Note: Qnames in Alfresco are NOT derived from display names - they're stored separately.
              // However, the API doesn't return qnames for path elements, so we must construct them.
              const toQname = (name: string, nodeType: string): string => {
                const nodeTypeLower = (nodeType || '').toLowerCase();

                // Known system folders with fixed qnames (display name differs from qname)
                const knownQnames: Record<string, string> = {
                  'Company Home': 'app:company_home',
                  'Data Dictionary': 'app:dictionary',
                  'Guest Home': 'app:guest_home',
                  'User Homes': 'app:user_homes',
                  Shared: 'app:shared',
                  'Imap Attachments': 'app:imap_attachments',
                  'IMAP Home': 'app:imap_home',
                };
                if (knownQnames[name]) {
                  return knownQnames[name];
                }

                // Sites container (st:sites) is a singleton with fixed qname
                if (nodeTypeLower === 'st:sites') {
                  return 'st:sites';
                }

                // Replace spaces with underscores, then apply ISO 9075 encoding
                const normalizedName = encodeISO9075(name.replace(/\s+/g, '_'));

                // Extract prefix from nodeType
                if (nodeType && nodeType.includes(':')) {
                  const prefix = nodeType.split(':')[0];
                  return `${prefix}:${normalizedName}`;
                }

                // Default to cm: prefix if nodeType not available
                return `cm:${normalizedName}`;
              };

              // Construct qname path from elements
              const qnameParts = node.path.elements
                .filter((el: any) => el.name)
                .map((el: any) => {
                  // Prefer prefixedName if available (most accurate source)
                  if (el.prefixedName) {
                    return el.prefixedName;
                  }
                  // Otherwise construct from name + nodeType
                  return toQname(el.name, el.nodeType || '');
                });

              // Add the node's own qname
              const nodeQname = node.prefixedName || toQname(node.name || '', node.nodeType || '');

              qnamePath = '/' + qnameParts.join('/') + '/' + nodeQname;
            } else if (node.path?.qnamePath) {
              // Use qnamePath if directly available
              qnamePath = node.path.qnamePath;
            }

            const name = node.name;
            const displayFullPath = displayPath ? `${displayPath}/${name}` : name;
            // If qnamePath was constructed, use it; otherwise fall back to display path
            const qnameFullPath = qnamePath || displayFullPath;

            return {
              path: displayFullPath, // Display path for UI
              qnamePath: qnameFullPath, // Qname path for PATH query
              name,
            };
          })
          .filter(
            (p: any): p is { path: string; qnamePath: string; name: string } =>
              p !== null && p.path && p.name && p.qnamePath
          );

        return paths;
      } catch (error) {
        log.error({ serverId, query, error }, 'Failed to search paths');
        throw error;
      }
    },
  };

  routes['alfresco.search.query'] = {
    schema: z.object({
      serverId: z.number(),
      baseUrl: z.string().url(),
      query: z.string().min(1),
      maxItems: z.number().optional().default(50),
      skipCount: z.number().optional().default(0),
    }),
    handler: async params => {
      const { serverId, baseUrl, query, maxItems, skipCount } = params as {
        serverId: number;
        baseUrl: string;
        query: string;
        maxItems: number;
        skipCount: number;
      };

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }

      try {
        const { SearchApi } = await import('@alfresco/js-api');
        const searchApi = new SearchApi(api);

        const filterQueries =
          query && query.trim().length > 0 ? [{ query: query.trim() }] : undefined;

        const searchRequest = {
          query: {
            query: '*',
            language: 'afts',
          },
          ...(filterQueries ? { filterQueries } : {}),
          include: ['path', 'properties'],
          fields: [
            'id',
            'name',
            'nodeType',
            'modifiedAt',
            'modifiedByUser',
            'createdAt',
            'createdByUser',
            'path',
            'content',
            'parentId',
          ],
          sort: [
            {
              type: 'FIELD',
              field: 'modified',
              ascending: false,
            },
          ],
          paging: {
            maxItems,
            skipCount,
          },
        };

        log.debug(
          {
            serverId,
            query,
            request: searchRequest,
          },
          'alfresco.search.query request'
        );

        const searchResult = await searchApi.search(searchRequest);
        const entries = searchResult.list?.entries || [];

        const pagination = searchResult.list?.pagination;
        let totalItems =
          pagination?.totalItems ??
          (pagination?.hasMoreItems
            ? undefined
            : (pagination?.skipCount ?? skipCount ?? 0) + (pagination?.count ?? entries.length));

        if (totalItems === undefined && skipCount === 0) {
          try {
            const totalCheckResult = await searchApi.search({
              query: searchRequest.query,
              filterQueries: searchRequest.filterQueries,
              // We only need minimal data here, so limit payload
              fields: ['id'],
              paging: {
                maxItems: 1,
                skipCount: 0,
              },
            });
            const totalCheckPagination = totalCheckResult.list?.pagination;
            if (totalCheckPagination?.totalItems !== undefined) {
              totalItems = totalCheckPagination.totalItems;
            }
          } catch (totalError) {
            log.debug({ serverId, query, err: totalError }, 'Failed to fetch totalItems fallback');
          }
        }

        const paginationInfo = {
          count: pagination?.count ?? entries.length,
          hasMoreItems: pagination?.hasMoreItems ?? false,
          skipCount: pagination?.skipCount ?? skipCount ?? 0,
          maxItems: pagination?.maxItems ?? maxItems ?? entries.length,
          totalItems,
        };

        log.debug(
          {
            serverId,
            query,
            pagination: paginationInfo,
            itemCount: entries.length,
          },
          'alfresco.search.query pagination'
        );

        return {
          items: entries.map((entry: any) => {
            const node = entry.entry;

            // Construct path similar to searchPaths
            let path = '';
            if (node.path?.name) {
              path = node.path.name;
            } else if (node.path?.elements && Array.isArray(node.path.elements)) {
              const pathParts = node.path.elements
                .filter((el: any) => el.name && el.name !== 'Company Home')
                .map((el: any) => el.name);
              path = '/' + pathParts.join('/');
            } else if (node.path) {
              path = typeof node.path === 'string' ? node.path : '';
            }

            return {
              id: node.id,
              uuid: node.id,
              isFolder: Boolean(node.isFolder),
              isFile: Boolean(node.isFile),
              name: node.name,
              nodeRef: `workspace://SpacesStore/${node.id}`, // Assuming SpacesStore for now
              type: node.nodeType,
              path,
              modifiedAt: node.modifiedAt,
              modifier: node.modifiedByUser?.displayName || node.modifiedByUser?.id || 'Unknown',
              createdAt: node.createdAt,
              creator: node.createdByUser?.displayName || node.createdByUser?.id || 'Unknown',
              parentId: node.parentId,
              mimeType: node.content?.mimeType,
              properties: node.properties ?? {},
            };
          }),
          pagination: paginationInfo,
        };
      } catch (error) {
        log.error({ serverId, query, error }, 'Failed to execute search query');
        throw error;
      }
    },
  };

  routes['alfresco.getTernDefinitions'] = {
    schema: GetTernDefinitionsReqSchema as unknown as ZSchema,
    handler: async params => {
      const { serverId, baseUrl } = GetTernDefinitionsReqSchema.parse(params);
      const { getTernDefinitions } = await import('../../services/alfresco/ternService.js');

      const api = await authenticateWithStoredCredentials(serverId, baseUrl);
      if (!api) {
        AppErrors.unauthorized('Failed to authenticate');
      }
      return getTernDefinitions(api!);
    },
  };
}
