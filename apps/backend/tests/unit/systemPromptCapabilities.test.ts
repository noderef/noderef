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

import { createOkProfile } from '@app/contracts';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../src/services/agent/systemPrompt.js';

describe('buildSystemPrompt capability filtering', () => {
  it('omits script skills and adds a restriction paragraph for non-admins', async () => {
    const prompt = await buildSystemPrompt(
      '',
      'en',
      createOkProfile({
        isAdmin: false,
        jsConsole: false,
        supportTools: false,
        nodeBrowser: false,
      })
    );

    expect(prompt).toContain('Capability restrictions:');
    expect(prompt).toContain('script_execute');
    expect(prompt).not.toContain('---8<--- tool: script_execute ---8<---');
    expect(prompt).not.toContain('---8<--- tool: script_create ---8<---');
    expect(prompt).toContain('---8<--- tool: search ---8<---');
  });
});
