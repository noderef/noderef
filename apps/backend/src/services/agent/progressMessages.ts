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

export interface ProgressNote {
  type: string;
  payload: { text: string };
}

const note = (text: string): ProgressNote => ({ type: 'run.note', payload: { text } });

export const buildDescriptionNote = (description: string): ProgressNote => note(description);

export const buildConfirmNote = (actionSummary: string): ProgressNote =>
  note(`Awaiting confirmation: ${actionSummary}`);

export const buildCompletionNote = (success: boolean): ProgressNote =>
  note(success ? 'Done.' : 'Completed with errors.');
