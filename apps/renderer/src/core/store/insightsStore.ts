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
 * Insights store
 * UI state for the server insights page (selected range per server)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type InsightRangeDays = 7 | 14 | 30 | 90;
export const DEFAULT_INSIGHT_RANGE: InsightRangeDays = 7;

interface InsightsState {
  selectedRangeByServer: Record<number, InsightRangeDays>;
  setSelectedRange: (serverId: number, range: InsightRangeDays) => void;
}

const STORAGE_KEY = 'insights-store';

export const useInsightsStore = create<InsightsState>()(
  persist(
    set => ({
      selectedRangeByServer: {},

      setSelectedRange: (serverId: number, range: InsightRangeDays) => {
        set(state => ({
          selectedRangeByServer: {
            ...state.selectedRangeByServer,
            [serverId]: range,
          },
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: state => ({
        selectedRangeByServer: state.selectedRangeByServer,
      }),
    }
  )
);
