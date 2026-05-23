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

import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import {
  getAvailableUpdateVersion,
  getUpdateReleaseUrl,
  useUpdateStore,
} from '@/core/store/updates';
import { GITHUB_RELEASE_URL } from '@/core/updates/constants';
import { Button, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type UpdateActionButtonProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'filled' | 'light' | 'outline' | 'subtle' | 'default';
  fullWidth?: boolean;
};

export function UpdateActionButton({
  size = 'xs',
  variant = 'filled',
  fullWidth = false,
}: UpdateActionButtonProps) {
  const { t } = useTranslation(['settings', 'common']);
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
    if (isNeutralinoMode()) {
      try {
        await ensureNeutralinoReady();
        const NL = (window as Window).Neutralino;
        if (NL?.os?.open) {
          await NL.os.open(releaseUrl);
          return;
        }
      } catch (error) {
        console.warn('[updates] Neutralino open failed, falling back to window.open', error);
      }
    }
    window.open(releaseUrl, '_blank', 'noreferrer');
  }, [releaseUrl]);

  const showUpdateButton = hasUpdate && Boolean(version) && status !== 'checking';

  const label = useMemo(() => {
    if (!version) return '';
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
    if (requiresInstaller || !canUseResourcesUpdater) {
      return t('settings:updateDownloadCta');
    }
    return t('settings:updateDownloadVersion', { version });
  }, [canUseResourcesUpdater, downloadProgress, requiresInstaller, status, t, version]);

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
  const showLoader = status === 'downloading' && downloadProgress === null;

  return (
    <Button
      size={size}
      variant={variant}
      fullWidth={fullWidth}
      onClick={() => void handleClick()}
      disabled={isBusy}
      leftSection={showLoader ? <Loader size={14} color="white" /> : undefined}
    >
      {label}
    </Button>
  );
}
