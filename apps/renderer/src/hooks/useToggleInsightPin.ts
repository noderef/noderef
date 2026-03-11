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
 * Shared hook for toggling the pinned state of insight graphs.
 * Uses optimistic updates to avoid a full page reload.
 */

import { backendRpc } from '@/core/ipc/backend';
import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * @param onOptimisticUpdate  Called immediately with the graphId and new pin state
 *                            so the UI can update without waiting for the server.
 * @param onRollback          Called if the server request fails so the UI can revert.
 */
export function useToggleInsightPin(
  onOptimisticUpdate: (graphId: number, nextPinned: boolean) => void,
  onRollback?: (graphId: number, previousPinned: boolean) => void
) {
  const { t } = useTranslation(['insights', 'common']);

  return useCallback(
    async (graphId: number, nextPinned: boolean) => {
      // Optimistically update the UI
      onOptimisticUpdate(graphId, nextPinned);

      try {
        await backendRpc.serverInsights.updateGraph(graphId, { isPinned: nextPinned });
      } catch (err) {
        // Rollback on failure
        onRollback?.(graphId, !nextPinned);
        notifications.show({
          title: t('common:error'),
          message: err instanceof Error ? err.message : t('insights:loadError'),
          color: 'red',
        });
      }
    },
    [onOptimisticUpdate, onRollback, t]
  );
}
