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

import { useNavigationStore } from '@/core/store/navigation';

/**
 * Hook for navigation state and actions.
 * Uses selectors to minimize re-renders.
 */
export function useNavigation() {
  const activePage = useNavigationStore(state => state.activePage);
  const activeServerId = useNavigationStore(state => state.activeServerId);
  const history = useNavigationStore(state => state.history);
  const navigate = useNavigationStore(state => state.navigate);
  const setActiveServer = useNavigationStore(state => state.setActiveServer);
  const reset = useNavigationStore(state => state.reset);
  const goBack = useNavigationStore(state => state.goBack);
  const canGoBack = useNavigationStore(state => state.canGoBack);

  return {
    activePage,
    activeServerId,
    history,
    navigate,
    setActiveServer,
    reset,
    goBack,
    canGoBack: canGoBack(),
  };
}

/**
 * Hook to get only the active page (for components that only need to read it)
 */
export function useActivePage() {
  return useNavigationStore(state => state.activePage);
}

/**
 * Hook to get only the active server ID
 */
export function useActiveServerId() {
  return useNavigationStore(state => state.activeServerId);
}
