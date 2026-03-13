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
 * Insight Graph Settings Modal
 * Form for creating, editing, and deleting insight graph definitions.
 */

import type { InsightGraph } from '@/core/ipc/backend';
import { backendRpc } from '@/core/ipc/backend';
import { isNeutralinoMode } from '@/core/ipc/neutralino';
import { useServersStore } from '@/core/store/servers';
import {
  useDesktopClipboardHandlers,
  type EditableTarget,
} from '@/hooks/useDesktopClipboardHandlers';
import { useSearchDictionary } from '@/hooks/useSearchDictionary';
import {
  ActionIcon,
  Button,
  Combobox,
  ColorInput,
  Group,
  Pill,
  PillsInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  useCombobox,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconLock, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface InsightGraphSettingsModalProps {
  graph: InsightGraph | null; // null = create mode
  serverId: number;
  onSaved: () => void;
  onClose: () => void;
}

export function InsightGraphSettingsModal({
  graph,
  serverId,
  onSaved,
  onClose,
}: InsightGraphSettingsModalProps) {
  const { t } = useTranslation(['insights', 'common', 'search']);
  const isEditMode = Boolean(graph);
  const servers = useServersStore(state => state.servers);

  const [title, setTitle] = useState(graph?.title ?? '');
  const graphType = 'area' as const;
  const [filterQuery, setFilterQuery] = useState(graph?.filterQuery ?? '');
  const [dateField, setDateField] = useState(graph?.dateField ?? 'cm:created');
  const [dateFieldInput, setDateFieldInput] = useState('');
  const [color, setColor] = useState(graph?.color ?? '#228be6');
  const [columnSpan, setColumnSpan] = useState(String(graph?.columnSpan ?? 1));
  const [saving, setSaving] = useState(false);
  const propertyDataTypesCacheRef = useRef<Record<string, { values: Record<string, string>; timestamp: number }>>({});
  const [currentPropertyDataTypes, setCurrentPropertyDataTypes] = useState<Record<string, string>>({});
  const [isLoadingDynamicProps, setIsLoadingDynamicProps] = useState(false);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const isDesktopMode = useMemo(
    () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
    []
  );
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const handleInsertText = useCallback(
    (editableTarget: EditableTarget, text: string) => {
      if (
        !(editableTarget instanceof HTMLInputElement || editableTarget instanceof HTMLTextAreaElement)
      ) {
        if (editableTarget.isContentEditable) {
          document.execCommand('insertText', false, text);
        }
        return;
      }

      const { selectionStart, selectionEnd, value } = editableTarget;
      const start = selectionStart ?? value.length;
      const end = selectionEnd ?? value.length;
      const newValue = value.slice(0, start) + text + value.slice(end);
      const cursorPos = start + text.length;
      const fieldName = editableTarget.getAttribute('data-field') || '';

      switch (fieldName) {
        case 'title':
          setTitle(newValue);
          break;
        case 'filterQuery':
          setFilterQuery(newValue);
          break;
        case 'dateField':
          setDateFieldInput(newValue);
          break;
        default:
          return;
      }

      setTimeout(() => {
        if (document.activeElement === editableTarget) {
          editableTarget.setSelectionRange(cursorPos, cursorPos);
        }
      }, 0);
    },
    [setTitle, setFilterQuery, setDateFieldInput]
  );

  useDesktopClipboardHandlers({
    isEnabled: isDesktopMode,
    containerRef: modalContentRef,
    onInsertText: handleInsertText,
    enableCopyCut: true,
  });

  const { dictionary, loading: loadingDictionary } = useSearchDictionary(serverId);

  const selectedServer = useMemo(
    () => servers.find(server => server.id === serverId) || null,
    [serverId, servers]
  );
  const baseUrl = selectedServer?.baseUrl ?? null;

  const activePropertyQuery = dateFieldInput.trim().length > 0 ? dateFieldInput : dateField;
  const propertyPrefix = useMemo(() => {
    const match = activePropertyQuery.match(/^([a-z0-9_-]+:)/i);
    return match ? match[1].toLowerCase() : null;
  }, [activePropertyQuery]);

  const isDateDataType = useCallback((dataType: string | null | undefined) => {
    const normalized = dataType?.trim().toLowerCase();
    return normalized === 'd:date' || normalized === 'd:datetime';
  }, []);

  useEffect(() => {
    propertyDataTypesCacheRef.current = {};
    setCurrentPropertyDataTypes({});
    setDateFieldInput('');
  }, [serverId]);

  useEffect(() => {
    if (!serverId || !baseUrl || !propertyPrefix) {
      setCurrentPropertyDataTypes({});
      setIsLoadingDynamicProps(false);
      return;
    }

    const cacheKey = `${serverId}:${propertyPrefix}`;
    const cached = propertyDataTypesCacheRef.current[cacheKey];
    const cacheTtl = 5 * 60 * 1000;

    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      setCurrentPropertyDataTypes(cached.values);
      setIsLoadingDynamicProps(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDynamicProps(true);

    backendRpc.alfresco.search
      .propertyDataTypesByPrefix(serverId, baseUrl, propertyPrefix)
      .then(propertyDataTypes => {
        if (cancelled) return;
        setCurrentPropertyDataTypes(propertyDataTypes);
        propertyDataTypesCacheRef.current[cacheKey] = {
          values: propertyDataTypes,
          timestamp: Date.now(),
        };
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load property data types', error);
        setCurrentPropertyDataTypes({});
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDynamicProps(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serverId, baseUrl, propertyPrefix]);

  const combinedPropertyDataTypes = useMemo(
    () => ({ ...dictionary.propertyDataTypes, ...currentPropertyDataTypes }),
    [currentPropertyDataTypes, dictionary.propertyDataTypes]
  );

  const availableDateFields = useMemo(() => {
    const term = dateFieldInput.toLowerCase();
    const normalizedPrefix = propertyPrefix?.toLowerCase() ?? null;
    return Object.entries(combinedPropertyDataTypes)
      .filter(
        ([prop, dataType]) =>
          isDateDataType(dataType) &&
          (!normalizedPrefix || prop.toLowerCase().startsWith(normalizedPrefix)) &&
          (term.length === 0 || prop.toLowerCase().includes(term))
      )
      .map(([prop]) => prop)
      .slice(0, 50);
  }, [combinedPropertyDataTypes, dateFieldInput, isDateDataType, propertyPrefix]);

  const findMatchingDateProperty = useCallback((input: string): string | null => {
    const value = input.trim();
    if (!value) return null;
    const lower = value.toLowerCase();
    const allDateProperties = Object.entries(combinedPropertyDataTypes)
      .filter(([, dataType]) => isDateDataType(dataType))
      .map(([prop]) => prop);
    const exact = allDateProperties.find(prop => prop.toLowerCase() === lower);
    if (exact) return exact;
    const startsWith = allDateProperties.find(prop => prop.toLowerCase().startsWith(lower));
    if (startsWith) return startsWith;
    return null;
  }, [combinedPropertyDataTypes, isDateDataType]);

  const handleSelectDateField = (prop: string) => {
    const match = findMatchingDateProperty(prop);
    if (!match) {
      return;
    }
    setDateField(match);
    setDateFieldInput('');
  };

  const selectedDateFieldDataType = useMemo(() => {
    if (!dateField) {
      return null;
    }
    const exact = combinedPropertyDataTypes[dateField];
    if (exact) {
      return exact;
    }
    const lower = dateField.toLowerCase();
    const caseInsensitive = Object.entries(combinedPropertyDataTypes).find(
      ([prop]) => prop.toLowerCase() === lower
    );
    return caseInsensitive?.[1] ?? null;
  }, [combinedPropertyDataTypes, dateField]);

  const isSelectedDateFieldValid = !dateField
    ? false
    : selectedDateFieldDataType
      ? isDateDataType(selectedDateFieldDataType)
      : true;

  const handleSave = async () => {
    if (!title.trim() || !filterQuery.trim() || !dateField.trim()) return;

    setSaving(true);
    try {
      if (isEditMode && graph) {
        await backendRpc.serverInsights.updateGraph(graph.id, {
          title: title.trim(),
          type: graphType,
          filterQuery: filterQuery.trim(),
          dateField: dateField.trim(),
          color,
          columnSpan: parseInt(columnSpan, 10),
        });
        notifications.show({
          title: t('common:success'),
          message: t('insights:graphUpdated'),
          color: 'green',
        });
      } else {
        await backendRpc.serverInsights.createGraph({
          serverId,
          title: title.trim(),
          type: graphType,
          filterQuery: filterQuery.trim(),
          dateField: dateField.trim(),
          color,
          columnSpan: parseInt(columnSpan, 10),
        });
        notifications.show({
          title: t('common:success'),
          message: t('insights:graphCreated'),
          color: 'green',
        });
      }
      onSaved();
      onClose();
    } catch (error) {
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('insights:loadError'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!graph) return;

    modals.openConfirmModal({
      title: t('insights:deleteGraph'),
      children: (
        <Text size="sm">{t('insights:deleteGraphConfirm', { name: graph.title })}</Text>
      ),
      labels: {
        confirm: t('common:delete'),
        cancel: t('common:cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await backendRpc.serverInsights.deleteGraph(graph.id);
          notifications.show({
            title: t('common:success'),
            message: t('insights:graphDeleted'),
            color: 'green',
          });
          onSaved();
          onClose();
        } catch (error) {
          notifications.show({
            title: t('common:error'),
            message: error instanceof Error ? error.message : t('insights:loadError'),
            color: 'red',
          });
        }
      },
    });
  };

  const canSave =
    title.trim().length > 0 &&
    filterQuery.trim().length > 0 &&
    dateField.trim().length > 0 &&
    isSelectedDateFieldValid;

  const inputProps = {
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
  };

  return (
    <div ref={modalContentRef}>
      <Stack gap="md">
        <TextInput
          label={t('insights:title')}
          placeholder="e.g. Folders by created date"
          value={title}
          onChange={e => setTitle(e.currentTarget.value)}
          data-field="title"
          {...inputProps}
          required
        />

        <Textarea
          label={t('insights:filterQuery')}
          description={t('insights:filterQueryDescription')}
          placeholder='e.g. TYPE:"cm:content"'
          value={filterQuery}
          onChange={e => setFilterQuery(e.currentTarget.value)}
          data-field="filterQuery"
          {...inputProps}
          minRows={2}
          autosize
          required
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('insights:dateField')} <Text component="span" c="red">*</Text>
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            {t('insights:dateFieldDescription')}
          </Text>
          <Combobox
            store={combobox}
            withinPortal={false}
            onOptionSubmit={val => {
              handleSelectDateField(val);
              combobox.closeDropdown();
            }}
          >
            <Combobox.DropdownTarget>
              <PillsInput onClick={() => combobox.openDropdown()}>
                <Pill.Group>
                  {dateField && (
                    <Pill
                      withRemoveButton
                      onRemove={() => setDateField('')}
                      styles={{ root: { borderRadius: '4px' } }}
                    >
                      {dateField}
                    </Pill>
                  )}
                  <Combobox.EventsTarget>
                    <PillsInput.Field
                      value={dateFieldInput}
                      data-field="dateField"
                      placeholder={
                        loadingDictionary
                          ? t('search:loadingPropertiesShort')
                          : dateField
                            ? undefined
                            : 'e.g. cm:created'
                      }
                      onChange={event => {
                        const value = event.currentTarget.value;
                        setDateFieldInput(value);
                        if (value.trim().length > 0) {
                          combobox.openDropdown();
                        } else {
                          combobox.closeDropdown();
                        }
                      }}
                      onFocus={() => {
                        if (dateFieldInput.trim().length > 0) {
                          combobox.openDropdown();
                        }
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (dateFieldInput.trim()) {
                            const match = findMatchingDateProperty(dateFieldInput);
                            if (match) {
                              handleSelectDateField(match);
                              combobox.closeDropdown();
                            }
                          }
                        } else if (event.key === 'Backspace' && !dateFieldInput && dateField) {
                          event.preventDefault();
                          setDateField('');
                        }
                      }}
                      {...inputProps}
                    />
                  </Combobox.EventsTarget>
                </Pill.Group>
              </PillsInput>
            </Combobox.DropdownTarget>

            <Combobox.Dropdown>
              <Combobox.Options mah={200} style={{ overflowY: 'auto' }}>
                {(loadingDictionary || isLoadingDynamicProps) && (
                  <Combobox.Empty>{t('search:loadingPropertiesShort')}</Combobox.Empty>
                )}
                {!loadingDictionary &&
                  !isLoadingDynamicProps &&
                  availableDateFields.length === 0 && (
                    <Combobox.Empty>
                      {selectedServer ? t('search:noProperties') : t('search:selectServerToLoadProps')}
                    </Combobox.Empty>
                  )}
                {availableDateFields.map(prop => (
                  <Combobox.Option value={prop} key={prop}>
                    {prop}
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
          {!isSelectedDateFieldValid && (
            <Text size="xs" c="red" mt="xs">
              {t('insights:dateFieldTypeError')}
            </Text>
          )}
        </div>

        <TextInput
          label={t('insights:chartType')}
          description={t('insights:chartTypeReadOnlyDescription')}
          value={t('insights:chartTypeArea')}
          readOnly
          leftSection={<IconLock size={14} />}
          variant="filled"
          styles={{
            input: {
              cursor: 'default',
              fontWeight: 500,
            },
          }}
        />

        <ColorInput
          label={t('insights:color')}
          value={color}
          onChange={setColor}
          swatches={[
            '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e',
            '#fab005', '#fd7e14', '#fa5252', '#e64980', '#be4bdb',
            '#7950f2', '#4c6ef5',
          ]}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('insights:columnSpan')}
          </Text>
          <SegmentedControl
            value={columnSpan}
            onChange={setColumnSpan}
            data={[
              { label: t('insights:columnSpanHalf'), value: '1' },
              { label: t('insights:columnSpanFull'), value: '2' },
            ]}
            fullWidth
          />
        </div>

        <Group justify={isEditMode ? 'space-between' : 'flex-end'} mt="md">
          {isEditMode && (
            <Tooltip label={t('insights:deleteGraph')} withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                size="lg"
                onClick={handleDelete}
                aria-label={t('insights:deleteGraph')}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t('common:cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!canSave}>
              {isEditMode ? t('common:save') : t('insights:addGraph')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </div>
  );
}
