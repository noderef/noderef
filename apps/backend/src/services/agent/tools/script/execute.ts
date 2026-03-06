/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import axios from 'axios';
import { buildAlfrescoUrl } from '../../../../lib/alfresco-url.js';
import type { AgentExecutionContext } from '../../types.js';
import { buildAuthHeader } from '../helpers/authHeaders.js';
import type { ToolDefinition, ToolResult } from '../types.js';

export const scriptExecuteTool: ToolDefinition = {
  name: 'script_execute',
  description:
    'Execute a JavaScript Console script on the server. Use only when standard repository tools cannot complete the task.',
  skill: { kind: 'local_md', path: '../skills/script_execute.md', version: 1 },
  inputSchema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'JavaScript code to execute on the Alfresco server' },
    },
    required: ['script'],
  },
  requiresConfirmation: true,
  confirmation: { phrase: 'CONFIRM' },

  async execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (!ctx.jsconsoleEndpoint) {
        return { ok: false, error: 'JavaScript Console is not configured for this server' };
      }
      const script = typeof args.script === 'string' ? args.script.trim() : '';
      if (!script) return { ok: false, error: 'script is required' };

      const resultChannel = `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const executeUrl = buildAlfrescoUrl(
        ctx.serverBaseUrl,
        `/service/${ctx.jsconsoleEndpoint.replace(/^\/+/, '')}/execute`
      );
      const executePath = `/service/${ctx.jsconsoleEndpoint.replace(/^\/+/, '')}/execute`;

      const authHeader = buildAuthHeader(ctx);

      const requestBody = {
        script,
        template: '',
        spaceNodeRef: '',
        transaction: 'readwrite',
        runas: ctx.username ?? '',
        urlargs: '',
        documentNodeRef: '',
        resultChannel,
      };

      const response = await axios.post(
        executeUrl,
        requestBody,
        {
          headers: { 'Content-Type': 'application/json', ...authHeader },
          validateStatus: s => s < 600,
        }
      );

      const data = response.data;
      const printOutput = Array.isArray(data?.printOutput)
        ? data.printOutput
            .map((l: unknown) => (typeof l === 'string' ? l : JSON.stringify(l)))
            .slice(0, 200)
        : [];

      return {
        ok: true,
        data: {
          apiTrace: {
            method: 'POST',
            path: executePath,
            request: { body: requestBody },
            responseBody: response.data,
          },
          status: response.status,
          output: printOutput,
          error: data?.error ?? data?.message ?? null,
          scriptPreview: script.slice(0, 200),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
