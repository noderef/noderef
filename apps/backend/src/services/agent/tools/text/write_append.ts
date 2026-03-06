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

import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { appendTextWriteSession } from './write_service.js';

export const textWriteAppendTool: ToolDefinition = {
  name: 'text_write_append',
  description:
    'Append one text chunk to an active buffered write session. Use repeated calls for large payloads.',
  skill: { kind: 'local_md', path: '../skills/text_write_append.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Write session ID from text_write_begin.' },
      chunk: { type: 'string', description: 'Text chunk to append.' },
      seq: {
        type: 'number',
        description:
          'Optional chunk sequence number. Must match the expected next sequence when provided.',
      },
      chunkHash: {
        type: 'string',
        description: 'Optional sha256 hash (hex) of the chunk for integrity checks.',
      },
    },
    required: ['sessionId', 'chunk'],
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const record = await appendTextWriteSession(args);
      return {
        ok: true,
        data: {
          sessionId: record.state.sessionId,
          status: record.state.status,
          chunks: record.state.chunks,
          expiresAt: record.state.expiresAt,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
