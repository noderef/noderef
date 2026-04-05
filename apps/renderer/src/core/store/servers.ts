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
 * Server data store
 * Manages server list loaded from backend workspace
 */

import { create } from 'zustand';
import type { AppServer } from '@/core/ipc/backend';

export interface ServersState {
  servers: AppServer[];
  loading: boolean;
  error: string | null;
}

export interface ServersActions {
  setServers: (servers: AppServer[]) => void;
  addServer: (server: AppServer) => void;
  updateServer: (id: number, updates: Partial<AppServer>) => void;
  removeServer: (id: number) => void;
  reorderServers: (orders: Array<{ id: number; displayOrder: number }>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getServerById: (id: number | null) => AppServer | null;
  getServersSorted: () => AppServer[];
}

const initialState: ServersState = {
  servers: [],
  loading: false,
  error: null,
};

export const useServersStore = create<ServersState & ServersActions>((set, get) => ({
  ...initialState,
  setServers: servers => set({ servers }),
  addServer: server =>
    set(state => ({
      servers: [...state.servers, server],
    })),
  updateServer: (id, updates) =>
    set(state => ({
      servers: state.servers.map(s => (s.id === id ? { ...s, ...updates } : s)),
    })),
  removeServer: id =>
    set(state => ({
      servers: state.servers.filter(s => s.id !== id),
    })),
  reorderServers: orders => {
    const orderMap = new Map(orders.map(o => [o.id, o.displayOrder]));
    set(state => ({
      servers: state.servers.map(s => {
        const newOrder = orderMap.get(s.id);
        return newOrder !== undefined ? { ...s, displayOrder: newOrder } : s;
      }),
    }));
  },
  setLoading: loading => set({ loading }),
  setError: error => set({ error }),
  getServerById: id => {
    if (id === null) return null;
    return get().servers.find(s => s.id === id) || null;
  },
  getServersSorted: () => {
    const servers = [...get().servers];
    return servers.sort((a, b) => a.displayOrder - b.displayOrder);
  },
}));
