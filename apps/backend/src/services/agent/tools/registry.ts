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

/**
 * Central tool registry.
 * To add a new tool: create tools/myTool.ts implementing ToolDefinition, then add it here.
 */

import type { AgentToolSchema } from '../../../ai/anthropic.js';
import { existsSync } from 'node:fs';
import { nodeCopyTool } from './node/copy.js';
import { nodeCreateTool } from './node/create.js';
import { nodeDeleteTool } from './node/delete.js';
import { nodeGetTool } from './node/get.js';
import { nodeGetContentTool } from './node/get_content.js';
import { nodeListChildrenTool } from './node/list_children.js';
import { nodeMoveTool } from './node/move.js';
import { nodeUpdateTool } from './node/update.js';
import { nodeUpdateContentTool } from './node/update_content.js';
import { nodeVersionsTool } from './node/versions.js';
import { groupGetTool } from './groups/get.js';
import { groupMembersTool } from './groups/members.js';
import { peopleGetTool } from './people/get.js';
import { peopleListTool } from './people/list.js';
import { permissionsGetTool } from './permissions/get.js';
import { permissionsSetTool } from './permissions/set.js';
import { searchExportTextTool } from './search/export_text.js';
import { searchTool } from './search/query.js';
import { scriptCreateTool } from './script/create.js';
import { scriptExecuteTool } from './script/execute.js';
import { textWriteAbortTool } from './text/write_abort.js';
import { textWriteAppendTool } from './text/write_append.js';
import { textWriteBeginTool } from './text/write_begin.js';
import { textWriteCommitTool } from './text/write_commit.js';
import { textWriteStatusTool } from './text/write_status.js';
import { resolveToolSkillPath } from './skills.js';
import type { ToolDefinition } from './types.js';
import { toAnthropicSchema } from './types.js';

export type { ToolDefinition };

/** All tools available to the agent, in the order they are presented to the LLM */
export const ALL_TOOLS: ToolDefinition[] = [
  searchTool,
  searchExportTextTool,
  textWriteBeginTool,
  textWriteAppendTool,
  textWriteStatusTool,
  textWriteAbortTool,
  textWriteCommitTool,
  nodeGetTool,
  nodeGetContentTool,
  nodeListChildrenTool,
  nodeCreateTool,
  nodeUpdateTool,
  nodeUpdateContentTool,
  nodeMoveTool,
  nodeCopyTool,
  nodeVersionsTool,
  nodeDeleteTool,
  permissionsGetTool,
  permissionsSetTool,
  peopleGetTool,
  peopleListTool,
  groupGetTool,
  groupMembersTool,
  scriptCreateTool,
  scriptExecuteTool,
];

const assertToolSkills = (tools: ToolDefinition[]): void => {
  for (const tool of tools) {
    if (!tool.skill || tool.skill.kind !== 'local_md') {
      throw new Error(`Tool "${tool.name}" is missing a valid local_md skill definition`);
    }
    const resolvedPath = resolveToolSkillPath(tool.skill, __filename);
    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Tool "${tool.name}" skill file not found: ${resolvedPath}. ` +
          'Each tool must ship with a default local markdown skill.'
      );
    }
  }
};

assertToolSkills(ALL_TOOLS);

const toolMap = new Map<string, ToolDefinition>(ALL_TOOLS.map(t => [t.name, t]));

const TOOL_NAME_ALIASES: Record<string, string> = {
  get_node: 'node_get',
  get_content: 'node_get_content',
  update_content: 'node_update_content',
  get_children: 'node_list_children',
  move_node: 'node_move',
  copy_node: 'node_copy',
  get_versions: 'node_versions',
  list_versions: 'node_versions',
  delete_nodes: 'node_delete',
  get_permissions: 'permissions_get',
  set_permissions: 'permissions_set',
  get_person: 'people_get',
  list_people: 'people_list',
  list_users: 'people_list',
  get_group: 'group_get',
  manage_group_members: 'group_members',
  execute_script: 'script_execute',
  create_script: 'script_create',
  export_csv: 'search_export_text',
  search_export_csv: 'search_export_text',
  text_write_start: 'text_write_begin',
  text_write_finish: 'text_write_commit',
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
