/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { abortTextWriteSession } from './write_service.js';

export const textWriteAbortTool: ToolDefinition = {
  name: 'text_write_abort',
  description: 'Abort a buffered write session and stop further appends/commit for that session.',
  skill: { kind: 'local_md', path: '../skills/text_write_abort.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Write session ID.' },
      deleteBufferedContent: {
        type: 'boolean',
        description: 'If true (default), remove buffered text content from disk.',
      },
    },
    required: ['sessionId'],
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const record = await abortTextWriteSession(args);
      return {
        ok: true,
        data: {
          sessionId: record.state.sessionId,
          status: record.state.status,
          chunks: record.state.chunks,
          updatedAt: record.state.updatedAt,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
