/**
 * Copyright 2025 NodeRef
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

import type { LoadedLibs } from './loadLibs.js';

interface ExecutionPromptOptions {
  question: string;
  selectedLibs: string[];
  libs: LoadedLibs['libs'];
  selection?: string;
  contextSnippet?: string;
}

export function buildExecutionPrompt({
  question,
  selectedLibs,
  libs,
  selection,
  contextSnippet,
}: ExecutionPromptOptions): string {
  const libsText = selectedLibs
    .map(name => `// ${name}.js\n${libs[name]?.text ?? ''}`)
    .join('\n\n');

  const selectionBlock = selection?.trim() ? `Current selection:\n"""${selection.trim()}"""\n` : '';

  const contextBlock = contextSnippet?.trim()
    ? `Additional context:\n"""${contextSnippet.trim()}"""\n`
    : '';

  const dsl = `
Respond using EXACTLY this format. Do not add markdown fences, prose, or multiple blocks.

<changes>
{
  "type": "replace_selection",
  "code": "/* new JS code */\\n// explanation comments"
}
</changes>

Formatting rules:
1. The JSON inside <changes> must be valid (double quotes only, no trailing commas).
2. The "code" value must be a single JSON string: escape every newline as \\n and every double quote as \\". Never place raw newlines inside the string.
3. Set "type" to "replace_selection" when editing only the provided selection or command line. Use "replace_file" ONLY if the user explicitly requests replacing the entire script or a full rewrite is required; include the complete script in that case.
4. Put explanations inside the code using // comments. Do not output commentary outside <changes>.
`.trim();

  return [
    'You are an Javascript programmer for an Alfresco JavaScript console.',
    'Use ONLY the functions provided inside <libraries>. Do not invent APIs.',
    'Return valid JavaScript code and embed explanations using // comments.',
    'If something is unclear, request clarification instead of guessing.',
    '',
    '<libraries>',
    libsText || '// No helper libraries selected',
    '</libraries>',
    '',
    selectionBlock,
    contextBlock,
    'User question:',
    question,
    '',
    dsl,
  ]
    .filter(Boolean)
    .join('\n');
}
