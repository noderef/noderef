/**
 * Copyright 2025 NodeRef
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

import { backendRpc, type SavedSearch } from '@/core/ipc/backend';
import { MODAL_KEYS } from '@/core/store/keys';
import { useSavedSearchesStore } from '@/core/store/savedSearches';
import { useSearchStore } from '@/core/store/search';
import { useServersStore } from '@/core/store/servers';
import { useModal } from '@/hooks/useModal';
import { useActiveServerId } from '@/hooks/useNavigation';
import { useSearchDictionary } from '@/hooks/useSearchDictionary';
import {
  Button,
  Combobox,
  Group,
  Modal,
  Pill,
  PillsInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  useCombobox,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type SaveSearchPayload = {
  mode?: 'create' | 'edit';
  savedSearchId?: number;
  query?: string;
  serverId?: number | null;
  columns?: string[];
  name?: string;
};

const normalizeColumns = (columns: unknown): string[] => {
  if (!Array.isArray(columns)) {
    return [];
  }
  return columns
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => Boolean(item));
};

const parseStoredColumns = (columns?: string | null): string[] => {
  if (!columns) return [];
  try {
    const parsed = JSON.parse(columns);
    if (Array.isArray(parsed)) {
      return parsed.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
    }
  } catch (err) {
    console.warn('Failed to parse saved search columns', err);
  }
  return [];
};

const DEFAULT_COLUMNS = ['cm:name', 'cm:description', 'cm:modified'];

export function SaveSearchModal() {
  const { isOpen, close, payload } = useModal(MODAL_KEYS.SAVE_SEARCH);
  const { t } = useTranslation(['search', 'common']);
  const activeServerId = useActiveServerId();
  const selectedServerIds = useSearchStore(state => state.selectedServerIds);
  const searchQuery = useSearchStore(state => state.query);
  const servers = useServersStore(state => state.servers);
  const addSavedSearch = useSavedSearchesStore(state => state.addSavedSearch);
  const updateSavedSearch = useSavedSearchesStore(state => state.updateSavedSearch);
  const getSavedSearchById = useSavedSearchesStore(state => state.getSavedSearchById);

  const parsedPayload = (payload ?? {}) as SaveSearchPayload;

  const inferDefaultServerId = useMemo(() => {
    if (typeof parsedPayload.serverId === 'number') {
      return parsedPayload.serverId;
    }
    if (activeServerId) {
      return activeServerId;
    }
    if (selectedServerIds.length > 0) {
      return selectedServerIds[0] ?? null;
    }
    return null;
  }, [activeServerId, parsedPayload.serverId, selectedServerIds]);

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [serverId, setServerId] = useState<number | null>(inferDefaultServerId);
  const [columns, setColumns] = useState<string[]>(normalizeColumns(parsedPayload.columns));
  const [propertyInput, setPropertyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const propertiesCacheRef = useRef<Record<string, { values: string[]; timestamp: number }>>({});
  const [currentProperties, setCurrentProperties] = useState<string[]>([]);
  const [isLoadingDynamicProps, setIsLoadingDynamicProps] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMode('create');
      setEditingId(null);
      setName('');
      setQuery('');
      setServerId(null);
      setColumns(DEFAULT_COLUMNS);
      setPropertyInput('');
      setSaving(false);
      setInitializing(false);
      setIsDefault(false);
      return;
    }

    const requestedMode = parsedPayload.mode ?? 'create';
    setMode(requestedMode);

    if (requestedMode === 'edit' && parsedPayload.savedSearchId) {
      const targetId = parsedPayload.savedSearchId;
      setEditingId(targetId);
      const applySearch = (search: SavedSearch) => {
        setName(search.name);
        setQuery(search.query);
        setServerId(search.serverId);
        setColumns(parseStoredColumns(search.columns));
        setPropertyInput('');
        setSaving(false);
        setInitializing(false);
        setIsDefault(Boolean(search.isDefault));
      };

      const existing = getSavedSearchById(targetId);
      if (existing) {
        applySearch(existing);
        return;
      }

      setInitializing(true);
      backendRpc.savedSearches
        .get(targetId)
        .then(search => {
          if (search) {
            applySearch(search);
            addSavedSearch(search);
          } else {
            throw new Error('Saved search not found');
          }
        })
        .catch(error => {
          console.error('Failed to load saved search', error);
          notifications.show({
            title: t('common:error'),
            message: error instanceof Error ? error.message : t('search:saveError'),
            color: 'red',
          });
          setInitializing(false);
        });
      return;
    }

    setEditingId(null);
    setName(parsedPayload.name ?? '');
    setQuery(parsedPayload.query ?? searchQuery ?? '');
    setServerId(inferDefaultServerId);
    const initialColumns = normalizeColumns(parsedPayload.columns);
    setColumns(initialColumns.length > 0 ? initialColumns : DEFAULT_COLUMNS);
    setPropertyInput('');
    setSaving(false);
    setInitializing(false);
    setIsDefault(false);
  }, [
    isOpen,
    parsedPayload.mode,
    parsedPayload.savedSearchId,
    parsedPayload.query,
    parsedPayload.columns,
    parsedPayload.name,
    inferDefaultServerId,
    searchQuery,
    getSavedSearchById,
    addSavedSearch,
    t,
  ]);

  const serverOptions = useMemo(
    () => servers.map(s => ({ value: s.id.toString(), label: s.name })),
    [servers]
  );

  const { dictionary, loading: loadingDictionary } = useSearchDictionary(serverId);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const selectedServer = useMemo(
    () => (serverId ? servers.find(s => s.id === serverId) || null : null),
    [serverId, servers]
  );
  const baseUrl = selectedServer?.baseUrl ?? null;

  const propertyPrefix = useMemo(() => {
    const match = propertyInput.match(/^([a-z0-9_-]+:)/i);
    return match ? match[1].toLowerCase() : null;
  }, [propertyInput]);

  useEffect(() => {
    propertiesCacheRef.current = {};
    setCurrentProperties([]);
  }, [serverId]);

  useEffect(() => {
    if (!serverId || !baseUrl || !propertyPrefix) {
      setCurrentProperties([]);
      setIsLoadingDynamicProps(false);
      return;
    }

    const cacheKey = `${serverId}:${propertyPrefix}`;
    const cached = propertiesCacheRef.current[cacheKey];
    const CACHE_TTL = 5 * 60 * 1000;

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setCurrentProperties(cached.values);
      setIsLoadingDynamicProps(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDynamicProps(true);
    backendRpc.alfresco.search
      .propertiesByPrefix(serverId, baseUrl, propertyPrefix)
      .then(props => {
        if (cancelled) return;
        setCurrentProperties(props);
        propertiesCacheRef.current[cacheKey] = { values: props, timestamp: Date.now() };
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load properties', error);
        setCurrentProperties([]);
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

  const availableProperties = useMemo(() => {
    const term = propertyInput.toLowerCase();
    const combined = Array.from(new Set([...dictionary.properties, ...currentProperties]));
    return combined
      .filter(
        prop => !columns.includes(prop) && (term.length === 0 || prop.toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [columns, dictionary.properties, propertyInput]);

  const isValidPropertyFormat = (input: string) => /^[a-z0-9_-]+:[^:]+$/i.test(input.trim());

  const findMatchingProperty = (input: string): string | null => {
    const value = input.trim();
    if (!value) return null;
    const lower = value.toLowerCase();

    // Prefer exact match, otherwise the first property that starts with the input
    const allProperties = Array.from(new Set([...dictionary.properties, ...currentProperties]));
    const available = allProperties.filter(prop => !columns.includes(prop));
    const exact = available.find(prop => prop.toLowerCase() === lower);
    if (exact) return exact;
    const startsWith = available.find(prop => prop.toLowerCase().startsWith(lower));
    if (startsWith) return startsWith;
    if (isValidPropertyFormat(value)) {
      return value;
    }
    return null;
  };

  const handleAddColumn = (prop: string) => {
    const match = findMatchingProperty(prop);
    if (!match) {
      return;
    }
    setColumns(prev => [...prev, match]);
    setPropertyInput('');
  };

  const handleRemoveColumn = (prop: string) => {
    setColumns(prev => prev.filter(item => item !== prop));
  };

  const handleSave = async () => {
    const targetServerId = serverId;
    const trimmedName = name.trim();
    const trimmedQuery = query.trim();

    if (!targetServerId) {
      notifications.show({
        title: t('common:error'),
        message: t('search:missingServer'),
        color: 'red',
      });
      return;
    }

    if (!trimmedName) {
      notifications.show({
        title: t('common:error'),
        message: t('search:nameRequired'),
        color: 'red',
      });
      return;
    }

    if (!trimmedQuery) {
      notifications.show({
        title: t('common:error'),
        message: t('search:queryRequired'),
        color: 'red',
      });
      return;
    }

    setSaving(true);
    try {
      const payloadColumns = columns.length ? JSON.stringify(columns) : null;
      if (mode === 'edit' && editingId) {
        const updated = await backendRpc.savedSearches.update(editingId, {
          name: trimmedName,
          query: trimmedQuery,
          columns: payloadColumns,
          isDefault,
        });
        if (updated) {
          const updatedIsDefault = updated.isDefault ?? isDefault;
          updateSavedSearch(editingId, {
            name: updated.name,
            query: updated.query,
            columns: updated.columns,
            isDefault: updatedIsDefault,
          });
          if (updatedIsDefault) {
            const savedSearches = useSavedSearchesStore.getState().savedSearches;
            const conflicts = savedSearches.filter(
              search =>
                search.id !== editingId && search.serverId === updated.serverId && search.isDefault
            );

            // Demote other defaults for this server both locally and in the backend
            if (conflicts.length > 0) {
              conflicts.forEach(search => updateSavedSearch(search.id, { isDefault: false }));
              try {
                await Promise.all(
                  conflicts.map(search =>
                    backendRpc.savedSearches.update(search.id, { isDefault: false })
                  )
                );
              } catch (err) {
                console.error('Failed to clear previous default saved searches', err);
              }
            }
          }
        }
        notifications.show({
          title: t('search:savedSearchUpdated'),
          message: t('search:savedSearchUpdatedDescription'),
          color: 'green',
        });
        close();
      } else if (mode === 'edit') {
        throw new Error('Invalid saved search selection');
      } else {
        const newSearch = await backendRpc.savedSearches.create({
          serverId: targetServerId,
          name: trimmedName,
          query: trimmedQuery,
          columns: payloadColumns,
        });

        addSavedSearch(newSearch);
        notifications.show({
          title: t('search:saveSuccess'),
          message: t('search:saveSuccessDescription'),
          color: 'green',
        });
        close();
      }
    } catch (error) {
      notifications.show({
        title: t('common:error'),
        message: error instanceof Error ? error.message : t('search:saveError'),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const isEditMode = mode === 'edit';
  const formDisabled = saving || initializing;
  const modalTitle = isEditMode ? t('search:editSavedSearch') : t('search:saveSearch');
  const modalDescription = isEditMode
    ? t('search:editSavedSearchDescription')
    : t('search:saveSearchDescription');

  const columnsHelper = columns.length === 0 ? t('search:columnsHelper') : undefined;

  const canSave =
    !formDisabled && !!serverId && name.trim().length > 0 && query.trim().length > 0 && !saving;

  return (
    <Modal opened={isOpen} onClose={close} title={modalTitle} size="lg" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {modalDescription}
        </Text>

        {isEditMode && (
          <Switch
            label={t('search:setAsDefault')}
            description={t('search:setAsDefaultDescription')}
            checked={isDefault}
            onChange={event => setIsDefault(event.currentTarget.checked)}
            disabled={formDisabled}
          />
        )}

        <Select
          label={t('search:server')}
          placeholder={t('search:selectServer')}
          data={serverOptions}
          value={serverId ? serverId.toString() : null}
          onChange={value => setServerId(value ? parseInt(value, 10) : null)}
          searchable
          nothingFoundMessage={t('search:noServerAvailable')}
          disabled={formDisabled || isEditMode}
        />

        <TextInput
          label={t('search:searchName')}
          placeholder={t('search:searchNamePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          required
          disabled={formDisabled}
        />

        <Textarea
          label={t('search:searchQuery')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          minRows={4}
          autosize
          disabled={formDisabled}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t('search:columns')}
          </Text>
          {columnsHelper && (
            <Text size="xs" c="dimmed" mb="xs">
              {columnsHelper}
            </Text>
          )}
          <Combobox
            store={combobox}
            withinPortal={false}
            onOptionSubmit={val => {
              handleAddColumn(val);
              combobox.closeDropdown();
            }}
          >
            <Combobox.DropdownTarget>
              <PillsInput onClick={() => combobox.openDropdown()} disabled={formDisabled}>
                <Pill.Group>
                  {columns.map(column => (
                    <Pill
                      key={column}
                      withRemoveButton
                      onRemove={() => handleRemoveColumn(column)}
                      styles={{ root: { borderRadius: '4px' } }}
                    >
                      {column}
                    </Pill>
                  ))}
                  <Combobox.EventsTarget>
                    <PillsInput.Field
                      value={propertyInput}
                      disabled={formDisabled}
                      placeholder={
                        loadingDictionary
                          ? t('search:loadingPropertiesShort')
                          : t('search:columnsPlaceholder')
                      }
                      onChange={event => {
                        const value = event.currentTarget.value;
                        const hasColon = value.includes(':');
                        setPropertyInput(value);
                        if (hasColon) {
                          combobox.openDropdown();
                        } else {
                          combobox.closeDropdown();
                        }
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (propertyInput.trim()) {
                            const match = findMatchingProperty(propertyInput);
                            if (match) {
                              handleAddColumn(match);
                              combobox.closeDropdown();
                            }
                          }
                        } else if (
                          event.key === 'Backspace' &&
                          !propertyInput &&
                          columns.length > 0
                        ) {
                          event.preventDefault();
                          const last = columns[columns.length - 1];
                          handleRemoveColumn(last);
                        }
                      }}
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
                  availableProperties.length === 0 && (
                    <Combobox.Empty>
                      {serverId ? t('search:noProperties') : t('search:selectServerToLoadProps')}
                    </Combobox.Empty>
                  )}
                {availableProperties.map(prop => (
                  <Combobox.Option value={prop} key={prop}>
                    {prop}
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={close} disabled={formDisabled}>
            {t('common:cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>
            {isEditMode ? t('common:save') : t('common:save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
