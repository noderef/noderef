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
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  editorValueToRest,
  getEditorKind,
  isValidDateInput,
  normalizeDataType,
  normalizeDateInput,
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
  const { t } = useTranslation(['nodeBrowser']);
  const kind = getEditorKind(definition);
  const [draft, setDraft] = useState<unknown>(value);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

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
        size="xs"
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
        size="xs"
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
        size="xs"
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

  if (kind === 'textarea') {
    return (
      <Textarea
        autoFocus
        size="xs"
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
      size="xs"
      value={draft == null ? '' : String(draft)}
      onChange={event => {
        setDraft(event.currentTarget.value);
        setError(null);
      }}
      onBlur={() => commit()}
      onKeyDown={handleKeyDown}
      error={error}
      placeholder={
        kind === 'date' ? 'YYYY-MM-DD' : kind === 'datetime' ? 'YYYY-MM-DDTHH:mm:ss' : undefined
      }
    />
  );
}
