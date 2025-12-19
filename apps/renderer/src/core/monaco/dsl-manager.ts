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
  lib: monaco.IDisposable;
}

const loadedDsls = new Map<number, LoadedDsl>();
const loadingServers = new Set<number>();
const lastLoadedContent = new Map<number, string>();

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
    if (loadingServers.has(serverId)) return;

    try {
      loadingServers.add(serverId);

      const response = await alfrescoRpc.getTernDefinitions({ serverId, baseUrl: String(baseUrl) });
      const definitions = response.typeDefinitions || [];

      if (definitions.length === 0) {
        this.unloadCustomDsl(serverId);
        lastLoadedContent.delete(serverId);
        return;
      }

      const tsContent = convertTernToTs(definitions);
      if (!tsContent.trim() || tsContent === lastLoadedContent.get(serverId)) {
        return;
      }

      // Clear existing DSL for this server if any
      this.unloadCustomDsl(serverId);

      const fileName = `ts:alfresco-custom-${serverId}.d.ts`;
      const lib = monaco.languages.typescript.javascriptDefaults.addExtraLib(tsContent, fileName);
      monaco.languages.typescript.typescriptDefaults.addExtraLib(tsContent, fileName);

      loadedDsls.set(serverId, { serverId, lib });
      lastLoadedContent.set(serverId, tsContent);
    } catch (error) {
      // Fail silent as per requirements, but log error for debugging
      console.error(`[DSL] Failed to load custom DSL for server ${serverId}:`, error);
    } finally {
      loadingServers.delete(serverId);
    }
  },

  /**
   * Unload custom DSL for a specific serverId
   * @param serverId The server ID to unload DSL for
   */
  unloadCustomDsl(serverId: number): void {
    const loaded = loadedDsls.get(serverId);
    if (loaded) {
      loaded.lib.dispose();
      loadedDsls.delete(serverId);
    }
  },

  /**
   * Unload all custom DSLs
   */
  unloadAll(): void {
    for (const serverId of loadedDsls.keys()) {
      this.unloadCustomDsl(serverId);
    }
  },
};
