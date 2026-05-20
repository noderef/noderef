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
import {
  mergeStaticAndRepositoryLibs,
  repositoryLibsToLoadedLibs,
} from '../ai/repositoryJsLib/mergeLibs.js';
import {
  MAX_REPOSITORY_LIBS_TOTAL_CHARS,
  parseRepositoryJsLib,
} from '../ai/repositoryJsLib/parseRepositoryJsLib.js';
import { loadStaticLibs } from '../ai/loadLibs.js';
import type { LoadedLibs } from '../ai/types/manifest.js';
import { log } from '../lib/logger.js';
import { getAuthenticatedClientWithRefresh } from './alfresco/authenticationHelper.js';
import type { ServerService } from './serverService.js';

const PATH_SEGMENTS = ['Company Home', 'Data Dictionary', 'NodeRef', 'js-libs'] as const;
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

    if (entry && now - entry.loadedAt < this.ttlMs) {
      return entry.snapshot;
    }

    if (entry?.snapshot && Object.keys(entry.snapshot.manifest).length > 0) {
      this.scheduleBackgroundRefresh(userId, serverId, key, entry);
      return entry.snapshot;
    }

    if (entry) {
      this.scheduleBackgroundRefresh(userId, serverId, key, entry);
      return entry.snapshot;
    }

    this.scheduleBackgroundRefresh(userId, serverId, key);
    return EMPTY_REPO_LIBS;
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
        return this.recordRefreshFailure(key, existing, 'Server not found');
      }

      const api = await getAuthenticatedClientWithRefresh(
        userId,
        serverId,
        server.baseUrl,
        this.prisma
      );
      if (!api) {
        return this.recordRefreshFailure(key, existing, 'Authentication failed');
      }

      const { snapshot, jsLibsFolderId } = await fetchRepositoryLibs(api);
      this.cache.set(key, {
        snapshot,
        loadedAt: Date.now(),
        jsLibsFolderId,
      });

      return { ok: true, libCount: Object.keys(snapshot.manifest).length };
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

async function fetchRepositoryLibs(
  api: AlfrescoApi
): Promise<{ snapshot: LoadedLibs; jsLibsFolderId?: string }> {
  const nodesApi = new NodesApi(api);
  const jsLibsFolderId = await resolveJsLibsFolderId(nodesApi);

  if (!jsLibsFolderId) {
    return { snapshot: EMPTY_REPO_LIBS };
  }

  const listResult = await nodesApi.listNodeChildren(jsLibsFolderId, {
    include: ['properties'],
    fields: ['id', 'name', 'nodeType', 'modifiedAt'],
    maxItems: 200,
  });

  const jsEntries =
    listResult.list?.entries?.filter(entry => {
      const name = entry.entry?.name ?? '';
      return name.toLowerCase().endsWith('.js');
    }) ?? [];

  const parsedEntries: Array<{
    name: string;
    description: string;
    tags: string[];
    text: string;
  }> = [];
  let totalChars = 0;

  for (const entry of jsEntries) {
    const node = entry.entry;
    if (!node?.id || !node.name) {
      continue;
    }

    try {
      const content = await readNodeContent(nodesApi, node.id);
      const parsed = parseRepositoryJsLib({
        fileName: node.name,
        content,
        nodeId: node.id,
        modifiedAt:
          node.modifiedAt instanceof Date
            ? node.modifiedAt.toISOString()
            : typeof node.modifiedAt === 'string'
              ? node.modifiedAt
              : undefined,
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

  return {
    snapshot: repositoryLibsToLoadedLibs(parsedEntries),
    jsLibsFolderId,
  };
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
      return null;
    }
    currentId = match.entry.id;
  }

  return currentId;
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
