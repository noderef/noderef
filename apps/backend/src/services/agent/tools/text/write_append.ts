/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { appendTextWriteSession } from './write_service.js';

export const textWriteAppendTool: ToolDefinition = {
  name: 'text_write_append',
  description:
    'Append one text chunk to a buffered write session. Use sequential chunks to upload very large text safely.',
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
