/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 *
 * Central tool registry.
 * To add a new tool: create tools/myTool.ts implementing ToolDefinition, then add it here.
 */

import type { AgentToolSchema } from '../../../ai/anthropic.js';
import { nodeCopyTool } from './node/copy.js';
import { nodeCreateTool } from './node/create.js';
import { nodeDeleteTool } from './node/delete.js';
import { nodeGetTool } from './node/get.js';
import { nodeGetContentTool } from './node/get_content.js';
import { nodeListChildrenTool } from './node/list_children.js';
import { nodeMoveTool } from './node/move.js';
import { nodeUpdateTool } from './node/update.js';
import { nodeUpdateContentTool } from './node/update_content.js';
import { searchTool } from './search/query.js';
import { scriptExecuteTool } from './script/execute.js';
import type { ToolDefinition } from './types.js';
import { toAnthropicSchema } from './types.js';

export type { ToolDefinition };

/** All tools available to the agent, in the order they are presented to the LLM */
export const ALL_TOOLS: ToolDefinition[] = [
  searchTool,
  nodeGetTool,
  nodeGetContentTool,
  nodeListChildrenTool,
  nodeCreateTool,
  nodeUpdateTool,
  nodeUpdateContentTool,
  nodeMoveTool,
  nodeCopyTool,
  nodeDeleteTool,
  scriptExecuteTool,
];

const toolMap = new Map<string, ToolDefinition>(ALL_TOOLS.map(t => [t.name, t]));

const TOOL_NAME_ALIASES: Record<string, string> = {
  get_node: 'node_get',
  get_content: 'node_get_content',
  update_content: 'node_update_content',
  get_children: 'node_list_children',
  move_node: 'node_move',
  copy_node: 'node_copy',
  delete_nodes: 'node_delete',
  execute_script: 'script_execute',
  delete: 'node_delete',
};

export function resolveToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] || name;
}

/** Look up a tool by name. Returns undefined if not registered. */
export function getToolByName(name: string): ToolDefinition | undefined {
  return toolMap.get(resolveToolName(name));
}

/** Return Anthropic-format tool schemas for all tools */
export function getAllToolSchemas(): AgentToolSchema[] {
  return ALL_TOOLS.map(toAnthropicSchema);
}
