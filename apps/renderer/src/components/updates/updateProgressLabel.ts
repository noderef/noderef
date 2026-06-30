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

import type { TFunction } from 'i18next';

import type { DownloadProgress } from '@/core/updates/downloadResources';
import { formatBytes } from '@/utils/formatBytes';

export interface UpdateProgressLabelInput {
  /** 0–100 when known, null for indeterminate progress. */
  progress: number | null;
  loaded: number | null;
  total: number | null;
  phase: NonNullable<DownloadProgress['phase']>;
}

/**
 * Human-readable progress text shared by the update notification and button.
 * Prefers a percentage, then a loaded/total byte count, then an indeterminate
 * fallback. The `writing` phase shows a dedicated "saving" message.
 */
export function formatUpdateProgressLabel(t: TFunction, input: UpdateProgressLabelInput): string {
  const { progress, loaded, total, phase } = input;

  if (phase === 'writing') {
    return t('settings:updateSaving');
  }
  if (progress !== null) {
    return t('settings:updateDownloading', { percent: progress });
  }
  if (loaded && total) {
    return t('settings:updateDownloadProgressKnown', {
      loaded: formatBytes(loaded),
      total: formatBytes(total),
    });
  }
  if (loaded) {
    return t('settings:updateDownloadProgressUnknown', { loaded: formatBytes(loaded) });
  }
  return t('settings:updateDownloadingIndeterminate');
}
