/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { statusTextWriteSession } from './write_service.js';

export const textWriteStatusTool: ToolDefinition = {
  name: 'text_write_status',
  description: 'Get status and progress for a buffered text write session.',
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
