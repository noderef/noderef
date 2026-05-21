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

import { NodesApi, type AlfrescoApi } from '@alfresco/js-api';
import type { PrismaClient } from '@prisma/client';
import { mergeStaticAndRepositoryLibs, repositoryLibsToLoadedLibs } from '../ai/mergeLibs.js';
import {
  MAX_REPOSITORY_LIBS_TOTAL_CHARS,
  parseRepositoryJsLib,
} from '../ai/parseRepositoryJsLib.js';
import { loadStaticLibs } from '../ai/loadLibs.js';
import type { LoadedLibs } from '../ai/types/manifest.js';
import { log } from '../lib/logger.js';
import { getAuthenticatedClientWithRefresh } from './alfresco/authenticationHelper.js';
import type { ServerService } from './serverService.js';

/**
 * Folder path (under Company Home) that contains custom JS libs. Alfresco's
 * `-root-` alias resolves directly to Company Home, so the first segment below
 * is a direct child of Company Home.
 */
const PATH_SEGMENTS = ['Data Dictionary', 'NodeRef', 'js-libs'] as const;
const MAX_FOLDER_DEPTH = 5;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const EMPTY_REPO_LIBS: LoadedLibs = { manifest: {}, libs: {} };

export type WarmStatus = 'queued' | 'fresh' | 'refreshing';

export interface RefreshResult {
  ok: boolean;
  libCount: number;
  error?: string;
}

interface CacheEntry {
  snapshot: LoadedLibs;
  loadedAt: number;
  jsLibsFolderId?: string;
  refreshing?: Promise<RefreshResult>;
  lastError?: string;
}

