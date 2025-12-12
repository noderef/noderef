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

import { Button, Group, Select, Stack, Switch, TextInput, Textarea } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiteVisibility } from '@/core/ipc/backend';

export interface CreateSiteFormValues {
  title: string;
  siteId?: string;
  description?: string;
  visibility: SiteVisibility;
  skipAddToFavorites: boolean;
}

interface CreateSiteFormProps {
  mode?: 'create' | 'edit';
  initialValues?: Partial<CreateSiteFormValues>;
  onSubmit: (values: CreateSiteFormValues) => Promise<void>;
  onCancel: () => void;
}

export function CreateSiteForm({
  mode = 'create',
  initialValues,
  onSubmit,
  onCancel,
}: CreateSiteFormProps) {
  const isEditMode = mode === 'edit';
  const { t } = useTranslation(['submenu', 'common']);
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [siteId, setSiteId] = useState(initialValues?.siteId ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [visibility, setVisibility] = useState<SiteVisibility>(
    initialValues?.visibility ?? 'PUBLIC'
  );
  const [skipAddToFavorites, setSkipAddToFavorites] = useState(
    initialValues?.skipAddToFavorites ?? false
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const [siteIdError, setSiteIdError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [siteIdTouched, setSiteIdTouched] = useState(isEditMode || Boolean(initialValues?.siteId));
  const titleInputRef = useRef<HTMLInputElement>(null);

  const buildSiteId = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const autoSiteId = useMemo(() => buildSiteId(title), [title]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (isEditMode) return;
    if (siteIdTouched) return;
    setSiteId(autoSiteId);
  }, [autoSiteId, isEditMode, siteIdTouched]);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedId = buildSiteId(siteId.trim());
    const trimmedDescription = description.trim();
    let hasErrors = false;

    if (!trimmedTitle) {
      setTitleError(t('submenu:createSiteTitleRequired'));
      hasErrors = true;
    } else {
      setTitleError(null);
    }

    if (trimmedId && !/^[A-Za-z0-9-]+$/.test(trimmedId)) {
      setSiteIdError(t('submenu:createSiteIdInvalid'));
      hasErrors = true;
    } else {
      setSiteIdError(null);
    }

    if (hasErrors) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title: trimmedTitle,
        siteId: trimmedId || undefined,
        description: trimmedDescription ? trimmedDescription : undefined,
        visibility,
        skipAddToFavorites,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="sm">
      <TextInput
        ref={titleInputRef}
        label={t('submenu:createSiteTitleLabel')}
        placeholder={t('submenu:createSiteTitlePlaceholder')}
        value={title}
        onChange={event => setTitle(event.currentTarget.value)}
        error={titleError}
        required
        data-autofocus
      />
      <TextInput
        label={t('submenu:createSiteIdLabel')}
        placeholder={t('submenu:createSiteIdPlaceholder')}
        description={isEditMode ? t('submenu:editSiteIdHelper') : t('submenu:createSiteIdHelper')}
        value={siteId}
        onChange={event => {
          const sanitized = buildSiteId(event.currentTarget.value);
          setSiteIdTouched(sanitized.length > 0);
          setSiteId(sanitized);
        }}
        error={siteIdError}
        disabled={isEditMode}
      />
      <Textarea
        label={t('submenu:createSiteDescriptionLabel')}
        placeholder={t('submenu:createSiteDescriptionPlaceholder')}
        value={description}
        minRows={2}
        onChange={event => setDescription(event.currentTarget.value)}
      />
      <Select
        label={t('submenu:createSiteVisibilityLabel')}
        data={[
          { value: 'PUBLIC', label: t('submenu:createSiteVisibilityPublic') },
          { value: 'PRIVATE', label: t('submenu:createSiteVisibilityPrivate') },
          { value: 'MODERATED', label: t('submenu:createSiteVisibilityModerated') },
        ]}
        value={visibility}
        onChange={value => setVisibility((value as SiteVisibility | null) ?? 'PUBLIC')}
        allowDeselect={false}
      />
      {!isEditMode && (
        <Switch
          label={t('submenu:createSiteSkipFavorites')}
          description={t('submenu:createSiteSkipFavoritesHint')}
          checked={skipAddToFavorites}
          onChange={event => setSkipAddToFavorites(event.currentTarget.checked)}
        />
      )}
      <Group justify="flex-end" gap="sm" mt="sm">
        <Button variant="subtle" onClick={onCancel} disabled={submitting}>
          {t('common:cancel')}
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {isEditMode ? t('submenu:editSiteSubmit') : t('submenu:createSiteSubmit')}
        </Button>
      </Group>
    </Stack>
  );
}
