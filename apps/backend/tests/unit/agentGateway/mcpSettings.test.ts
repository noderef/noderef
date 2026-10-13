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

import { describe, expect, it } from 'vitest';
import {
  parseMcpSettings,
  parseMessageContext,
  serializeMcpSettings,
} from '../../../src/services/agentGateway/mcpSettings.js';

describe('mcpSettings', () => {
  it('round-trips chat MCP settings and drops invalid tools', () => {
    const serialized = serializeMcpSettings({ enabled: true, tools: ['echo_read', 'echo_read', ''] });
    expect(parseMcpSettings(serialized)).toEqual({ enabled: true, tools: ['echo_read'] });
    expect(parseMcpSettings('not-json')).toBeNull();
  });

  it('parses message context snapshots', () => {
    const parsed = parseMessageContext(
      JSON.stringify([
        { uri: 'alfresco://repository/info', name: 'info', chars: 4, truncated: false, text: 'body' },
        { nope: true },
      ])
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ uri: 'alfresco://repository/info', text: 'body' });
  });
});