export class RepositoryJsLibService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly serverService: ServerService,
    options?: { ttlMs?: number }
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  async getSnapshot(userId: number, serverId: number): Promise<LoadedLibs> {
    const key = cacheKey(userId, serverId);
    const entry = this.cache.get(key);
    const now = Date.now();

    // Fresh cache — return immediately
    if (entry && now - entry.loadedAt < this.ttlMs) {
      return entry.snapshot;
    }

    // Stale cache with data — serve stale, refresh in background
    if (entry?.snapshot && Object.keys(entry.snapshot.manifest).length > 0) {
      this.scheduleBackgroundRefresh(userId, serverId, key, entry);
      return entry.snapshot;
    }

    // Stale cache without data — also refresh in background, serve what we have
    if (entry) {
      this.scheduleBackgroundRefresh(userId, serverId, key, entry);
      return entry.snapshot;
    }

    // Cold cache — await the first load so the caller gets real data
    await this.refresh(userId, serverId);
    const loaded = this.cache.get(key);
    return loaded?.snapshot ?? EMPTY_REPO_LIBS;
  }

  async loadMergedLibs(userId: number, serverId?: number | null): Promise<LoadedLibs> {
    const staticLibs = loadStaticLibs();
    if (serverId == null) {
      return staticLibs;
    }

    const repoLibs = await this.getSnapshot(userId, serverId);
    return mergeStaticAndRepositoryLibs(staticLibs, repoLibs);
  }

  async warm(userId: number, serverId: number): Promise<{ status: WarmStatus }> {
    const key = cacheKey(userId, serverId);
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry?.refreshing) {
      return { status: 'refreshing' };
    }

    if (entry && now - entry.loadedAt < this.ttlMs) {
      return { status: 'fresh' };
    }

    this.scheduleBackgroundRefresh(userId, serverId, key, entry);
    return { status: 'queued' };
  }

  async refresh(userId: number, serverId: number): Promise<RefreshResult> {
    const key = cacheKey(userId, serverId);
    const existing = this.cache.get(key);

    if (existing?.refreshing) {
      return existing.refreshing;
    }

    const refreshPromise = this.performRefresh(userId, serverId, key, existing);
    if (existing) {
      existing.refreshing = refreshPromise;
    } else {
      this.cache.set(key, {
        snapshot: EMPTY_REPO_LIBS,
        loadedAt: 0,
        refreshing: refreshPromise,
      });
    }

    try {
      return await refreshPromise;
    } finally {
      const entry = this.cache.get(key);
      if (entry) {
        delete entry.refreshing;
      }
    }
  }

  private scheduleBackgroundRefresh(
    userId: number,
    serverId: number,
    key: string,
    entry?: CacheEntry
  ): void {
    const current = entry ?? this.cache.get(key);
    if (current?.refreshing) {
      return;
    }

    void this.refresh(userId, serverId).catch(err => {
      log.warn({ err, userId, serverId }, 'Background repository JS lib refresh failed');
    });
  }

  private async performRefresh(
    userId: number,
    serverId: number,
    key: string,
    existing?: CacheEntry
  ): Promise<RefreshResult> {
    try {
      const server = await this.serverService.findById(userId, serverId);
      if (!server) {
        log.warn({ userId, serverId }, 'Repository JS lib refresh: server not found');
        return this.recordRefreshFailure(key, existing, 'Server not found');
      }

      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        server.baseUrl,
        this.prisma
      );
      if (!api) {
        log.warn(
          { userId, serverId, baseUrl: server.baseUrl },
          'Repository JS lib refresh: authentication failed'
        );
        return this.recordRefreshFailure(key, existing, 'Authentication failed');
      }

      const { snapshot, jsLibsFolderId } = await fetchRepositoryLibs(api);
      this.cache.set(key, {
        snapshot,
        loadedAt: Date.now(),
        jsLibsFolderId,
      });

      const manifestKeys = Object.keys(snapshot.manifest);
      log.info(
        {
          userId,
          serverId,
          baseUrl: server.baseUrl,
          jsLibsFolderId: jsLibsFolderId ?? null,
          libCount: manifestKeys.length,
          libNames: manifestKeys,
        },
        jsLibsFolderId
          ? 'Repository JS libs refreshed from Alfresco'
          : 'Repository JS libs refresh: Alfresco folder "Data Dictionary/NodeRef/js-libs" not found'
      );

      return { ok: true, libCount: manifestKeys.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err, userId, serverId }, 'Repository JS lib refresh failed');
      return this.recordRefreshFailure(key, existing, message);
    }
  }

  private recordRefreshFailure(
    key: string,
    existing: CacheEntry | undefined,
    error: string
  ): RefreshResult {
    if (existing) {
      existing.lastError = error;
      if (existing.snapshot && Object.keys(existing.snapshot.manifest).length > 0) {
        this.cache.set(key, {
          ...existing,
          loadedAt: existing.loadedAt,
        });
        return {
          ok: false,
          libCount: Object.keys(existing.snapshot.manifest).length,
          error,
        };
      }
    }

    this.cache.set(key, {
      snapshot: EMPTY_REPO_LIBS,
      loadedAt: Date.now(),
      lastError: error,
    });

    return { ok: false, libCount: 0, error };
  }
}

interface JsFileNode {
  id: string;
  name: string;
  modifiedAt?: Date | string;
}

async function fetchRepositoryLibs(
  api: AlfrescoApi
): Promise<{ snapshot: LoadedLibs; jsLibsFolderId?: string }> {
  const nodesApi = new NodesApi(api);
  const jsLibsFolderId = await resolveJsLibsFolderId(nodesApi);

  if (!jsLibsFolderId) {
    return { snapshot: EMPTY_REPO_LIBS };
  }

  const jsEntries = await collectJsFilesRecursively(nodesApi, jsLibsFolderId);
  log.debug(
    {
      jsLibsFolderId,
      jsFileCount: jsEntries.length,
      jsFileNames: jsEntries.map(e => e.name),
    },
    'Alfresco js-libs recursive listing'
  );

  const parsedEntries = await parseRepositoryEntries(nodesApi, jsEntries, jsLibsFolderId);
  return {
    snapshot: repositoryLibsToLoadedLibs(parsedEntries),
    jsLibsFolderId,
  };
}

type ParsedRepositoryEntry = {
  name: string;
  description: string;
  tags: string[];
  text: string;
};

