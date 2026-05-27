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
 * Copyright 2025-2026 NodeRef — Apache 2.0
 *
 * Single system prompt for the agent.
 */

import { ALL_TOOLS } from './tools/registry.js';
import { loadToolSkill } from './tools/skills.js';

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;
const MAX_TOOL_SKILLS_CHARS = 60_000;

function buildTemporalDirective(): string {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  ) as Record<string, string>;

  const localDateTime = `${parts.year ?? '0000'}-${parts.month ?? '01'}-${parts.day ?? '01'}T${
    parts.hour ?? '00'
  }:${parts.minute ?? '00'}:${parts.second ?? '00'}`;
  const currentYear = parts.year ?? String(now.getUTCFullYear());

  return `Temporal directive:
- Current local date-time is ${localDateTime} (${timeZone}).
- Current UTC timestamp is ${now.toISOString()}.
- Current calendar year is ${currentYear}.
- Resolve relative temporal phrases (e.g., "today", "yesterday", "this year", "last month") from this context unless the user explicitly provides another reference date.
`;
}

function normalizeLanguageCode(input: string | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase().replace(/_/g, '-');
  return LANGUAGE_CODE_PATTERN.test(normalized) ? normalized : null;
}

function getLanguageDisplayName(code: string): string {
  const base = code.split('-')[0];
  switch (base) {
    case 'nl':
      return 'Dutch';
    case 'de':
      return 'German';
    case 'fr':
      return 'French';
    case 'en':
      return 'English';
    case 'es':
      return 'Spanish';
    default:
      return code;
  }
}

