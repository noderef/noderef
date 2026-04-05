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

import { backendRpc } from '@/core/ipc/backend';
import type { InsightDashboard, InsightGraph } from '@/core/ipc/backend';
import type { InsightRangeDays } from '@/utils/insightsRange';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UseInsightsDashboardResult {
  dashboard: InsightDashboard | null;
  graphs: InsightGraph[];
  loading: boolean;
  error: string | null;
  loadDashboard: () => Promise<void>;
  setGraphs: React.Dispatch<React.SetStateAction<InsightGraph[]>>;
}

export function useInsightsDashboard(
  serverId: number | null,
  selectedRange: InsightRangeDays
): UseInsightsDashboardResult {
  const { t } = useTranslation(['insights']);
  const [dashboard, setDashboard] = useState<InsightDashboard | null>(null);
  const [graphs, setGraphs] = useState<InsightGraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!serverId) {
      setDashboard(null);
      setGraphs([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [dashboardData, graphsList] = await Promise.all([
        backendRpc.serverInsights.getDashboard(serverId, selectedRange),
        backendRpc.serverInsights.listGraphs(serverId),
      ]);
      setDashboard(dashboardData);
      setGraphs(graphsList);
    } catch (err) {
      console.error('Failed to load insights dashboard:', err);
      setError(err instanceof Error ? err.message : t('insights:loadError'));
    } finally {
      setLoading(false);
    }
  }, [serverId, selectedRange, t]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return {
    dashboard,
    graphs,
    loading,
    error,
    loadDashboard,
    setGraphs,
  };
}
