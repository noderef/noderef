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
 * Monaco Editor setup and configuration
 */

import * as monaco from 'monaco-editor';
import alfrescoDsl from './alfresco-dsl.d.ts?raw';

// Import TypeScript/JavaScript language contribution for IntelliSense and language features
import 'monaco-editor/esm/vs/basic-languages/freemarker2/freemarker2.contribution';
import 'monaco-editor/esm/vs/language/css/monaco.contribution';
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';

// Configure Monaco Editor environment
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      // Use TypeScript worker for JS/TS language features (IntelliSense, syntax checking, etc.)
      return new Worker(new URL('../../workers/ts.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    if (label === 'json') {
      return new Worker(new URL('../../workers/json.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new Worker(new URL('../../workers/css.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new Worker(new URL('../../workers/html.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    // Use generic editor worker for other languages
    return new Worker(new URL('../../workers/editor.worker.ts', import.meta.url), {
      type: 'module',
    });
  },
};

let initialized = false;

/**
 * Initialize Monaco Editor
 */
export function initMonaco() {
  if (initialized) return;
  initialized = true;

  // Configure JavaScript defaults for IntelliSense and syntax checking
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    lib: ['es2020', 'esnext'], // Provide full ECMAScript globals while still excluding DOM types
    noLib: false,
  });

  // Set JavaScript diagnostics options
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monaco.languages.typescript.javascriptDefaults.addExtraLib(alfrescoDsl, 'ts:alfresco-dsl.d.ts');
  monaco.languages.typescript.typescriptDefaults.addExtraLib(alfrescoDsl, 'ts:alfresco-dsl.d.ts');

  // Configure TypeScript defaults
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    lib: ['es2020', 'esnext'], // Ensure base JS globals plus modern helpers, still without DOM
    noLib: false,
  });

  // Set TypeScript diagnostics options
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  // Register custom completion provider for JavaScript/TypeScript to add snippets for method calls
  monaco.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Get the text before the cursor to detect context (e.g., "search.")
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Check if we're completing after "search."
      const searchMatch = textUntilPosition.match(/search\.(\w*)$/);
      if (searchMatch) {
        const prefix = searchMatch[1];

        // Define snippets for search methods
        const searchSnippets: monaco.languages.CompletionItem[] = [
          {
            label: 'query',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'query({ query: "$1" })',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Execute a search query',
            detail:
              '(method) query(definition: { query: string; language?: string; page?: { maxItems?: number; skipCount?: number } })',
            range,
          },
          {
            label: 'queryResultSet',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'queryResultSet({ query: "$1" })',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Execute a search query and return result set with metadata',
            detail: '(method) queryResultSet(definition: Record<string, unknown>)',
            range,
          },
          {
            label: 'xpathSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'xpathSearch("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Search using XPath query',
            detail: '(method) xpathSearch(query: string): ScriptNode[]',
            range,
          },
          {
            label: 'luceneSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'luceneSearch("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Search using Lucene query',
            detail: '(method) luceneSearch(query: string): ScriptNode[]',
            range,
          },
          {
            label: 'findNode',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'findNode("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Find a node by reference',
            detail: '(method) findNode(reference: string): ScriptNode | null',
            range,
          },
          {
            label: 'selectNodes',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'selectNodes("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Select nodes using XPath query',
            detail: '(method) selectNodes(query: string): ScriptNode[]',
            range,
          },
          {
            label: 'savedSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'savedSearch("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Execute a saved search',
            detail: '(method) savedSearch(node: ScriptNode | string): ScriptNode[]',
            range,
          },
          {
            label: 'tagSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'tagSearch("$1", "$2")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Search by tag',
            detail: '(method) tagSearch(store: string, tag: string): ScriptNode[]',
            range,
          },
          {
            label: 'isValidXpathQuery',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'isValidXpathQuery("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Check if XPath query is valid',
            detail: '(method) isValidXpathQuery(query: string): boolean',
            range,
          },
        ];

        // Filter snippets based on prefix
        if (prefix) {
          const normalizedPrefix = prefix.toLowerCase();
          return {
            suggestions: searchSnippets.filter(item =>
              (typeof item.label === 'string' ? item.label : (item.label.label ?? ''))
                .toLowerCase()
                .startsWith(normalizedPrefix)
            ),
          };
        }

        return { suggestions: searchSnippets };
      }

      // Return empty suggestions to let default TypeScript provider handle it
      return { suggestions: [] };
    },
  });

  // Also register for TypeScript
  monaco.languages.registerCompletionItemProvider('typescript', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const searchMatch = textUntilPosition.match(/search\.(\w*)$/);
      if (searchMatch) {
        const prefix = searchMatch[1];

        const searchSnippets: monaco.languages.CompletionItem[] = [
          {
            label: 'query',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'query({ query: "$1" })',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Execute a search query',
            detail:
              '(method) query(definition: { query: string; language?: string; page?: { maxItems?: number; skipCount?: number } })',
            range,
          },
          {
            label: 'queryResultSet',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'queryResultSet({ query: "$1" })',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Execute a search query and return result set with metadata',
            detail: '(method) queryResultSet(definition: Record<string, unknown>)',
            range,
          },
          {
            label: 'xpathSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'xpathSearch("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Search using XPath query',
            detail: '(method) xpathSearch(query: string): ScriptNode[]',
            range,
          },
          {
            label: 'luceneSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'luceneSearch("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Search using Lucene query',
            detail: '(method) luceneSearch(query: string): ScriptNode[]',
            range,
          },
          {
            label: 'findNode',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'findNode("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Find a node by reference',
            detail: '(method) findNode(reference: string): ScriptNode | null',
            range,
          },
          {
            label: 'selectNodes',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'selectNodes("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Select nodes using XPath query',
            detail: '(method) selectNodes(query: string): ScriptNode[]',
            range,
          },
          {
            label: 'savedSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'savedSearch("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Execute a saved search',
            detail: '(method) savedSearch(node: ScriptNode | string): ScriptNode[]',
            range,
          },
          {
            label: 'tagSearch',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'tagSearch("$1", "$2")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Search by tag',
            detail: '(method) tagSearch(store: string, tag: string): ScriptNode[]',
            range,
          },
          {
            label: 'isValidXpathQuery',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'isValidXpathQuery("$1")',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Check if XPath query is valid',
            detail: '(method) isValidXpathQuery(query: string): boolean',
            range,
          },
        ];

        if (prefix) {
          const normalizedPrefix = prefix.toLowerCase();
          return {
            suggestions: searchSnippets.filter(item =>
              (typeof item.label === 'string' ? item.label : (item.label.label ?? ''))
                .toLowerCase()
                .startsWith(normalizedPrefix)
            ),
          };
        }

        return { suggestions: searchSnippets };
      }

      return { suggestions: [] };
    },
  });
}
