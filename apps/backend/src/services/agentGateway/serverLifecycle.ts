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

import { EventEmitter } from 'node:events';

export type ServerLifecycleEvent =
  | { type: 'server.updated'; userId: number; serverId: number }
  | { type: 'server.deleted'; userId: number; serverId: number }
  | { type: 'server.loggedOut'; baseUrl: string };

type Listener = (event: ServerLifecycleEvent) => void;

class ServerLifecycleBus extends EventEmitter {
  emitEvent(event: ServerLifecycleEvent): void {
    this.emit('event', event);
  }

  onEvent(listener: Listener): () => void {
    this.on('event', listener);
    return () => {
      this.off('event', listener);
    };
  }
}

export const serverLifecycle = new ServerLifecycleBus();

export function emitServerUpdated(userId: number, serverId: number): void {
  serverLifecycle.emitEvent({ type: 'server.updated', userId, serverId });
}

export function emitServerDeleted(userId: number, serverId: number): void {
  serverLifecycle.emitEvent({ type: 'server.deleted', userId, serverId });
}

export function emitServerLoggedOut(baseUrl: string): void {
  serverLifecycle.emitEvent({ type: 'server.loggedOut', baseUrl });
}
