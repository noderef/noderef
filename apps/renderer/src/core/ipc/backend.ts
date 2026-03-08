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

/* eslint-disable no-console */

/**
 * Typed RPC client for backend data services
 * Provides semantic helpers for consuming backend data RPC endpoints
 * and refreshing local state caches
 */

import type {
  LocalFile as ContractsLocalFile,
  CreateServer,
  NodeHistoryActivitySummary,
  PublicServer,
  UpdateServer,
} from '@app/contracts';
import { rpc } from './rpc.js';

/**
 * Backend data services RPC client
 */
export const backendRpc = {
  /**
   * Load user workspace (bootstrap data for renderer)
   * Returns all servers, saved searches, and recent history
   */
  async loadWorkspace(): Promise<{
    servers: PublicServer[];
    savedSearches: unknown[];
    recentNodeHistory: unknown[];
    recentJsConsoleHistory: unknown[];
    localFiles: LocalFilesListResponse;
    user: {
      id: number;
      username: string;
      fullName: string | null;
      email: string | null;
      thumbnail: string | null;
    } | null;
  }> {
    console.log('📦 Loading workspace...');
    const startTime = Date.now();
    try {
      const result = await rpc<{
        servers: PublicServer[];
        savedSearches: unknown[];
        recentNodeHistory: unknown[];
        recentJsConsoleHistory: unknown[];
        localFiles: LocalFilesListResponse;
        user: {
          id: number;
          username: string;
          fullName: string | null;
          email: string | null;
          thumbnail: string | null;
        } | null;
      }>('backend.workspace.load', {});
      const duration = Date.now() - startTime;
      console.log(`📦 Workspace loaded (${duration}ms):`, {
        servers: result.servers?.length || 0,
        savedSearches: result.savedSearches?.length || 0,
      });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`📦 Workspace load error (${duration}ms):`, error);
      throw error;
    }
  },

  /**
   * Server CRUD operations
   */
  servers: {
    /**
     * List all servers for the current user
     */
    async list(): Promise<PublicServer[]> {
      return rpc<PublicServer[]>('backend.servers.list', {});
    },

    /**
     * Get a server by ID
     */
    async get(id: number): Promise<PublicServer> {
      return rpc<PublicServer>('backend.servers.get', { id });
    },

    /**
     * Create a new server
     */
    async create(data: Omit<CreateServer, 'userId'>): Promise<PublicServer> {
      console.log('➕ Creating server:', data.name);
      return rpc<PublicServer>('backend.servers.create', data);
    },

    /**
     * Update a server
     */
    async update(id: number, data: UpdateServer): Promise<PublicServer> {
      console.log('✏️  Updating server:', id);
      return rpc<PublicServer>('backend.servers.update', { id, ...data });
    },

    /**
     * Delete a server
     */
    async delete(id: number): Promise<{ success: boolean }> {
      console.log('🗑️  Deleting server:', id);
      return rpc<{ success: boolean }>('backend.servers.delete', { id });
    },

    /**
     * Reorder servers
     */
    async reorder(orders: Array<{ id: number; displayOrder: number }>): Promise<void> {
      console.log('🔄 Reordering servers:', orders.length);
      return rpc<void>('backend.servers.reorder', { orders });
    },

    /**
     * Update last accessed timestamp
     */
    async updateLastAccessed(id: number): Promise<void> {
      return rpc<void>('backend.servers.updateLastAccessed', { id });
    },

    /**
     * Get Alfresco authentication ticket for a server
     */
    async getAuthTicket(serverId: number): Promise<{ ticket: string | null }> {
      return rpc<{ ticket: string | null }>('backend.servers.getAuthTicket', { serverId });
    },

    /**
     * Update OIDC tokens for a server (used during re-authentication)
     */
    async updateOidcTokens(
      id: number,
      tokens: { accessToken: string; refreshToken?: string; expiresIn?: number }
    ): Promise<PublicServer> {
      return rpc<PublicServer>('backend.servers.updateOidcTokens', { id, ...tokens });
    },
  },

  /**
   * Search History operations
   */
  searchHistory: {
    /**
     * List recent search history entries
     */
    async list(options?: { limit?: number }): Promise<SearchHistory[]> {
      return rpc<SearchHistory[]>('backend.searchHistory.list', options ?? {});
    },

    /**
     * Create a new search history entry
     */
    async create(data: {
      query: string;
      resultsCount?: number | null;
      searchId?: number | null;
    }): Promise<SearchHistory> {
      return rpc<SearchHistory>('backend.searchHistory.create', data);
    },
  },

  /**
   * Local file operations
   */
  localFiles: {
    /**
     * List all local files for the current user
     */
    async list(params?: {
      query?: string;
      skipCount?: number;
      maxItems?: number;
      sortBy?: 'name' | 'lastModified' | 'createdAt' | 'type';
      sortDir?: 'asc' | 'desc';
    }): Promise<LocalFilesListResponse> {
      return rpc<LocalFilesListResponse>('backend.localFiles.list', params ?? {});
    },

    /**
     * Create a new local file
     */
    async create(data: {
      name: string;
      content?: string | null;
      type?: string | null;
    }): Promise<LocalFile> {
      return rpc<LocalFile>('backend.localFiles.create', data);
    },

    /**
     * Update an existing local file
     */
    async update(
      id: number,
      data: { name?: string; content?: string | null; type?: string | null }
    ): Promise<LocalFile> {
      return rpc<LocalFile>('backend.localFiles.update', { id, ...data });
    },

    /**
     * Delete a local file
     */
    async delete(id: number): Promise<{ success: boolean }> {
      return rpc<{ success: boolean }>('backend.localFiles.delete', { id });
    },
  },

  /**
   * Saved Search CRUD operations
   */
  savedSearches: {
    /**
     * List all saved searches for the current user, optionally filtered by server
     */
    async list(serverId?: number): Promise<SavedSearch[]> {
      return rpc<SavedSearch[]>('backend.savedSearches.list', { serverId });
    },

    /**
     * Get a saved search by ID
     */
    async get(id: number): Promise<SavedSearch> {
      return rpc<SavedSearch>('backend.savedSearches.get', { id });
    },

    /**
     * Create a new saved search
     */
    async create(data: {
      serverId: number;
      name: string;
      query: string;
      columns?: string | null;
      isDefault?: boolean;
    }): Promise<SavedSearch> {
      console.log('➕ Creating saved search:', data.name);
      return rpc<SavedSearch>('backend.savedSearches.create', data);
    },

    /**
     * Update a saved search
     */
    async update(
      id: number,
      data: { name?: string; query?: string; columns?: string | null; isDefault?: boolean }
    ): Promise<SavedSearch> {
      console.log('✏️  Updating saved search:', id);
      return rpc<SavedSearch>('backend.savedSearches.update', { id, ...data });
    },

    /**
     * Delete a saved search
     */
    async delete(id: number): Promise<{ success: boolean }> {
      console.log('🗑️  Deleting saved search:', id);
      return rpc<{ success: boolean }>('backend.savedSearches.delete', { id });
    },
  },

  /**
   * Agent chat + run operations
   */
  agent: {
    async getManifest(): Promise<{
      version: string;
      operations: Array<{
        name: string;
        aliases: string[];
        description: string;
        alwaysFirst?: boolean;
        destructive?: boolean;
        requiresConfirmation?: boolean;
      }>;
    }> {
      return rpc('backend.agent.getManifest', {});
    },

    async listChats(params?: {
      serverId?: number;
      skipCount?: number;
      maxItems?: number;
    }): Promise<{
      items: AgentChatSummary[];
      pagination: {
        totalItems: number;
        skipCount: number;
        maxItems: number;
        hasMoreItems: boolean;
      };
    }> {
      return rpc('backend.agent.listChats', params ?? {});
    },

    async createChat(data: { serverId: number; title?: string }): Promise<AgentChatSummary> {
      return rpc('backend.agent.createChat', data);
    },

    async deleteChat(id: number): Promise<{ success: boolean }> {
      return rpc('backend.agent.deleteChat', { id });
    },

    async searchChats(params: {
      query: string;
      serverId?: number;
      maxItems?: number;
    }): Promise<AgentChatSummary[]> {
      return rpc('backend.agent.searchChats', params);
    },

    async listMessages(params: {
      chatId: number;
      beforeId?: number;
      maxItems?: number;
    }): Promise<AgentMessage[]> {
      return rpc('backend.agent.listMessages', params);
    },

    async listRuns(params: { chatId: number; skipCount?: number; maxItems?: number }): Promise<{
      items: AgentRunSummary[];
      pagination: {
        totalItems: number;
        skipCount: number;
        maxItems: number;
        hasMoreItems: boolean;
      };
    }> {
      return rpc('backend.agent.listRuns', params);
    },

    async listRunEvents(params: {
      runId: number;
      afterId?: number;
      maxItems?: number;
    }): Promise<AgentRunEvent[]> {
      return rpc('backend.agent.listRunEvents', params);
    },

    async sendMessage(data: {
      chatId: number;
      content: string;
      mentions?: AgentMention[];
      aiProvider?: string;
      aiModel?: string;
      appLanguage?: string;
      autoApproveConfirmations?: boolean;
    }): Promise<{ message: AgentMessage; run: AgentRunSummary }> {
      return rpc('backend.agent.sendMessage', data);
    },

    async cancelRun(runId: number): Promise<{ success: boolean; reason?: string }> {
      return rpc('backend.agent.cancelRun', { runId });
    },

    async confirmStep(data: {
      runId: number;
      stepId: number;
      confirmationToken: string;
      approved: boolean;
      confirmationText?: string;
      autoApproveConfirmations?: boolean;
    }): Promise<{ success: boolean; runStatus: string }> {
      return rpc('backend.agent.confirmStep', data);
    },

    async setChatAutoApproveConfirmations(data: {
      chatId: number;
      enabled: boolean;
    }): Promise<{ success: boolean; updatedRuns: number }> {
      return rpc('backend.agent.setChatAutoApproveConfirmations', data);
    },

    async searchMentions(params: {
      serverId: number;
      query: string;
      types?: Array<'node' | 'person' | 'group'>;
      skipCount?: number;
      maxItems?: number;
    }): Promise<{
      items: AgentMentionSuggestion[];
      pagination: {
        totalItems: number;
        skipCount: number;
        maxItems: number;
        hasMoreItems: boolean;
      };
    }> {
      return rpc('backend.agent.searchMentions', params);
    },
  },

  /**
   * Node history activity (dashboard)
   */
  nodeHistory: {
    /**
     * Fetch aggregated node activity (heatmap + timeline)
     */
    async activity(options?: {
      serverId?: number;
      days?: number;
      limit?: number;
      offset?: number;
    }): Promise<NodeHistoryActivitySummary> {
      return rpc<NodeHistoryActivitySummary>('backend.nodeHistory.activity', options ?? {});
    },
  },

  /**
   * Repository node operations
   */
  repository: {
    /**
     * Get children of a node (folder)
     * @param serverId The server ID
     * @param nodeId The node ID (defaults to '-root-' for Company Home)
     */
    async getNodeChildren(
      serverId: number,
      nodeId?: string,
      options?: { skipCount?: number; maxItems?: number }
    ): Promise<{
      nodes: RepositoryNode[];
      breadcrumb: RepositoryBreadcrumbItem[];
      pagination?: RepositoryPaginationInfo;
    }> {
      console.log('📁 Fetching node children:', {
        serverId,
        nodeId: nodeId || '-root-',
        skipCount: options?.skipCount,
        maxItems: options?.maxItems,
      });
      return rpc<{
        nodes: RepositoryNode[];
        breadcrumb: RepositoryBreadcrumbItem[];
        pagination?: RepositoryPaginationInfo;
      }>('backend.repository.getNodeChildren', {
        serverId,
        nodeId,
        ...(options ?? {}),
      });
    },

    /**
     * Create a new site
     */
    async createSite(
      serverId: number,
      payload: {
        parentNodeId?: string;
        id?: string;
        title: string;
        description?: string;
        visibility?: SiteVisibility;
        skipConfiguration?: boolean;
        skipAddToFavorites?: boolean;
      }
    ): Promise<{ site: SiteEntry; node?: RepositoryNode | null }> {
      console.log('🌐 Creating site:', {
        serverId,
        id: payload.id,
        visibility: payload.visibility,
      });
      return rpc<{ site: SiteEntry; node?: RepositoryNode | null }>(
        'backend.repository.createSite',
        {
          serverId,
          ...payload,
        }
      );
    },

    /**
     * Get site details
     */
    async getSite(serverId: number, siteId: string): Promise<{ site: SiteEntry | null }> {
      console.log('🌐 Fetching site:', { serverId, siteId });
      return rpc<{ site: SiteEntry | null }>('backend.repository.getSite', { serverId, siteId });
    },

    /**
     * Update a site
     */
    async updateSite(
      serverId: number,
      siteId: string,
      data: { title?: string; description?: string; visibility?: SiteVisibility }
    ): Promise<{ site: SiteEntry | null }> {
      console.log('🌐 Updating site:', { serverId, siteId });
      return rpc<{ site: SiteEntry | null }>('backend.repository.updateSite', {
        serverId,
        siteId,
        ...data,
      });
    },

    /**
     * Delete a site
     */
    async deleteSite(
      serverId: number,
      siteId: string,
      permanent = false
    ): Promise<{ success: boolean }> {
      console.log('🌐 Deleting site:', { serverId, siteId, permanent });
      return rpc<{ success: boolean }>('backend.repository.deleteSite', {
        serverId,
        siteId,
        permanent,
      });
    },

    /**
     * Rename a node
     */
    async renameNode(
      serverId: number,
      nodeId: string,
      newName: string
    ): Promise<{ success: boolean; node: any }> {
      console.log('✏️ Renaming node:', { serverId, nodeId, newName });
      return rpc<{ success: boolean; node: any }>('backend.repository.renameNode', {
        serverId,
        nodeId,
        newName,
      });
    },

    /**
     * Update node permissions
     */
    async updateNodePermissions(
      serverId: number,
      nodeId: string,
      permissions: {
        isInheritanceEnabled?: boolean;
        locallySet: Array<{
          authorityId: string;
          name: string;
          accessStatus?: 'ALLOWED' | 'DENIED';
        }>;
      }
    ): Promise<{ success: boolean; node: any }> {
      console.log('🔐 Updating node permissions:', { serverId, nodeId });
      return rpc<{ success: boolean; node: any }>('backend.repository.updateNodePermissions', {
        serverId,
        nodeId,
        permissions,
      });
    },

    /**
     * Delete a node
     */
    async deleteNode(
      serverId: number,
      nodeId: string,
      permanent = false
    ): Promise<{ success: boolean }> {
      console.log('🗑️ Deleting node:', { serverId, nodeId, permanent });
      return rpc<{ success: boolean }>('backend.repository.deleteNode', {
        serverId,
        nodeId,
        permanent,
      });
    },

    /**
     * Get detailed node information from slingshot API
     */
    async getNodeDetails(
      serverId: number,
      nodeId: string
    ): Promise<{ nodeData: AlfrescoNodeDetails }> {
      console.log('📄 Fetching node details:', { serverId, nodeId });
      return rpc<{ nodeData: AlfrescoNodeDetails }>('backend.repository.getNodeDetails', {
        serverId,
        nodeId,
      });
    },

    /**
     * Fetch slingshot children for a node without full metadata payload
     */
    async getSlingshotChildren(serverId: number, nodeId: string): Promise<{ children: any[] }> {
      console.log('🌲 Fetching slingshot children:', { serverId, nodeId });
      return rpc<{ children: any[] }>('backend.repository.getSlingshotChildren', {
        serverId,
        nodeId,
      });
    },

    /**
     * Load the /sys:system root children in a single RPC call
     */
    async getSystemTreeRoot(serverId: number): Promise<{
      systemNodeId: string;
      children: any[];
    }> {
      console.log('🌳 Fetching system tree root:', { serverId });
      return rpc<{ systemNodeId: string; children: any[] }>(
        'backend.repository.getSystemTreeRoot',
        { serverId }
      );
    },

    /**
     * Download content from slingshot API (supports property-specific content)
     */
    async getSlingshotContent(
      serverId: number,
      nodeId: string,
      property: string = 'cm:content'
    ): Promise<{ buffer: { type: 'Buffer'; data: number[] }; contentType: string }> {
      console.log('📥 Downloading content via slingshot:', { serverId, nodeId, property });
      return rpc<{ buffer: { type: 'Buffer'; data: number[] }; contentType: string }>(
        'backend.repository.getSlingshotContent',
        {
          serverId,
          nodeId,
          property,
        }
      );
    },
  },

  /**
   * Refresh local state cache
   * Call this after mutations to keep UI in sync
   */
  async refreshCache(): Promise<void> {
    console.log('🔄 Refreshing local cache...');
    // This could trigger a workspace reload or emit events for state management
    // For now, it's a placeholder that can be extended
  },

  /**
   * User operations
   */
  user: {
    /**
     * Get current user
     */
    async get(): Promise<{
      id: number;
      username: string;
      fullName: string | null;
      email: string | null;
      thumbnail: string | null;
    }> {
      return rpc<{
        id: number;
        username: string;
        fullName: string | null;
        email: string | null;
        thumbnail: string | null;
      }>('backend.user.get', {});
    },

    /**
     * Update user fullName
     */
    async updateFullName(fullName: string | null): Promise<{ success: boolean }> {
      return backendRpc.user.updateProfile({ fullName });
    },

    /**
     * Update user profile
     */
    async updateProfile(data: {
      fullName?: string | null;
      thumbnail?: string | null;
    }): Promise<{ success: boolean; thumbnail?: string | null }> {
      return rpc<{ success: boolean; thumbnail?: string | null }>('backend.user.update', data);
    },
  },

  /**
   * Alfresco specific operations
   */
  alfresco: {
    search: {
      /**
       * Get search dictionary (types, aspects, sites, properties)
       */
      async getDictionary(
        serverId: number,
        baseUrl: string
      ): Promise<{
        types: string[];
        aspects: string[];
        sites: string[];
        properties: string[];
      }> {
        return rpc<{
          types: string[];
          aspects: string[];
          sites: string[];
          properties: string[];
        }>('alfresco.search.getDictionary', { serverId, baseUrl });
      },

      async propertiesByPrefix(
        serverId: number,
        baseUrl: string,
        prefix: string
      ): Promise<string[]> {
        return rpc<string[]>('alfresco.search.propertiesByPrefix', { serverId, baseUrl, prefix });
      },
      async classesByPrefix(
        serverId: number,
        baseUrl: string,
        prefix: string
      ): Promise<{ types: string[]; aspects: string[]; containers?: string[] }> {
        return rpc<{ types: string[]; aspects: string[]; containers?: string[] }>(
          'alfresco.search.classesByPrefix',
          {
            serverId,
            baseUrl,
            prefix,
          }
        );
      },
      async searchPaths(
        serverId: number,
        baseUrl: string,
        query: string
      ): Promise<Array<{ path: string; qnamePath: string; name: string }>> {
        return rpc<Array<{ path: string; qnamePath: string; name: string }>>(
          'alfresco.search.searchPaths',
          {
            serverId,
            baseUrl,
            query,
          }
        );
      },

      async query(
        serverId: number,
        baseUrl: string,
        query: string,
        options?: { maxItems?: number; skipCount?: number }
      ): Promise<{
        items: Array<{
          id: string;
          isFolder?: boolean;
          isFile?: boolean;
          name: string;
          nodeRef: string;
          type: string;
          path: string;
          modifiedAt: string;
          modifier: string;
          createdAt: string;
          creator: string;
          parentId?: string;
          mimeType?: string;
          properties?: Record<string, unknown>;
        }>;
        pagination: {
          count?: number;
          hasMoreItems?: boolean;
          totalItems?: number;
          skipCount?: number;
          maxItems?: number;
        };
      }> {
        return rpc('alfresco.search.query', {
          serverId,
          baseUrl,
          query,
          ...options,
        });
      },
    },
  },
};

