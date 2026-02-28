/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

import axios from 'axios';
import { buildAlfrescoUrl } from '../../../lib/alfresco-url.js';
import { AppErrors } from '../../../lib/errors.js';
import type { AgentExecutionContext } from '../types.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const executScriptTool: ToolDefinition = {
  name: 'execute_script',
  description:
    'Execute a JavaScript Console script on the Alfresco server. Use when no other tool can accomplish the task. Requires explicit user confirmation.',
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

      let authHeader: Record<string, string>;
      if (ctx.authType === 'openid_connect') {
        if (!ctx.token) throw AppErrors.unauthorized('No OAuth2 access token');
        authHeader = { Authorization: `Bearer ${ctx.token}` };
      } else {
        if (!ctx.username || !ctx.token) throw AppErrors.unauthorized('No credentials available');
        authHeader = {
          Authorization: `Basic ${Buffer.from(`${ctx.username}:${ctx.token}`).toString('base64')}`,
        };
      }

      const response = await axios.post(
        executeUrl,
        {
          script,
          template: '',
          spaceNodeRef: '',
          transaction: 'readwrite',
          runas: ctx.username ?? '',
          urlargs: '',
          documentNodeRef: '',
          resultChannel,
        },
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
