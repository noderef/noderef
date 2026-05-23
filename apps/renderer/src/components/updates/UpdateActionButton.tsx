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

import { isNeutralinoMode, openExternalUrl } from '@/core/ipc/neutralino';
import {
  getAvailableUpdateVersion,
  getUpdateReleaseUrl,
  useUpdateStore,
} from '@/core/store/updates';
import { GITHUB_RELEASE_URL } from '@/core/updates/constants';
import { Button, useMantineTheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

type UpdateActionButtonProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'filled' | 'light' | 'outline' | 'subtle' | 'default';
  fullWidth?: boolean;
  /** Header toolbar: short labels and width from Update / Restart / 100% only. */
  compact?: boolean;
};

const UPDATE_ICON_SIZE: Record<NonNullable<UpdateActionButtonProps['size']>, number> = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,
};

const UPDATE_BUTTON_FONT_SIZE: Record<NonNullable<UpdateActionButtonProps['size']>, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
};

/** Horizontal space for icon, section gap, and button padding (px). */
const UPDATE_BUTTON_CHROME_PX: Record<NonNullable<UpdateActionButtonProps['size']>, number> = {
  xs: 38,
  sm: 48,
  md: 52,
  lg: 56,
  xl: 60,
};

/** Extra width for compact header buttons so labels are not tight against the edges. */
const UPDATE_BUTTON_COMPACT_EXTRA_PX = 12;

function getUpdateButtonWidthLabels(t: TFunction, compact: boolean): string[] {
  if (compact) {
    return [t('settings:updateCta'), t('settings:updateInstallRestart'), '100%'];
  }
  return [
    t('settings:updateCta'),
    t('settings:updateDownloading', { percent: 100 }),
    t('settings:updateDownloadingIndeterminate'),
    t('settings:updateInstallRestart'),
    t('settings:updateInstalling'),
  ];
}

function measureLabelWidth(text: string, font: string): number {
  if (typeof document === 'undefined') {
    return text.length * 7;
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text.length * 7;
  }
  context.font = font;
  return context.measureText(text).width;
}

function measureUpdateButtonWidth(
  size: NonNullable<UpdateActionButtonProps['size']>,
  fontFamily: string,
  labels: string[],
  compact: boolean
): number {
  const fontSize = UPDATE_BUTTON_FONT_SIZE[size];
  const font = `500 ${fontSize}px ${fontFamily}, sans-serif`;
  const labelWidth = Math.max(0, ...labels.map(label => measureLabelWidth(label, font)));
  const chrome = UPDATE_BUTTON_CHROME_PX[size] + (compact ? UPDATE_BUTTON_COMPACT_EXTRA_PX : 0);
  return Math.ceil(labelWidth + chrome);
}

export function UpdateActionButton({
  size = 'xs',
  variant = 'filled',
  fullWidth = false,
  compact = size === 'xs' && !fullWidth,
}: UpdateActionButtonProps) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const theme = useMantineTheme();
  const hasUpdate = useUpdateStore(state => state.hasUpdate);
  const status = useUpdateStore(state => state.status);
  const requiresInstaller = useUpdateStore(state => state.requiresInstaller);
  const downloadProgress = useUpdateStore(state => state.downloadProgress);
  const manifest = useUpdateStore(state => state.manifest);
  const latestRelease = useUpdateStore(state => state.latestRelease);
  const downloadUpdate = useUpdateStore(state => state.downloadUpdate);
  const installUpdate = useUpdateStore(state => state.installUpdate);

  const version = getAvailableUpdateVersion({ manifest, latestRelease });
  const releaseUrl = useUpdateStore(state => getUpdateReleaseUrl(state)) || GITHUB_RELEASE_URL;
  const isDesktop = isNeutralinoMode();
  const canUseResourcesUpdater = isDesktop && !requiresInstaller && Boolean(manifest);

  const openReleasePage = useCallback(async () => {
    await openExternalUrl(releaseUrl);
  }, [releaseUrl]);

  const showUpdateButton = hasUpdate && Boolean(version) && status !== 'checking';

  const label = useMemo(() => {
    if (!version) return '';
    if (compact) {
      if (status === 'installing' || status === 'downloaded') {
        return t('settings:updateInstallRestart');
      }
      if (status === 'downloading') {
        return downloadProgress === null ? '' : `${downloadProgress}%`;
      }
      return t('settings:updateCta');
    }
    if (status === 'installing') {
      return t('settings:updateInstalling');
    }
    if (status === 'downloaded') {
      return t('settings:updateInstallRestart');
    }
    if (status === 'downloading') {
      if (downloadProgress === null) {
        return t('settings:updateDownloadingIndeterminate');
      }
      return t('settings:updateDownloading', { percent: downloadProgress });
    }
    return t('settings:updateCta');
  }, [compact, downloadProgress, status, t, version]);

  const fixedButtonWidth = useMemo(() => {
    const labels = getUpdateButtonWidthLabels(t, compact);
    return measureUpdateButtonWidth(size, theme.fontFamily ?? 'system-ui', labels, compact);
  }, [compact, i18n.language, size, t, theme.fontFamily]);

  const handleClick = useCallback(async () => {
    if (!version) return;

    if (requiresInstaller || !canUseResourcesUpdater) {
      await openReleasePage();
      return;
    }

    try {
      if (status === 'downloaded' || status === 'installing') {
        await installUpdate();
        return;
      }
      if (status === 'available' || status === 'error') {
        await downloadUpdate();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common:error');
      notifications.show({
        title: t('settings:updateFailedTitle'),
        message,
        color: 'red',
        autoClose: 6000,
      });
    }
  }, [
    canUseResourcesUpdater,
    downloadUpdate,
    installUpdate,
    openReleasePage,
    requiresInstaller,
    status,
    t,
    version,
  ]);

  if (!showUpdateButton) {
    return null;
  }

  const isBusy = status === 'downloading' || status === 'installing';
  const showIndeterminateLoader = status === 'downloading' && downloadProgress === null;
  const showRestartIcon = status === 'downloaded' || status === 'installing';
  const iconSize = UPDATE_ICON_SIZE[size];
  const iconProps = { size: iconSize, stroke: 1.75 } as const;

  return (
    <Button
      size={size}
      variant={variant}
      color="blue"
      fullWidth={fullWidth}
      onClick={() => void handleClick()}
      disabled={isBusy}
      loading={showIndeterminateLoader}
      loaderProps={{ type: 'oval' }}
      leftSection={
        showIndeterminateLoader ? undefined : showRestartIcon ? (
          <IconRefresh {...iconProps} />
        ) : (
          <IconDownload {...iconProps} />
        )
      }
      styles={{
        root: fullWidth
          ? undefined
          : {
              width: fixedButtonWidth,
              minWidth: fixedButtonWidth,
              maxWidth: fixedButtonWidth,
            },
        label: {
          whiteSpace: 'nowrap',
        },
      }}
    >
      {label}
    </Button>
  );
}
