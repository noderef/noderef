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
 * Repository RPC handlers
 * Handles all backend.repository.* RPC methods
 */

import { NodesApi, SearchApi, SitesApi } from '@alfresco/js-api';
import { z } from 'zod';
import { buildSlingshotContentUrl } from '../../lib/alfresco-url.js';
import { AppErrors } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';
import {
  extractMimeTypeFromSlingshotNode,
  extractNodeNameFromSlingshotNode,
  extractParentRefFromSlingshotNode,
  fetchSlingshotNodeData,
  getNodePropertyValue,
  normalizeNodeRef,
} from './helpers.js';
import type { Routes, RpcContext } from './types.js';
import { getCurrentUserId, withAuth, withCredentials } from './withAuth.js';

const log = createLogger('backend.rpc.repository');

/**
 * Map an Alfresco API node entry to a standardized format
 */
function mapNode(entry: any) {
  return {
    id: entry.id,
    name: entry.name,
    isFolder: entry.isFolder,
    isFile: entry.isFile,
    nodeType: entry.nodeType,
    mimeType: entry.content?.mimeType,
    description: getNodePropertyValue(entry, 'cm:description'),
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt,
    modifiedBy: entry.modifiedByUser?.displayName || entry.modifiedByUser?.id,
    modifiedById: entry.modifiedByUser?.id,
    hasChildren: entry.isFolder,
    path: entry.path?.name,
  };
}

/**
 * Register all repository-related RPC handlers
 */
