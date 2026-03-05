/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AgentExecutionContext } from '../../types.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { beginTextWriteSession } from './write_service.js';

const toSessionSummary = (record: Awaited<ReturnType<typeof beginTextWriteSession>>['record']) => ({
  sessionId: record.state.sessionId,
  status: record.state.status,
  createdAt: record.state.createdAt,
  updatedAt: record.state.updatedAt,
  expiresAt: record.state.expiresAt,
  target: record.state.target,
  options: record.state.options,
  chunks: record.state.chunks,
});

export const textWriteBeginTool: ToolDefinition = {
  name: 'text_write_begin',
  description:
    'Start a buffered session for writing large text safely in chunks. Target an existing file with nodeId or create a new file with parentId + fileName at commit.',
  skill: { kind: 'local_md', path: '../skills/text_write_begin.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Existing target file node ID to update.' },
      parentId: { type: 'string', description: 'Target parent folder ID (required when nodeId is not set).' },
      fileName: {
        type: 'string',
        description: 'Target file name (required when nodeId is not set).',
      },
      mimeType: { type: 'string', description: 'Optional mime type metadata for the session.' },
      encoding: { type: 'string', description: 'Optional text encoding label. Default utf-8.' },
      maxChunkBytes: {
        type: 'number',
        description: 'Maximum bytes accepted per append call (default 32768, max 262144).',
      },
      ttlMinutes: {
        type: 'number',
        description: 'Session expiration in minutes (default 120, min 5, max 1440).',
      },
      autoRename: {
        type: 'boolean',
        description: 'When creating a new file, auto-rename on collisions. Default true.',
      },
      majorVersion: {
        type: 'boolean',
        description: 'Optional default majorVersion to use at commit.',
      },
      comment: {
        type: 'string',
        description: 'Optional default version comment to use at commit.',
      },
      renameOnCommit: {
        type: 'string',
        description: 'Optional target name to apply at commit on content update.',
      },
    },
  },
  requiresConfirmation: false,

  async execute(_ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { record, cleanupRemoved } = await beginTextWriteSession(args);
      return {
        ok: true,
        data: {
          session: toSessionSummary(record),
          cleanupRemoved,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
