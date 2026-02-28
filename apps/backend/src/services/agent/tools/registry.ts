/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 *
 * Central tool registry.
 * To add a new tool: create tools/myTool.ts implementing ToolDefinition, then add it here.
 */

import type { AgentToolSchema } from '../../../ai/anthropic.js';
import { copyTool } from './copy.js';
import { deleteTool } from './delete.js';
import { getChildrenTool } from './getChildren.js';
import { getNodeTool } from './getNode.js';
import { moveTool } from './move.js';
import { executScriptTool } from './script.js';
import { searchTool } from './search.js';
import type { ToolDefinition } from './types.js';
import { toAnthropicSchema } from './types.js';

export type { ToolDefinition };

/** All tools available to the agent, in the order they are presented to the LLM */
export const ALL_TOOLS: ToolDefinition[] = [
  searchTool,
  getNodeTool,
  getChildrenTool,
  moveTool,
  copyTool,
  deleteTool,
  executScriptTool,
];

const toolMap = new Map<string, ToolDefinition>(ALL_TOOLS.map(t => [t.name, t]));

/** Look up a tool by name. Returns undefined if not registered. */
export function getToolByName(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

/** Return Anthropic-format tool schemas for all tools */
export function getAllToolSchemas(): AgentToolSchema[] {
  return ALL_TOOLS.map(toAnthropicSchema);
}
