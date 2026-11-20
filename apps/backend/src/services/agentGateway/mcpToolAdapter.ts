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

import type { McpToolSummary } from '@app/contracts';
import type { AgentToolSchema } from '../../ai/anthropic.js';
import type { ToolDefinition, ToolResult } from '../agent/tools/types.js';
import { CALL_TIMEOUT_MS } from '../agent/callTimeout.js';
import type { McpSessionManager, SessionConnectParams } from './McpSessionManager.js';
import { policyLabel, resolveMcpToolPolicy } from './mcpPolicy.js';
import { normalizeMcpToolResult } from './mcpResultNormalizer.js';
import { MAX_TOOL_DESCRIPTION_CHARS } from './types.js';

function withTimeoutSignal(
  parent: AbortSignal | undefined,
  ms: number
): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([controller.signal, parent]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal,
    cancel: () => clearTimeout(timer),
  };
}

export function toMcpToolDefinition(
  tool: McpToolSummary,
  sessions: McpSessionManager,
  connect: SessionConnectParams
): ToolDefinition {
  const policy = resolveMcpToolPolicy(tool.annotations);
  const description = [
    '[Agent Gateway]',
    policyLabel(policy.policy),
    tool.description || tool.title || tool.name,
  ]
    .filter(Boolean)
    .join(' — ')
    .slice(0, MAX_TOOL_DESCRIPTION_CHARS);

  const inputSchema = tool.inputSchema as AgentToolSchema['input_schema'];

  return {
    name: tool.modelName,
    description,
    skill: { kind: 'mcp' },
    inputSchema,
    requiresConfirmation: policy.requiresConfirmation,
    allowAutoApprove: policy.allowAutoApprove,
    execute: async (ctx, args): Promise<ToolResult> => {
      const timeout = withTimeoutSignal(ctx.signal, CALL_TIMEOUT_MS);
      try {
        const result = await sessions.callTool(connect, tool.name, args, {
          signal: timeout.signal,
          timeout: CALL_TIMEOUT_MS,
        });
        return normalizeMcpToolResult(tool.name, result);
      } catch (error) {
        if (ctx.signal.aborted || timeout.signal.aborted) {
          return { ok: false, error: 'Agent Gateway tool call was cancelled' };
        }
        const message = error instanceof Error ? error.message : 'Agent Gateway tool call failed';
        return { ok: false, error: message };
      } finally {
        timeout.cancel();
      }
    },
  };
}
