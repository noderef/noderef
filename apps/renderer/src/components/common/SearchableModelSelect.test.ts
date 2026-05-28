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
import { filterModelSelectOptions } from './SearchableModelSelect';

describe('filterModelSelectOptions', () => {
  const options = [
    { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
  ];

  it('filters by label and value', () => {
    const byLabel = filterModelSelectOptions({ options, search: 'gemini', limit: 10 });
    expect(byLabel).toHaveLength(1);
    expect(byLabel[0]).toMatchObject({ value: 'google/gemini-2.5-pro' });

    const byValue = filterModelSelectOptions({ options, search: 'gpt-4o', limit: 10 });
    expect(byValue).toHaveLength(1);
    expect(byValue[0]).toMatchObject({ value: 'openai/gpt-4o' });
  });

  it('filters by dropdownLabel when present', () => {
    const withProvider = [
      {
        value: 'openrouter::anthropic/claude-sonnet-4',
        label: 'Claude Sonnet 4',
        dropdownLabel: 'OpenRouter · Claude Sonnet 4',
      },
    ];
    const byProvider = filterModelSelectOptions({
      options: withProvider,
      search: 'openrouter',
      limit: 10,
    });
    expect(byProvider).toHaveLength(1);
  });

  it('limits results for large lists', () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      value: `provider/model-${index}`,
      label: `Model ${index}`,
    }));

    const results = filterModelSelectOptions({ options: many, search: '', limit: 25 });
    expect(results).toHaveLength(25);
  });
});
