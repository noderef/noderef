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

/// <reference types="vite/client" />

// Neutralino global types
interface Window {
  Neutralino?: {
    extensions?: {
      getStats?: () => Promise<{ connected?: string[] }>;
      dispatch?: (extension: string, event: string, data?: unknown) => Promise<void>;
    };
  };
  NodeExtension?: unknown;
  NL_ARGS?: string[];
  NL_PATH?: string;
  NL_VERSION?: string;
  NL_PORT?: string;
  NL_TOKEN?: string;
}

// Vite env types
interface ImportMetaEnv {
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_ENABLE_NODE_EXTENSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite define constant for app version
declare const __APP_VERSION__: string;

// Monaco Editor internal module declarations
declare module 'monaco-editor/esm/vs/platform/commands/common/commands' {
  export interface ICommandHandler {
    (accessor: any, ...args: any[]): any;
  }

  export interface ICommand {
    id: string;
    handler: ICommandHandler;
  }

  export class CommandsRegistry {
    static getCommand(id: string): ICommand | undefined;
    static registerCommand(id: string, handler: ICommandHandler): { dispose: () => void };
  }
}

declare module 'monaco-editor/esm/vs/editor/browser/services/codeEditorService' {
  import * as monaco from 'monaco-editor';

  export interface ICodeEditorService {
    getFocusedCodeEditor(): monaco.editor.ICodeEditor | null;
  }

  export const ICodeEditorService: {
    (...args: any[]): ICodeEditorService;
  };
}