export function registerRepositoryHandlers(routes: Routes, ctx: RpcContext): void {
  const { nodeHistoryService } = ctx;

  routes['backend.repository.getSlingshotChildren'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
    }),
    handler: async params => {
      const { serverId, nodeId } = params as { serverId: number; nodeId: string };

      return withCredentials(ctx, serverId, async ({ username, token, authType, server }) => {
        const { nodeData, slingshotUrl } = await fetchSlingshotNodeData(
          server.baseUrl,
          nodeId,
          username || '',
          token!,
          authType as 'basic' | 'openid_connect'
        );

        log.debug(
          { serverId, nodeId, slingshotUrl, childCount: nodeData.children?.length || 0 },
          'Fetched slingshot children'
        );

        return { children: nodeData.children ?? [] };
      });
    },
  };

  routes['backend.repository.getSystemTreeRoot'] = {
    schema: z.object({
      serverId: z.number(),
    }),
    handler: async params => {
      const { serverId } = params as { serverId: number };

      // First get the system node ID using the API
      const systemNodeId = await withAuth(ctx, serverId, async api => {
        const searchApi = new SearchApi(api);
        const searchResult = await searchApi.search({
          query: {
            query: 'PATH:"/sys:system"',
            language: 'afts',
          },
          fields: ['id'],
        });

        const nodeId = searchResult?.list?.entries?.[0]?.entry?.id;
        if (!nodeId) {
          return AppErrors.notFound('System node');
        }
        return nodeId;
      });

      // Then fetch children using credentials (Slingshot API)
      return withCredentials(ctx, serverId, async ({ username, token, authType, server }) => {
        const { nodeData, slingshotUrl } = await fetchSlingshotNodeData(
          server.baseUrl,
          systemNodeId,
          username || '',
          token!,
          authType as 'basic' | 'openid_connect'
        );

        log.debug(
          { serverId, systemNodeId, slingshotUrl, childCount: nodeData.children?.length || 0 },
          'Fetched system tree root children'
        );

        return {
          systemNodeId,
          children: nodeData.children ?? [],
        };
      });
    },
  };

  routes['backend.repository.getNodeChildren'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string().optional(),
      maxItems: z.number().int().min(1).max(2000).optional(),
      skipCount: z.number().int().min(0).optional(),
    }),
    handler: async params => {
      const { serverId, nodeId, maxItems, skipCount } = params as {
        serverId: number;
        nodeId?: string;
        maxItems?: number;
        skipCount?: number;
      };

      return withAuth(ctx, serverId, async api => {
        const nodesApi = new NodesApi(api);
        const targetNodeId = nodeId || '-root-';

        log.debug({ serverId, nodeId: targetNodeId }, 'Fetching node children');

        const result = await nodesApi.listNodeChildren(targetNodeId, {
          include: ['properties', 'aspectNames', 'path'],
          fields: [
            'id',
            'name',
            'nodeType',
            'isFolder',
            'isFile',
            'modifiedAt',
            'modifiedByUser',
            'createdAt',
            'createdByUser',
            'content',
            'path',
          ],
          maxItems,
          skipCount,
        });

        if (process.env.NODE_ENV === 'development') {
          log.debug(
            { nodeId: targetNodeId, entriesCount: result.list?.entries?.length || 0 },
            'Alfresco API children response'
          );
        }

        // Build breadcrumb
        let breadcrumb: Array<{ id: string; name: string }> = [];
        try {
          const nodeDetails = await nodesApi.getNode(targetNodeId, { include: ['path'] });
          const pathElements = nodeDetails?.entry?.path?.elements || [];
          breadcrumb = pathElements
            .filter((element: any) => element.id && element.id !== targetNodeId)
            .map((element: any) => ({ id: element.id, name: element.name }));
          if (nodeDetails?.entry?.id) {
            breadcrumb.push({ id: nodeDetails.entry.id, name: nodeDetails.entry.name });
          }
        } catch (err) {
          log.warn({ err, nodeId: targetNodeId }, 'Failed to fetch node details for breadcrumb');
        }

        // Transform and filter
        const nodes = (result.list?.entries || [])
          .filter((entry: any) => entry.entry.nodeType !== 'cm:thumbnail')
          .map((entry: any) => mapNode(entry.entry));

        const pagination = result.list?.pagination;
        const paginationInfo = {
          count: pagination?.count ?? nodes.length,
          hasMoreItems: pagination?.hasMoreItems ?? false,
          maxItems: pagination?.maxItems ?? maxItems ?? nodes.length,
          skipCount: pagination?.skipCount ?? skipCount ?? 0,
          totalItems: pagination?.totalItems,
        };

        return { nodes, breadcrumb, pagination: paginationInfo };
      });
    },
  };

  routes['backend.repository.createSite'] = {
    schema: z.object({
      serverId: z.number(),
      parentNodeId: z.string().optional(),
      id: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9-]+$/)
        .optional(),
      title: z.string().trim().min(1),
      description: z.string().optional(),
      visibility: z.enum(['PUBLIC', 'PRIVATE', 'MODERATED']).optional(),
      skipConfiguration: z.boolean().optional(),
      skipAddToFavorites: z.boolean().optional(),
    }),
    handler: async params => {
      const {
        serverId,
        parentNodeId,
        id,
        title,
        description,
        visibility = 'PUBLIC',
        skipConfiguration = false,
        skipAddToFavorites = false,
      } = params as {
        serverId: number;
        parentNodeId?: string;
        id?: string;
        title: string;
        description?: string;
        visibility?: 'PUBLIC' | 'PRIVATE' | 'MODERATED';
        skipConfiguration?: boolean;
        skipAddToFavorites?: boolean;
      };

      return withAuth(ctx, serverId, async api => {
        const sitesApi = new SitesApi(api);
        const nodesApi = new NodesApi(api);

        const payload = {
          id: id?.trim() || undefined,
          title: title.trim(),
          description: description?.trim(),
          visibility,
        };

        log.debug({ serverId, siteId: payload.id, visibility }, 'Creating site');

        const siteResult = await sitesApi.createSite(payload as any, {
          skipConfiguration,
          skipAddToFavorites,
        });

        const siteEntry = (siteResult as any)?.entry ?? null;

        let node: any = null;

        const loadNodeByGuid = async (guid: string) => {
          const result = await nodesApi.getNode(guid, {
            include: ['properties', 'aspectNames', 'path'],
            fields: [
              'id',
              'name',
              'nodeType',
              'isFolder',
              'isFile',
              'modifiedAt',
              'modifiedByUser',
              'createdAt',
              'createdByUser',
              'content',
              'path',
              'properties',
            ],
          });
          node = mapNode(result.entry);
        };

        const loadNodeFromParent = async (parentId: string, siteId?: string) => {
          const result = await nodesApi.listNodeChildren(parentId, {
            include: ['properties', 'aspectNames', 'path'],
            fields: [
              'id',
              'name',
              'nodeType',
              'isFolder',
              'isFile',
              'modifiedAt',
              'modifiedByUser',
              'createdAt',
              'createdByUser',
              'content',
              'path',
              'properties',
            ],
            maxItems: 200,
            skipCount: 0,
          });

          const match = (result.list?.entries || []).find((entry: any) => {
            const child = entry.entry;
            if (!child?.isFolder) return false;
            if (child.nodeType !== 'st:site') return false;
            if (siteId) {
              return child.name === siteId;
            }
            return true;
          });

          if (match?.entry) {
            node = mapNode(match.entry);
          }
        };

        try {
          if (siteEntry?.guid) {
            await loadNodeByGuid(siteEntry.guid);
          } else if (parentNodeId) {
            await loadNodeFromParent(parentNodeId, siteEntry?.id);
          }
        } catch (err) {
          log.warn({ err, siteId: siteEntry?.id }, 'Created site but failed to load node metadata');
        }

        log.info(
          { serverId, siteId: siteEntry?.id, hasNode: Boolean(node) },
          'Site created successfully'
        );

        return { site: siteEntry, node };
      });
    },
  };

  routes['backend.repository.getSite'] = {
    schema: z.object({
      serverId: z.number(),
      siteId: z.string().min(1),
    }),
    handler: async params => {
      const { serverId, siteId } = params as { serverId: number; siteId: string };

      return withAuth(ctx, serverId, async api => {
        const sitesApi = new SitesApi(api);
        const result = await sitesApi.getSite(siteId);

        log.debug({ serverId, siteId }, 'Fetched site details');

        return { site: (result as any)?.entry ?? null };
      });
    },
  };

  routes['backend.repository.updateSite'] = {
    schema: z.object({
      serverId: z.number(),
      siteId: z.string().min(1),
      title: z.string().trim().min(1).optional(),
      description: z.string().optional(),
      visibility: z.enum(['PUBLIC', 'PRIVATE', 'MODERATED']).optional(),
    }),
    handler: async params => {
      const { serverId, siteId, title, description, visibility } = params as {
        serverId: number;
        siteId: string;
        title?: string;
        description?: string;
        visibility?: 'PUBLIC' | 'PRIVATE' | 'MODERATED';
      };

      return withAuth(ctx, serverId, async api => {
        const sitesApi = new SitesApi(api);

        const payload: any = {};
        if (title != null) payload.title = title;
        if (description != null) payload.description = description;
        if (visibility != null) payload.visibility = visibility;

        const result = await sitesApi.updateSite(siteId, payload);

        log.info({ serverId, siteId }, 'Site updated successfully');

        return { site: (result as any)?.entry ?? null };
      });
    },
  };

  routes['backend.repository.deleteSite'] = {
    schema: z.object({
      serverId: z.number(),
      siteId: z.string().min(1),
      permanent: z.boolean().optional(),
    }),
    handler: async params => {
      const {
        serverId,
        siteId,
        permanent = false,
      } = params as {
        serverId: number;
        siteId: string;
        permanent?: boolean;
      };

      return withAuth(ctx, serverId, async api => {
        const sitesApi = new SitesApi(api);
        await sitesApi.deleteSite(siteId, { permanent });

        log.info({ serverId, siteId, permanent }, 'Site deleted successfully');

        return { success: true };
      });
    },
  };

  routes['backend.repository.renameNode'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      newName: z.string(),
    }),
    handler: async params => {
      const { serverId, nodeId, newName } = params as {
        serverId: number;
        nodeId: string;
        newName: string;
      };

      return withAuth(ctx, serverId, async api => {
        const nodesApi = new NodesApi(api);
        const result = await nodesApi.updateNode(nodeId, { name: newName });

        log.debug({ serverId, nodeId, newName }, 'Node renamed successfully');

        return { success: true, node: result.entry };
      });
    },
  };

  routes['backend.repository.updateNodePermissions'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      permissions: z.object({
        isInheritanceEnabled: z.boolean().optional(),
        locallySet: z.array(
          z.object({
            authorityId: z.string().min(1),
            name: z.string().min(1),
            accessStatus: z.enum(['ALLOWED', 'DENIED']).optional(),
          })
        ),
      }),
    }),
    handler: async params => {
      const { serverId, nodeId, permissions } = params as {
        serverId: number;
        nodeId: string;
        permissions: {
          isInheritanceEnabled?: boolean;
          locallySet: Array<{
            authorityId: string;
            name: string;
            accessStatus?: 'ALLOWED' | 'DENIED';
          }>;
        };
      };

      return withAuth(ctx, serverId, async api => {
        const nodesApi = new NodesApi(api);
        const sanitizedLocallySet = (permissions.locallySet || []).map(entry => ({
          authorityId: entry.authorityId,
          name: entry.name,
          accessStatus: entry.accessStatus ?? 'ALLOWED',
        }));

        const result = await nodesApi.updateNode(nodeId, {
          permissions: {
            isInheritanceEnabled: permissions.isInheritanceEnabled,
            locallySet: sanitizedLocallySet,
          },
        });

        log.debug(
          { serverId, nodeId, locallySetCount: sanitizedLocallySet.length },
          'Node permissions updated successfully'
        );

        return { success: true, node: result.entry };
      });
    },
  };

  routes['backend.repository.deleteNode'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      permanent: z.boolean().optional(),
    }),
    handler: async params => {
      const {
        serverId,
        nodeId,
        permanent = false,
      } = params as {
        serverId: number;
        nodeId: string;
        permanent?: boolean;
      };

      return withAuth(ctx, serverId, async api => {
        const nodesApi = new NodesApi(api);
        await nodesApi.deleteNode(nodeId, { permanent });

        log.debug({ serverId, nodeId, permanent }, 'Node deleted successfully');

        return { success: true };
      });
    },
  };

  routes['backend.repository.getNodeDetails'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
    }),
    handler: async params => {
      const { serverId, nodeId } = params as { serverId: number; nodeId: string };
      const userId = await getCurrentUserId();

      return withCredentials(ctx, serverId, async ({ username, token, authType, server }) => {
        const { nodeData, slingshotUrl } = await fetchSlingshotNodeData(
          server.baseUrl,
          nodeId,
          username || '',
          token!,
          authType as 'basic' | 'openid_connect'
        );

        log.debug({ serverId, nodeId, slingshotUrl }, 'Fetched node details from slingshot API');

        const fullPath = nodeData.qnamePath?.prefixedName ?? null;
        let parentPath = fullPath;
        if (fullPath) {
          const lastSlashIndex = fullPath.lastIndexOf('/');
          if (lastSlashIndex >= 0) {
            parentPath = lastSlashIndex === 0 ? '/' : fullPath.substring(0, lastSlashIndex);
          }
        }

        await nodeHistoryService.recordAccess({
          userId,
          serverId,
          nodeRef: normalizeNodeRef(nodeData.nodeRef ?? nodeId),
          parentRef: extractParentRefFromSlingshotNode(nodeData),
          name:
            extractNodeNameFromSlingshotNode(nodeData) ??
            nodeData.name?.name ??
            nodeData.name?.prefixedName ??
            nodeId,
          path: parentPath,
          type: nodeData.type?.prefixedName ?? null,
          mimetype: extractMimeTypeFromSlingshotNode(nodeData),
        });

        return { nodeData };
      });
    },
  };

  routes['backend.repository.getSlingshotContent'] = {
    schema: z.object({
      serverId: z.number(),
      nodeId: z.string(),
      property: z.string().optional().default('cm:content'),
    }),
    handler: async params => {
      const { serverId, nodeId, property } = params as {
        serverId: number;
        nodeId: string;
        property: string;
      };

      return withCredentials(ctx, serverId, async ({ username, token, authType, server }) => {
        // Build slingshot content URL
        const nodeRef = `workspace/SpacesStore/${nodeId}`;
        const contentUrl = buildSlingshotContentUrl(server.baseUrl, nodeRef, property);

        log.debug(
          { serverId, nodeId, property, contentUrl },
          'Downloading content from slingshot API'
        );

        // Build Authorization header based on auth type
        const authHeader =
          authType === 'openid_connect'
            ? `Bearer ${token}`
            : `Basic ${Buffer.from(`${username || ''}:${token}`).toString('base64')}`;

        const response = await fetch(contentUrl, {
          method: 'GET',
          headers: { Authorization: authHeader },
        });

        if (!response.ok) {
          return AppErrors.connectionError(`Failed to download content: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        return { buffer, contentType };
      });
    },
  };
}
