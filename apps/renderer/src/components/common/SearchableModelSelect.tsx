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

import { Select, type ComboboxItem, type OptionsFilter, type SelectProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export type ModelSelectOption = {
  value: string;
  /** Shown when the select is closed. */
  label: string;
  /** Shown in the dropdown; falls back to `label` when omitted. */
  dropdownLabel?: string;
};

const MODEL_SELECT_DISPLAY_LIMIT = 80;
const MODEL_SELECT_DROPDOWN_MAX_HEIGHT = 280;

function flattenSelectOptions(options: Parameters<OptionsFilter>[0]['options']): ComboboxItem[] {
  const flattened: ComboboxItem[] = [];
  for (const option of options) {
    if ('group' in option) {
      flattened.push(...option.items);
      continue;
    }
    flattened.push(option);
  }
  return flattened;
}

export const filterModelSelectOptions: OptionsFilter = ({ options, search, limit }) => {
  const query = search.trim().toLowerCase();
  const maxItems =
    typeof limit === 'number' && Number.isFinite(limit) ? limit : MODEL_SELECT_DISPLAY_LIMIT;

  const flattened = flattenSelectOptions(options).filter(option => !option.disabled);
  const filtered = !query
    ? flattened
    : flattened.filter(option => {
        const label = String(option.label ?? '').toLowerCase();
        const dropdownLabel = String(
          ('dropdownLabel' in option ? option.dropdownLabel : '') ?? ''
        ).toLowerCase();
        const value = String(option.value ?? '').toLowerCase();
        return label.includes(query) || dropdownLabel.includes(query) || value.includes(query);
      });

  return filtered.slice(0, maxItems);
};

export type SearchableModelSelectProps = Omit<SelectProps, 'data' | 'filter' | 'searchable'> & {
  data: ModelSelectOption[];
};

export function SearchableModelSelect({
  data,
  comboboxProps,
  limit = MODEL_SELECT_DISPLAY_LIMIT,
  maxDropdownHeight = MODEL_SELECT_DROPDOWN_MAX_HEIGHT,
  renderOption,
  ...rest
}: SearchableModelSelectProps) {
  const { t } = useTranslation('common');
  const hasDropdownLabels = data.some(item => item.dropdownLabel);
  const resolvedRenderOption =
    renderOption ??
    (hasDropdownLabels
      ? ({ option }: { option: ComboboxItem }) => {
          const match = data.find(item => item.value === option.value);
          return <span>{match?.dropdownLabel ?? option.label}</span>;
        }
      : undefined);

  return (
    <Select
      {...rest}
      data={data}
      searchable
      filter={filterModelSelectOptions}
      limit={limit}
      maxDropdownHeight={maxDropdownHeight}
      nothingFoundMessage={t('nothingFound')}
      comboboxProps={comboboxProps}
      renderOption={resolvedRenderOption}
    />
  );
}
