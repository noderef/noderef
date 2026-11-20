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

import type { EditablePropertyDefinition } from '@/core/ipc/backend';
import { NumberInput, Select, Switch, TagsInput, Textarea, TextInput } from '@mantine/core';
import { DatePickerInput, DatesProvider, DateTimePicker } from '@mantine/dates';
import 'dayjs/locale/de';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';
import 'dayjs/locale/nl';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  editorValueToRest,
  fromDateTimePickerValue,
  getEditorKind,
  isValidDateInput,
  normalizeDataType,
  normalizeDateInput,
  toDatePickerValue,
  toDateTimePickerValue,
} from './propertyEditing';

interface PropertyValueEditorProps {
  definition: EditablePropertyDefinition;
  value: unknown;
  onCommit: (value: unknown | null) => void;
  onCancel: () => void;
}

export function PropertyValueEditor({
  definition,
  value,
  onCommit,
  onCancel,
}: PropertyValueEditorProps) {
  const { t, i18n } = useTranslation(['nodeBrowser']);
  const kind = getEditorKind(definition);
  const datesLocale = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const [draft, setDraft] = useState<unknown>(value);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const cancel = () => {
    cancelledRef.current = true;
    onCancel();
  };

  const commit = (next: unknown = draft) => {
    if (cancelledRef.current) {
      return;
    }
    if (kind === 'date' || kind === 'datetime') {
      const text = next == null ? '' : String(next);
      if (!isValidDateInput(text, kind === 'datetime')) {
        setError(
          kind === 'datetime' ? t('nodeBrowser:invalidDateTime') : t('nodeBrowser:invalidDate')
        );
        return;
      }
      const normalized = text.trim() ? normalizeDateInput(text, kind === 'datetime') : null;
      onCommit(editorValueToRest(normalized, definition));
      return;
    }

    onCommit(editorValueToRest(next, definition));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
    if (event.key === 'Enter' && kind !== 'textarea' && !definition.multiValued) {
      event.preventDefault();
      commit();
    }
  };

  if (definition.multiValued) {
    const tags = Array.isArray(draft) ? draft.map(item => String(item)) : [];
    return (
      <TagsInput
        autoFocus
        size="sm"
        data={definition.allowedValues ?? []}
        value={tags}
        onChange={next => setDraft(next)}
        onBlur={() => commit()}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (kind === 'boolean') {
    return (
      <Switch
        size="sm"
        checked={draft === true}
        onChange={event => {
          const next = event.currentTarget.checked;
          setDraft(next);
          onCommit(next);
        }}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (kind === 'number') {
    return (
      <NumberInput
        autoFocus
        size="sm"
        value={
          typeof draft === 'number' ? draft : draft == null || draft === '' ? '' : Number(draft)
        }
        onChange={next => setDraft(next === '' ? null : next)}
        onBlur={() => commit()}
        onKeyDown={handleKeyDown}
        allowDecimal={
          normalizeDataType(definition.dataType) === 'd:float' ||
          normalizeDataType(definition.dataType) === 'd:double'
        }
      />
    );
  }

  if (kind === 'list') {
    return (
      <Select
        autoFocus
        size="sm"
        searchable
        clearable
        data={definition.allowedValues ?? []}
        value={draft == null ? null : String(draft)}
        onChange={next => {
          setDraft(next);
          onCommit(editorValueToRest(next, definition));
        }}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (kind === 'date' || kind === 'datetime') {
    const pickerValue =
      kind === 'datetime' ? toDateTimePickerValue(draft) : toDatePickerValue(draft);
    const originalPickerValue =
      kind === 'datetime' ? toDateTimePickerValue(value) : toDatePickerValue(value);
    const commitPickerValue = (next: string | null) => {
      if (cancelledRef.current) {
        return;
      }
      if (kind === 'datetime') {
        onCommit(editorValueToRest(fromDateTimePickerValue(next), definition));
        return;
      }
      onCommit(editorValueToRest(next, definition));
    };

    const picker =
      kind === 'datetime' ? (
        <DateTimePicker
          autoFocus
          size="sm"
          clearable
          withSeconds
          value={pickerValue}
          valueFormat="D MMM YYYY HH:mm:ss"
          placeholder={t('nodeBrowser:pickDateTime')}
          aria-label={t('nodeBrowser:pickDateTime')}
          popoverProps={{ withinPortal: true }}
          onChange={next => {
            const value = typeof next === 'string' ? next : toDateTimePickerValue(next);
            setDraft(value);
            setError(null);
          }}
          onDropdownClose={() => {
            const current =
              typeof draftRef.current === 'string'
                ? draftRef.current
                : toDateTimePickerValue(draftRef.current);
            if (current === originalPickerValue) {
              cancel();
              return;
            }
            commitPickerValue(current);
          }}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <DatePickerInput
          autoFocus
          size="sm"
          clearable
          value={pickerValue}
          valueFormat="D MMM YYYY"
          placeholder={t('nodeBrowser:pickDate')}
          aria-label={t('nodeBrowser:pickDate')}
          popoverProps={{ withinPortal: true }}
          onChange={next => {
            const value = typeof next === 'string' ? next : toDatePickerValue(next);
            setDraft(value);
            setError(null);
            commitPickerValue(value);
          }}
          onKeyDown={handleKeyDown}
        />
      );

    return (
      <DatesProvider settings={{ locale: datesLocale, firstDayOfWeek: 1 }}>
        {picker}
      </DatesProvider>
    );
  }

  if (kind === 'textarea') {
    return (
      <Textarea
        autoFocus
        size="sm"
        minRows={2}
        autosize
        value={draft == null ? '' : String(draft)}
        onChange={event => setDraft(event.currentTarget.value)}
        onBlur={() => commit()}
        onKeyDown={handleKeyDown}
        error={error}
      />
    );
  }

  return (
    <TextInput
      autoFocus
      size="sm"
      value={draft == null ? '' : String(draft)}
      onChange={event => {
        setDraft(event.currentTarget.value);
        setError(null);
      }}
      onBlur={() => commit()}
      onKeyDown={handleKeyDown}
      error={error}
    />
  );
}
