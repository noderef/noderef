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

import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from './agent';

describe('agent store MCP state', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it('keeps pending MCP settings for a chat that does not exist yet', () => {
    useAgentStore.getState().setPendingMcp({ enabled: true, tools: ['echo_read'] });
    expect(useAgentStore.getState().pendingMcp).toEqual({ enabled: true, tools: ['echo_read'] });
    useAgentStore.getState().setPendingMcp(null);
    expect(useAgentStore.getState().pendingMcp).toBeNull();
  });

  it('stores context chips per chat and pending composer, without duplicates', () => {
    useAgentStore.getState().addContextResource(null, { uri: 'alfresco://node/1', name: 'One' });
    useAgentStore.getState().addContextResource(null, { uri: 'alfresco://node/1', name: 'One' });
    expect(useAgentStore.getState().pendingContextResources).toHaveLength(1);

    useAgentStore.getState().addContextResource(9, { uri: 'alfresco://node/2', name: 'Two' });
    useAgentStore.getState().addContextResource(9, { uri: 'alfresco://node/2', name: 'Two' });
    expect(useAgentStore.getState().contextResourcesByChat[9]).toHaveLength(1);

    useAgentStore.getState().removeContextResource(9, 'alfresco://node/2');
    expect(useAgentStore.getState().contextResourcesByChat[9]).toEqual([]);
    useAgentStore.getState().clearContextResources(null);
    expect(useAgentStore.getState().pendingContextResources).toEqual([]);
  });

  it('copies MCP settings from upserted chats', () => {
    useAgentStore.getState().upsertChat({
      id: 3,
      userId: 1,
      serverId: 2,
      title: 'Chat',
      chatIcon: 'hash',
      hasActiveRun: false,
      hasWaitingConfirmation: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
      mcp: { enabled: true, tools: ['echo_read'] },
    });
    expect(useAgentStore.getState().mcpByChat[3]).toEqual({
      enabled: true,
      tools: ['echo_read'],
    });
  });
});
