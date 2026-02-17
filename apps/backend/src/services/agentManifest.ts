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

export const AGENT_MANIFEST_VERSION = '2026.02.16';

export interface AgentManifestOperation {
  name: string;
  aliases: string[];
  description: string;
  alwaysFirst?: boolean;
  destructive?: boolean;
  requiresConfirmation?: boolean;
}

export interface AgentManifestDocument {
  version: string;
  operations: AgentManifestOperation[];
}

export const agentManifest: AgentManifestDocument = {
  version: AGENT_MANIFEST_VERSION,
  operations: [
    {
      name: 'search',
      aliases: ['find'],
      description: 'Gather context by querying repository content and counting matching items.',
      alwaysFirst: true,
    },
    {
      name: 'move',
      aliases: [],
      description: 'Move one or more files/folders to another folder.',
    },
    {
      name: 'copy',
      aliases: [],
      description: 'Copy one or more files/folders to another folder.',
    },
    {
      name: 'delete',
      aliases: [],
      description: 'Delete one or more files/folders.',
      destructive: true,
      requiresConfirmation: true,
    },
    {
      name: 'executeScript',
      aliases: ['runScript'],
      description: 'Execute JavaScript Console script content described in the prompt.',
    },
  ],
};
