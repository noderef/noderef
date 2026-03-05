/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import type { AgentExecutionContext } from '../../types.js';
import { toNodeSummary } from '../helpers/nodeResultHelpers.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import {
  buildWriteApiTrace,
  commitTextWriteSession,
} from './write_service.js';

export const textWriteCommitTool: ToolDefinition = {
  name: 'text_write_commit',
  description:
    'Finalize a buffered text write session and write content to Alfresco. Call after all text_write_append chunks are uploaded.',
  skill: { kind: 'local_md', path: '../skills/text_write_commit.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Write session ID.' },
      expectedChunks: {
        type: 'number',
        description: 'Optional expected chunk count guard.',
      },
      expectedBytes: {
        type: 'number',
        description: 'Optional expected byte count guard.',
      },
      finalHash: {
        type: 'string',
        description: 'Optional sha256 hash (hex) of the full buffered text.',
      },
      majorVersion: {
        type: 'boolean',
        description: 'Optional override for versioning behavior at commit.',
      },
      comment: {
        type: 'string',
        description: 'Optional override version comment at commit.',
      },
      renameOnCommit: {
        type: 'string',
        description: 'Optional override target name to apply during commit.',
      },
      keepSession: {
        type: 'boolean',
        description: 'If true, keep buffered content file after commit.',
      },
    },
    required: ['sessionId'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { record, writeResult, contentHash } = await commitTextWriteSession(ctx, args);
      const entry = writeResult.finalEntry;
      const nodeSummary = toNodeSummary(entry);
      return {
        ok: true,
        data: {
          apiTrace: buildWriteApiTrace({ writeResult }),
          ...(writeResult.createdNew ? { created: nodeSummary } : { updated: nodeSummary }),
          write: {
            sessionId: record.state.sessionId,
            status: record.state.status,
            chunksReceived: record.state.chunks.received,
            totalBytes: record.state.chunks.totalBytes,
            contentHash,
          },
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