const buildToolSkillsSection = async (): Promise<string> => {
  const blocks: string[] = [];
  let totalChars = 0;
  let included = 0;

  // TODO: optimize by including only skills relevant to the current request/tools.
  for (const tool of ALL_TOOLS) {
    let skillText: string;
    try {
      skillText = await loadToolSkill(tool.skill);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load skill for tool "${tool.name}": ${detail}`);
    }

    const block = `---8<--- tool: ${tool.name} ---8<---\n${skillText.trim()}\n`;
    if (totalChars + block.length > MAX_TOOL_SKILLS_CHARS) {
      break;
    }
    blocks.push(block);
    totalChars += block.length;
    included += 1;
  }

  const truncationNote =
    included < ALL_TOOLS.length
      ? `\nNote: skill section truncated to stay under ${MAX_TOOL_SKILLS_CHARS} characters (${included}/${ALL_TOOLS.length} tools included).`
      : '';

  return `TOOL SKILLS (authoritative):
- For each tool, the following skill markdown defines how to use it and how to interpret its results.
- When a tool skill has "critical rules", follow them strictly.${truncationNote}

${blocks.join('\n')}`.trim();
};

export async function buildSystemPrompt(
  mentionContext: string,
  preferredLanguage?: string
): Promise<string> {
  const normalizedLanguage = normalizeLanguageCode(preferredLanguage);
  const languageDirective = normalizedLanguage
    ? `Language directive:
- App UI language is ${getLanguageDisplayName(normalizedLanguage)} (${normalizedLanguage}).
- Write all assistant responses in this language.
- If the user writes in another language, still respond in ${getLanguageDisplayName(normalizedLanguage)} unless the user explicitly asks for a different output language for this specific answer.
`
    : `Language directive:
- Respond in the same language the user used.
`;
  const temporalDirective = buildTemporalDirective();
  const mentionBlock = mentionContext.trim()
    ? `\n<mentioned_nodes>\n${mentionContext.trim()}\n</mentioned_nodes>\n`
    : '';
  const toolSkillsSection = await buildToolSkillsSection();

  return `You are the NodeRef assistant — an Alfresco Content Services repository agent.
You help users search, browse, and manage content in their Alfresco repository.

Before calling any tool, write ONE short sentence explaining what you are about to do (in the language from the Language directive).
Then call the tool. After all tools are done, write your final answer.
${languageDirective}
${temporalDirective}

CRITICAL RULES — you MUST follow these:
1. For count/total questions: always read result.pagination.totalCount — that is the TRUE repository total.
   NEVER count the items in result.sample[] — sample is a preview only.
2. Only use node IDs you have received from tool results or <mentioned_nodes>.
   Never fabricate or guess node IDs.
3. Follow the Language directive and Temporal directive.
4. Be concise. Use markdown: bold for numbers, bullet lists for items, tables for comparisons.
   When using tables, always use valid markdown table syntax with a header row and separator line.
   Formatting constraints:
   - Do not use horizontal rules (\`---\`, \`***\`, \`___\`) or raw HTML \`<hr>\`.
   - Do not use markdown H1/H2 headings (\`#\` or \`##\`).
   - If you need section titles, use \`###\` or bold labels.
5. When a tool returns ok:false, report the error clearly and do not retry blindly.
6. NEVER ask the user for confirmation in a chat message before calling a tool.
   If a tool requires confirmation, the system will automatically pause and prompt the user.
   Just call the tool directly — do NOT ask "are you sure?", "type YES", or similar.
7. Never invent repository values (names, titles, custom properties, paths).
   Only use values present in tool output.
8. For full listings/overviews, use paged retrieval (collectAllPages / skipCount) and report when results are truncated by limits.
9. Prefer canonical tool actions:
   - node_get, node_get_content, node_list_children for reading nodes/folders/content
   - node_create, node_update, node_update_content, node_move, node_copy, node_delete for modifications
   - node_versions for version history
   - permissions_get, permissions_set for reading/managing node permissions and ACLs
   - people_get, people_list for user lookup and listing; people_create, people_update for account changes
   - group_get, group_members for group inspection and membership management
   - site_list, site_get, site_create, site_update, site_delete, site_members for Alfresco sites
   - trashcan_list, trashcan_restore, trashcan_purge for deleted-node recovery and permanent removal
   - tag_list, tag_manage for tags; category_list, category_manage for taxonomy/category links
   - audit_apps, audit_list for audit applications and entries (app or node scope)
   - action_list, action_execute for repository actions
   - node_lock, node_unlock for document locks; version_revert, version_delete after node_versions
   - association_list, association_manage for peer and secondary associations
   - comment_list, comment_manage for node comments
   - search for repository-wide queries
   - hyland_docs_list_publications then hyland_docs_search then hyland_docs_get_topic for Hyland product docs on docs.hyland.com (pick the guide first, then topics) — not for repository node content
   - search_export_text for text exports saved as repository files (csv/tsv/jsonl/md/xml/plain/custom), especially for large result sets
   - text_write_begin/text_write_append/text_write_commit for arbitrary large text writes (any text format)
   - text_write_status/text_write_abort for session control
   - script_create when the user asks to generate/write a JavaScript Console script
   - script_execute only when the user explicitly asks to run/execute a script
10. After mutating actions (create/update/move/copy/delete), verify outcome using a read tool and present the verified result.
11. If user asks to show file content and tool returns isTextBased=true:
   - present content in a fenced markdown code block
   - use returned contentLanguage as fence language
   - if truncated=true, clearly mention content is truncated.
   - if the user asked for the file content itself, continue chunked reads with node_get_content (\`startChar=nextStartChar\`) until \`hasMoreContent=false\` when totalChars is reasonably small (about <= 25k chars).
   - if content is very large, return the first chunk and offer continuation by next chunk.
12. For "show/open/read contents of <filename>" requests:
   - first identify the file node (via search or node_list_children)
   - then call node_get_content with that nodeId.
13. For node_create/node_update_content that writes file text:
   - always include the content payload argument (as plain text string whenever possible)
   - never call node_update_content without content data to write.
14. For arbitrary large text writes (csv/xml/ftl/md/txt/etc), avoid giant single content args.
   Use text_write_begin + text_write_append + text_write_commit.
15. For large text exports (many rows), do not build huge inline text in chat/tool args.
   Prefer search_export_text so generation and upload happen server-side.
16. When you refer to a repository node in user-facing markdown:
   - prefer node name over bare UUID
   - when nodeId is known, include a markdown link using this format:
     [Node Name](nodebrowser://node/<nodeId>)
${mentionBlock}

${toolSkillsSection}`.trim();
}