export interface SearchHistory {
  id: number;
  userId: number;
  searchId: number | null;
  query: string;
  resultsCount: number | null;
  executedAt: Date;
}

export type LocalFile = ContractsLocalFile;
export interface LocalFilesListResponse {
  items: LocalFile[];
  pagination: {
    totalItems: number;
    skipCount: number;
    maxItems: number;
    hasMoreItems: boolean;
  };
}

export interface SavedSearch {
  id: number;
  userId: number;
  serverId: number;
  name: string;
  query: string;
  columns: string | null;
  lastAccessed: Date | null;
  lastDiffCount: number;
  isDefault: boolean;
  createdAt: Date;
}

export interface AgentMention {
  id: string;
  type: 'node' | 'person' | 'group' | 'server';
  label: string;
  path?: string | null;
}

export interface AgentMentionSuggestion {
  id: string;
  type: 'node' | 'person' | 'group';
  label: string;
  path?: string | null;
  displayPath?: string | null;
  nodeType?: string | null;
  isContainer?: boolean;
  isFile?: boolean;
  mimeType?: string | null;
  title?: string | null;
  description?: string | null;
  subtitle?: string | null;
}

export interface AgentChatSummary {
  id: number;
  userId: number;
  serverId: number;
  title: string;
  chatIcon: string;
  hasActiveRun: boolean;
  hasWaitingConfirmation: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMessage {
  id: number;
  chatId: number;
  userId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mentions: AgentMention[];
  createdAt: Date;
}

export interface AgentRunStepSummary {
  id: number;
  runId: number;
  ordinal: number;
  operation: string;
  status: 'pending' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled';
  summary: string | null;
  requiresConfirmation: boolean;
  confirmationToken: string | null;
  confirmedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface AgentRunSummary {
  id: number;
  chatId: number;
  userId: number;
  serverId: number;
  triggerMessageId: number | null;
  status: 'queued' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled';
  manifestVersion: string;
  plan: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pendingStep: AgentRunStepSummary | null;
}

export interface AgentRunEvent {
  id: number;
  runId: number;
  stepId: number | null;
  type: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface RepositoryNode {
  id: string;
  name: string;
  isFolder: boolean;
  isFile: boolean;
  nodeType: string;
  mimeType?: string;
  description?: string;
  createdAt: string;
  modifiedAt: string;
  modifiedBy?: string;
  modifiedById?: string;
  hasChildren: boolean;
  path?: string;
}

export interface RepositoryBreadcrumbItem {
  id: string;
  name: string;
}

export interface RepositoryPaginationInfo {
  count: number;
  hasMoreItems: boolean;
  maxItems?: number;
  skipCount: number;
  totalItems?: number;
}

export type SiteVisibility = 'PUBLIC' | 'PRIVATE' | 'MODERATED';

export interface SiteEntry {
  id: string;
  guid?: string;
  title: string;
  description?: string;
  visibility?: SiteVisibility | string;
  preset?: string;
  role?: string;
}

export interface AlfrescoNodeDetails {
  nodeRef: string;
  qnamePath: {
    name: string;
    prefixedName: string;
  };
  name: {
    name: string;
    prefixedName: string;
  };
  parentNodeRef: string;
  type: {
    name: string;
    prefixedName: string;
  };
  id: string;
  aspects: Array<{
    name: string;
    prefixedName: string;
  }>;
  properties: Array<{
    name: {
      name: string;
      prefixedName: string;
    };
    values: Array<{
      dataType: string;
      value: any;
      isContent: boolean;
      isNodeRef: boolean;
      isNullValue: boolean;
    }>;
    type: {
      name: string;
      prefixedName: string;
    };
    multiple: boolean;
    residual: boolean;
  }>;
  children: Array<{
    name: {
      name: string;
      prefixedName: string;
    };
    nodeRef: string;
    type: {
      name: string;
      prefixedName: string;
    };
    assocType: {
      name: string;
      prefixedName: string;
    };
    primary: boolean;
    index: number;
  }>;
  parents: Array<{
    name: {
      name: string;
      prefixedName: string;
    };
    nodeRef: string;
    type: {
      name: string;
      prefixedName: string;
    };
    assocType: {
      name: string;
      prefixedName: string;
    };
    primary: boolean;
  }>;
  assocs: AlfrescoNodeAssociation[];
  sourceAssocs: AlfrescoNodeAssociation[];
  permissions: {
    entries: Array<{
      permission: string;
      authority: string;
      rel: string;
    }>;
    masks: Array<{
      permission: string;
      authority: string;
      rel: string;
    }>;
    inherit: boolean;
    owner: string;
  };
}

export interface AlfrescoNodeAssociation {
  type: {
    name: string;
    prefixedName: string;
  };
  sourceRef: string;
  targetRef: string;
  assocType: {
    name: string;
    prefixedName: string;
  };
}

/**
 * Helper to refresh workspace data and update local state
 * Useful after CRUD operations to keep UI in sync
 */
export async function refreshWorkspace(): Promise<ReturnType<typeof backendRpc.loadWorkspace>> {
  return backendRpc.loadWorkspace();
}
