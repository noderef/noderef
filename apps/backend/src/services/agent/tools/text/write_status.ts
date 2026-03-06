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
import { statusTextWriteSession } from './write_service.js';

export const textWriteStatusTool: ToolDefinition = {
  name: 'text_write_status',
  description: 'Read state and progress details for a buffered text write session.',
  skill: { kind: 'local_md', path: '../skills/text_write_status.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Write session ID.' },
    },
    required: ['sessionId'],
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const record = await statusTextWriteSession(args);
      return {
        ok: true,
        data: {
          session: {
            sessionId: record.state.sessionId,
            status: record.state.status,
            createdAt: record.state.createdAt,
            updatedAt: record.state.updatedAt,
            expiresAt: record.state.expiresAt,
            target: record.state.target,
            options: record.state.options,
            chunks: record.state.chunks,
            result: record.state.result,
          },
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
