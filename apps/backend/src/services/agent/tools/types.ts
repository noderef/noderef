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

import type { AgentToolSchema } from '../../../ai/anthropic.js';
import type { AgentExecutionContext } from '../types.js';

export type ToolResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export type ToolSkillRef = {
  kind: 'local_md';
  /** Relative to tools/ directory, or absolute filesystem path */
  path: string;
  version?: number;
};

/**
 * A self-contained tool definition.
 * Owns both its schema (shown to the LLM) and its executor (runs on the server).
 */
export interface ToolDefinition {
  /** Must match Anthropic tool name format: snake_case */
  name: string;
  /** Shown to the LLM — be precise and accurate */
  description: string;
  /** Long-form skill guidance for prompt-time tool usage */
  skill: ToolSkillRef;
  /** JSON Schema for the args — Anthropic validates this */
  inputSchema: AgentToolSchema['input_schema'];
  /** If true, the engine pauses before executing and asks the user to confirm */
  requiresConfirmation: boolean;
  confirmation?: { phrase: string };
  /** Execute the tool server-side */
  execute(ctx: AgentExecutionContext, args: Record<string, unknown>): Promise<ToolResult>;
}

/** Convert a ToolDefinition to the Anthropic tool schema format */
export function toAnthropicSchema(tool: ToolDefinition): AgentToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}
