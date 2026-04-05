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

import { rpc } from '@/core/ipc/rpc';
import * as monaco from 'monaco-editor';
import { convertToTypeScriptDeclarations, parseImportTags } from './import-parser';

/**
 * Manages loading and resolving imported scripts for Monaco Editor IntelliSense
 */
class ImportResolver {
  private loadedImports = new Map<string, monaco.IDisposable>();
  private serverId: number | null = null;
  private isResolving = false;

  /**
   * Get the current server ID
   */
  getServerId(): number | null {
    return this.serverId;
  }

  /**
   * Set the active server ID
   */
  setServerId(serverId: number | null): void {
    if (this.serverId !== serverId) {
      this.serverId = serverId;
      // Clear previously loaded imports when server changes
      this.clearAllImports();
    }
  }

  /**
   * Resolve and load imported scripts from code
   * @param code The JavaScript code containing <import> tags
   */
  async resolveImports(code: string): Promise<void> {
    if (this.isResolving) {
      // Prevent concurrent resolution attempts
      return;
    }

    if (!this.serverId) {
      console.warn('[ImportResolver] No server ID set, skipping import resolution');
      return;
    }

    this.isResolving = true;

    try {
      const imports = parseImportTags(code);

      if (imports.length === 0) {
        // No imports found, clear all previous imports
        this.clearAllImports();
        return;
      }

      // Keep track of current imports to remove stale ones
      const currentImportKeys = new Set<string>();

      // Resolve imports via backend RPC
      const response = await rpc<{
        results: Array<{
          resource: string;
          content: string | null;
          error?: string;
        }>;
      }>('backend.jsconsole.resolveImportedScripts', {
        serverId: this.serverId,
        imports: imports.map(imp => ({
          resource: imp.resource,
          type: imp.type,
        })),
      });

      // Process each resolved import
      for (const result of response.results) {
        const importKey = this.getImportKey(result.resource);
        currentImportKeys.add(importKey);

        if (result.error) {
          console.warn(`[ImportResolver] Failed to load ${result.resource}:`, result.error);
          // Remove any previously loaded definition for this import
          this.removeImport(importKey);
          continue;
        }

        if (!result.content) {
          continue;
        }

        // Convert the imported script to TypeScript declarations
        const declarations = convertToTypeScriptDeclarations(result.content, result.resource);

        // Add to Monaco's extra libs
        this.addImport(importKey, declarations);
      }

      // Remove any imports that are no longer in the code
      for (const [key] of this.loadedImports) {
        if (!currentImportKeys.has(key)) {
          this.removeImport(key);
        }
      }
    } catch (error) {
      console.error('[ImportResolver] Failed to resolve imports:', error);
    } finally {
      this.isResolving = false;
    }
  }

  /**
   * Add an import's declarations to Monaco
   */
  private addImport(importKey: string, declarations: string): void {
    // Remove existing import if present
    this.removeImport(importKey);

    // Add as extra library to both JavaScript and TypeScript
    const fileName = `ts:alfresco-import-${importKey}.d.ts`;
    const jsLib = monaco.languages.typescript.javascriptDefaults.addExtraLib(
      declarations,
      fileName
    );
    const tsLib = monaco.languages.typescript.typescriptDefaults.addExtraLib(
      declarations,
      fileName
    );

    // Store disposables so we can clean up later
    this.loadedImports.set(importKey, {
      dispose: () => {
        jsLib.dispose();
        tsLib.dispose();
      },
    });
  }

  /**
   * Remove an import's declarations from Monaco
   */
  private removeImport(importKey: string): void {
    const existing = this.loadedImports.get(importKey);
    if (existing) {
      existing.dispose();
      this.loadedImports.delete(importKey);
    }
  }

  /**
   * Clear all loaded imports
   */
  clearAllImports(): void {
    for (const disposable of this.loadedImports.values()) {
      disposable.dispose();
    }
    this.loadedImports.clear();
  }

  /**
   * Generate a unique key for an import resource
   */
  private getImportKey(resource: string): string {
    // Normalize the resource string to create a stable key
    return resource
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAllImports();
    this.serverId = null;
  }
}

// Export a singleton instance
export const importResolver = new ImportResolver();
