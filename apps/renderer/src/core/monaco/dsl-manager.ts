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

import * as monaco from 'monaco-editor';
import { alfrescoRpc } from '../ipc/alfresco';
import { convertTernToTs } from './tern-converter';

interface LoadedDsl {
  serverId: number;
  jsLib: monaco.IDisposable;
  tsLib: monaco.IDisposable;
}

const loadedDsls = new Map<number, LoadedDsl>();
const loadingServers = new Set<number>();
const serversWithoutDsl = new Set<number>(); // Track servers that don't have DSL

/**
 * Mark a server as having no DSL and unload any existing DSL for it
 */
function markServerWithoutDsl(serverId: number, reason: string): void {
  console.log(`[DSL] Server ${serverId} ${reason}`);
  serversWithoutDsl.add(serverId);
  dslManager.unloadCustomDsl(serverId);
}

/**
 * Manage Alfresco DSLs for Monaco Editor
 */
export const dslManager = {
  /**
   * Load custom DSL from Alfresco server for a specific serverId
   * @param serverId The server ID to load DSL for
   * @param baseUrl The base URL of the Alfresco server
   */
  async loadCustomDsl(serverId: number, baseUrl: number | string): Promise<void> {
    if (loadedDsls.has(serverId)) {
      serversWithoutDsl.delete(serverId);
      return;
    }

    if (loadingServers.has(serverId)) {
      return;
    }

    try {
      loadingServers.add(serverId);

      const response = await alfrescoRpc.getTernDefinitions({ serverId, baseUrl: String(baseUrl) });
      const definitions = response.typeDefinitions || [];

      if (definitions.length === 0) {
        markServerWithoutDsl(serverId, 'has no Tern definitions');
        return;
      }

      const tsContent = convertTernToTs(definitions);
      if (!tsContent.trim()) {
        markServerWithoutDsl(serverId, 'has no valid DSL content after conversion');
        return;
      }

      const fileName = `ts:alfresco-custom-${serverId}.d.ts`;
      const jsLib = monaco.languages.typescript.javascriptDefaults.addExtraLib(tsContent, fileName);
      const tsLib = monaco.languages.typescript.typescriptDefaults.addExtraLib(tsContent, fileName);

      loadedDsls.set(serverId, { serverId, jsLib, tsLib });
      serversWithoutDsl.delete(serverId);

      console.log(`[DSL] Loaded custom DSL for server ${serverId}`);
    } catch (error) {
      console.error(`[DSL] Failed to load custom DSL for server ${serverId}:`, error);
      markServerWithoutDsl(serverId, 'failed to load (API error)');
    } finally {
      loadingServers.delete(serverId);
    }
  },

  /**
   * Unload custom DSL for a specific serverId
   */
  unloadCustomDsl(serverId: number): void {
    const loaded = loadedDsls.get(serverId);
    if (loaded) {
      loaded.jsLib.dispose();
      loaded.tsLib.dispose();
      loadedDsls.delete(serverId);
      console.log(`[DSL] Unloaded custom DSL for server ${serverId}`);
    }
    serversWithoutDsl.delete(serverId);
  },

  /**
   * Unload all custom DSLs
   */
  unloadAll(): void {
    const serverIds = Array.from(loadedDsls.keys());
    if (serverIds.length > 0) {
      console.log(`[DSL] Unloading all DSLs (${serverIds.length} servers)`);
      serverIds.forEach(id => this.unloadCustomDsl(id));
    }
    serversWithoutDsl.clear();
  },

  /**
   * Get all loaded server IDs
   */
  getLoadedServerIds(): number[] {
    return Array.from(loadedDsls.keys());
  },

  /**
   * Check if a DSL is loaded for a specific serverId
   */
  isLoaded(serverId: number): boolean {
    return loadedDsls.has(serverId);
  },

  /**
   * Check if a server is known to not have DSL
   */
  hasNoDsl(serverId: number): boolean {
    return serversWithoutDsl.has(serverId);
  },
};