async function parseRepositoryEntries(
  nodesApi: NodesApi,
  jsEntries: ReadonlyArray<JsFileNode>,
  jsLibsFolderId: string
): Promise<ParsedRepositoryEntry[]> {
  const parsedEntries: ParsedRepositoryEntry[] = [];
  let totalChars = 0;

  for (const node of jsEntries) {
    try {
      const content = await readNodeContent(nodesApi, node.id);
      const parsed = parseRepositoryJsLib({
        fileName: node.name,
        content,
        nodeId: node.id,
        modifiedAt: toIsoString(node.modifiedAt),
      });
      if (!parsed) {
        continue;
      }

      if (totalChars + parsed.text.length > MAX_REPOSITORY_LIBS_TOTAL_CHARS) {
        log.warn(
          { folderId: jsLibsFolderId },
          'Repository JS lib total prompt budget exceeded; skipping remaining files'
        );
        break;
      }

      totalChars += parsed.text.length;
      parsedEntries.push({
        name: parsed.name,
        description: parsed.description,
        tags: parsed.tags,
        text: parsed.text,
      });
    } catch (err) {
      log.warn(
        { err, nodeId: node.id, fileName: node.name },
        'Failed to read repository JS lib file'
      );
    }
  }

  return parsedEntries;
}

function toIsoString(value: Date | string | undefined): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

async function resolveJsLibsFolderId(nodesApi: NodesApi): Promise<string | null> {
  let currentId = '-root-';
  for (const segment of PATH_SEGMENTS) {
    const result = await nodesApi.listNodeChildren(currentId, {
      fields: ['id', 'name', 'nodeType', 'isFolder'],
      maxItems: 200,
    });
    const match = result.list?.entries?.find(entry => entry.entry?.name === segment);
    if (!match?.entry?.id) {
      log.debug(
        {
          parentNodeId: currentId,
          missingSegment: segment,
          availableChildren: result.list?.entries?.map(e => e.entry?.name).filter(Boolean),
        },
        `js-libs path resolution failed at segment "${segment}"`
      );
      return null;
    }
    currentId = match.entry.id;
  }
  return currentId;
}

async function collectJsFilesRecursively(
  nodesApi: NodesApi,
  rootFolderId: string
): Promise<JsFileNode[]> {
  const collected: JsFileNode[] = [];
  const visited = new Set<string>();

  async function walk(folderId: string, depth: number): Promise<void> {
    if (depth > MAX_FOLDER_DEPTH || visited.has(folderId)) {
      return;
    }
    visited.add(folderId);

    let skipCount = 0;
    while (true) {
      const result = await nodesApi.listNodeChildren(folderId, {
        include: ['properties'],
        fields: ['id', 'name', 'nodeType', 'isFolder', 'isFile', 'modifiedAt'],
        maxItems: 200,
        skipCount,
      });
      const entries = result.list?.entries ?? [];
      for (const entry of entries) {
        const node = entry.entry;
        if (!node?.id || !node.name) {
          continue;
        }
        if (node.isFolder) {
          await walk(node.id, depth + 1);
          continue;
        }
        if (node.name.toLowerCase().endsWith('.js')) {
          collected.push({
            id: node.id,
            name: node.name,
            modifiedAt: node.modifiedAt,
          });
        }
      }
      const pagination = result.list?.pagination;
      if (!pagination?.hasMoreItems) {
        break;
      }
      skipCount += entries.length;
    }
  }

  await walk(rootFolderId, 0);
  return collected;
}

async function readNodeContent(nodesApi: NodesApi, nodeId: string): Promise<string> {
  const content = await nodesApi.getNodeContent(nodeId);
  if (content instanceof Blob) {
    return content.text();
  }
  if (typeof content === 'string') {
    return content;
  }
  return String(content);
}

function cacheKey(userId: number, serverId: number): string {
  return `${userId}:${serverId}`;
}

let sharedInstance: RepositoryJsLibService | null = null;

export function initRepositoryJsLibService(
  prisma: PrismaClient,
  serverService: ServerService,
  options?: { ttlMs?: number }
): RepositoryJsLibService {
  sharedInstance = new RepositoryJsLibService(prisma, serverService, options);
  return sharedInstance;
}

export function getRepositoryJsLibService(): RepositoryJsLibService | null {
  return sharedInstance;
}
