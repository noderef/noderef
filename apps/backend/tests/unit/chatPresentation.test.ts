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
import { DEFAULT_CHAT_ICON, normalizeChatIcon } from '../../src/services/agent/chatPresentation.js';

describe('normalizeChatIcon', () => {
  it('accepts canonical chat icon values', () => {
    const icons = [
      'hash',
      'search',
      'file-pdf',
      'agent',
      'user',
      'world',
      'lock',
      'settings',
      'chart-area',
      'server',
      'briefcase',
      'workflow',
    ] as const;
    for (const icon of icons) {
      expect(normalizeChatIcon(icon)).toBe(icon);
    }
  });

  it('maps common aliases to canonical chat icons', () => {
    expect(normalizeChatIcon('sites')).toBe('world');
    expect(normalizeChatIcon('permissions')).toBe('lock');
    expect(normalizeChatIcon('insights')).toBe('chart-area');
    expect(normalizeChatIcon('checklist')).toBe('list-check');
  });

  it('falls back to hash for unknown icons', () => {
    expect(normalizeChatIcon('unknown-icon')).toBe(DEFAULT_CHAT_ICON);
    expect(normalizeChatIcon(null)).toBe(DEFAULT_CHAT_ICON);
  });
});
