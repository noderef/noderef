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

import type { Manifest } from './loadLibs.js';

export function buildRouterPrompt(question: string, manifest: Manifest): string {
  const list = Object.entries(manifest)
    .map(
      ([name, info]: [string, { description: string; tags: string[] }]) =>
        `- ${name}: ${info.description} (tags: ${Array.isArray(info.tags) ? info.tags.join(', ') : ''})`
    )
    .join('\n');

  return [
    'You are a library selector for an Alfresco JavaScript console.',
    'Choose only the libraries that are strictly required for the user question.',
    'Respond with a valid JSON array literal that contains only library names (double quotes, no trailing commas).',
    'Do not include explanations, backticks, or any text outside of the JSON array. A single line array is preferred.',
    'If no libraries are needed, respond with [].',
    'Example outputs: [] or ["search","sites"]',
    '',
    'Available libraries:',
    list,
    '',
    'User question:',
    question,
  ].join('\n');
}
