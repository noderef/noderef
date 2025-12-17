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

import { getAiSettings, listAiModels, saveAiSettings } from '@/core/ipc/aiSettings';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { MODAL_KEYS } from '@/core/store/keys';
import { useUIStore } from '@/core/store/ui';
import { useModal } from '@/hooks/useModal';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { clipboard, os } from '@neutralinojs/lib';
import {
  IconBrandGithub,
  IconBrandX,
  IconCheck,
  IconDeviceDesktop,
  IconEye,
  IconInfoCircle,
  IconLanguage,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentVersion, getDownloadUrl, useUpdateStore } from '@/core/store/updates';
import classes from './SettingsModal.module.css';

type SettingsSection = 'view' | 'language' | 'ai' | 'about';
const DEFAULT_AI_PROVIDER = 'anthropic';
const DEFAULT_AI_MODEL = 'claude-3-5-sonnet-20241022';

interface AiModelOption {
  value: string;
  label: string;
}

export function SettingsModal() {
  const { isOpen, close } = useModal(MODAL_KEYS.SETTINGS);
  const { t } = useTranslation(['common', 'spotlight', 'settings']);
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const theme = useUIStore(state => state.theme);
  const storeLanguage = useUIStore(state => state.language);
  const setTheme = useUIStore(state => state.setTheme);
  const setStoreLanguage = useUIStore(state => state.setLanguage);

  const [activeSection, setActiveSection] = useState<SettingsSection>('view');
  const [aiProvider, setAiProvider] = useState(DEFAULT_AI_PROVIDER);
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [aiTokenInput, setAiTokenInput] = useState('');
  const [aiHasToken, setAiHasToken] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModelOptions, setAiModelOptions] = useState<AiModelOption[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiTokenValid, setAiTokenValid] = useState(false);
  const [aiTokenError, setAiTokenError] = useState<string | null>(null);

  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const isDesktopMode = useMemo(
    () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
    []
  );

  const currentVersion = getCurrentVersion();
  const checkForUpdates = useUpdateStore(state => state.checkForUpdates);
  const updateStatus = useUpdateStore(state => state.status);
  const hasUpdate = useUpdateStore(state => state.hasUpdate);
  const latestRelease = useUpdateStore(state => state.latestRelease);

  // 🔒 Single source of truth: derive from store with safe fallback
  const languageValue = storeLanguage || 'en';

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
    setTheme(newTheme);
    setColorScheme(newTheme);
  };

  const handleLanguageChange = (value: string) => {
    if (!value) return;
    setStoreLanguage(value);
  };

  // Language options with flags - sorted alphabetically by native label
  const languageOptions = [
    {
      value: 'de',
      label: t('settings:german'),
      nativeLabel: 'Deutsch',
      flagClass: 'fi fi-de',
    },
    {
      value: 'en',
      label: t('settings:english'),
      nativeLabel: 'English',
      flagClass: 'fi fi-gb',
    },
    {
      value: 'fr',
      label: t('settings:french'),
      nativeLabel: 'Français',
      flagClass: 'fi fi-fr',
    },
    {
      value: 'nl',
      label: t('settings:dutch'),
      nativeLabel: 'Nederlands',
      flagClass: 'fi fi-nl',
    },
  ];

  const aiProviderOptions = [{ value: 'anthropic', label: 'Anthropic' }];

  const latestVersion = latestRelease?.version;
  const hasUpdateAvailable = hasUpdate && Boolean(latestVersion);
  const updateDownloadUrl = getDownloadUrl(latestRelease);
  const hasCheckedAtLeastOnce = Boolean(latestRelease);
  const handleDownloadUpdate = useCallback(async () => {
    if (!hasUpdateAvailable || !latestVersion) return;
    const target = updateDownloadUrl;
    if (isNeutralinoMode()) {
      try {
        await ensureNeutralinoReady();
        await os.open(target);
        return;
      } catch (error) {
        console.warn('Neutralino open failed, falling back to window.open', error);
      }
    }
    window.open(target, '_blank', 'noreferrer');
  }, [hasUpdateAvailable, latestVersion, updateDownloadUrl]);

  // Custom paste handling for desktop mode to prevent duplicate pastes on Windows
  // and enable paste functionality on Mac
  useEffect(() => {
    if (!isOpen || !isDesktopMode) {
      return;
    }

    const getEditableTarget = (
      target: EventTarget | null
    ): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null => {
      if (!target) return null;
      let node: HTMLElement | null = null;
      if (target instanceof HTMLElement) {
        node = target;
      } else if (target instanceof Node && target.parentElement) {
        node = target.parentElement;
      }
      while (node) {
        if (
          node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement ||
          node.isContentEditable
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    // Use a processing flag to prevent concurrent paste operations
    let isProcessingPaste = false;

    const readClipboardText = async (event?: ClipboardEvent): Promise<string | null> => {
      const clipboardData = event?.clipboardData || (window as any).clipboardData;
      const textFromEvent = clipboardData?.getData?.('text/plain');
      if (textFromEvent) return textFromEvent;

      if (isDesktopMode) {
        try {
          await ensureNeutralinoReady();
          const neutralinoText = await clipboard.readText();
          if (neutralinoText) return neutralinoText;
        } catch (error) {
          console.error('Neutralino clipboard read failed:', error);
        }
      }

      if (navigator.clipboard?.readText) {
        try {
          const navigatorText = await navigator.clipboard.readText();
          if (navigatorText) return navigatorText;
        } catch {
          // Ignore
        }
      }

      return null;
    };

    const insertText = (
      editableTarget: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
      text: string
    ) => {
      if (
        editableTarget instanceof HTMLInputElement ||
        editableTarget instanceof HTMLTextAreaElement
      ) {
        const { selectionStart, selectionEnd, value } = editableTarget;
        const start = selectionStart ?? value.length;
        const end = selectionEnd ?? value.length;
        const newValue = value.slice(0, start) + text + value.slice(end);
        const cursorPos = start + text.length;

        // Identify the field using data-field attribute and update React state
        const fieldName = editableTarget.getAttribute('data-field') || '';

        if (fieldName === 'aiToken') {
          setAiTokenInput(newValue);
          if (newValue.trim().length > 0) {
            setAiTokenValid(false);
            setAiTokenError(null);
          }
        }

        // Update cursor position after React updates the DOM
        setTimeout(() => {
          if (document.activeElement === editableTarget) {
            editableTarget.setSelectionRange(cursorPos, cursorPos);
          }
        }, 0);
      } else if (editableTarget.isContentEditable) {
        document.execCommand('insertText', false, text);
      }
    };

    const handlePaste = async (event: ClipboardEvent) => {
      // If already processing a paste, immediately block this one
      if (isProcessingPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const container = modalContentRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget) return;
      if (!container.contains(editableTarget)) return;

      // Prevent default BEFORE async operations
      event.preventDefault();
      event.stopPropagation();

      // Set flag immediately to block concurrent operations
      isProcessingPaste = true;

      try {
        const text = await readClipboardText(event);
        if (text) {
          insertText(editableTarget, text);
        }
      } finally {
        // Clear flag after a short delay to prevent rapid duplicate events
        setTimeout(() => {
          isProcessingPaste = false;
        }, 50);
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'v') return;

      // If already processing a paste, immediately block this one
      if (isProcessingPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const container = modalContentRef.current;
      if (!container) return;
      const editableTarget = getEditableTarget(event.target);
      if (!editableTarget || !container.contains(editableTarget)) {
        return;
      }

      // Prevent default BEFORE async operations
      event.preventDefault();
      event.stopPropagation();

      // Set flag immediately to block concurrent operations
      isProcessingPaste = true;

      try {
        const text = await readClipboardText();
        if (text) {
          insertText(editableTarget, text);
        }
      } finally {
        // Clear flag after a short delay to prevent rapid duplicate events
        setTimeout(() => {
          isProcessingPaste = false;
        }, 50);
      }
    };

    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, isDesktopMode]);

  const fetchAiModels = useCallback(
    async ({
      token,
      provider,
      silent,
    }: { token?: string; provider?: string; silent?: boolean } = {}) => {
      const providerToUse = provider ?? aiProvider;
      if (!providerToUse) return;
      setAiModelsLoading(true);
      if (!silent) {
        setAiTokenError(null);
      }
      try {
        const response = await listAiModels({
          provider: providerToUse,
          token: token && token.length > 0 ? token : undefined,
        });
        const options: AiModelOption[] = (response.models || []).map(model => ({
          value: model.id,
          label: model.displayName || model.id,
        }));
        setAiModelOptions(options);
        setAiTokenValid(true);
        setAiTokenError(null);
        if (options.length > 0) {
          setAiModel(prev => {
            const exists = options.some(opt => opt.value === prev);
            return exists ? prev : options[0].value;
          });
        }
        if (!silent) {
          notifications.show({
            title: t('common:success'),
            message: t('settings:aiValidateSuccess'),
            color: 'green',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('settings:aiValidateError');
        setAiTokenError(message);
        setAiTokenValid(false);
        setAiModelOptions([]);
      } finally {
        setAiModelsLoading(false);
      }
    },
    [aiProvider, setAiModel, t]
  );

  const loadAiSection = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await getAiSettings();
      setAiProvider(response.provider ?? DEFAULT_AI_PROVIDER);
      setAiModel(response.model ?? DEFAULT_AI_MODEL);
      setAiHasToken(Boolean(response.hasToken));
      setAiEnabled(Boolean(response.enabled));
      setAiTokenInput('');
      setAiTokenValid(false);
      setAiTokenError(null);
      setAiModelOptions([]);
      if (response.hasToken) {
        await fetchAiModels({
          provider: response.provider ?? DEFAULT_AI_PROVIDER,
          silent: true,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common:error');
      setAiError(message);
      console.error('[SettingsModal] Failed to load AI settings', error);
    } finally {
      setAiLoading(false);
    }
  }, [fetchAiModels, t]);

  useEffect(() => {
    if (isOpen && !aiLoaded) {
      void loadAiSection().finally(() => setAiLoaded(true));
    }

    if (!isOpen && aiLoaded) {
      setAiLoaded(false);
      setAiTokenInput('');
      setAiError(null);
      setAiTokenError(null);
      setAiTokenValid(false);
      setAiModelOptions([]);
    }
  }, [isOpen, aiLoaded, loadAiSection]);

  useEffect(() => {
    if (!isOpen || activeSection !== 'about') {
      return;
    }
    void checkForUpdates();
  }, [isOpen, activeSection, checkForUpdates]);

  const handleAiSave = useCallback(async () => {
    setAiSaving(true);
    try {
      const trimmedToken = aiTokenInput.trim();
      await saveAiSettings({
        provider: aiProvider,
        model: aiModel,
        token: trimmedToken.length > 0 ? trimmedToken : undefined,
        enabled: aiEnabled,
      });
      if (trimmedToken.length > 0) {
        setAiHasToken(true);
        await fetchAiModels({
          provider: aiProvider,
          token: trimmedToken,
          silent: true,
        });
      } else if (aiHasToken) {
        await fetchAiModels({
          provider: aiProvider,
          silent: true,
        });
      }
      setAiTokenInput('');
      notifications.show({
        title: t('common:success'),
        message: t('settings:aiSaveSuccess'),
        color: 'green',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common:error');
      notifications.show({
        title: t('common:error'),
        message,
        color: 'red',
      });
    } finally {
      setAiSaving(false);
    }
  }, [aiProvider, aiModel, aiTokenInput, aiEnabled, aiHasToken, fetchAiModels, t]);

  const handleValidateToken = useCallback(async () => {
    const trimmed = aiTokenInput.trim();
    if (!trimmed && !aiHasToken) {
      setAiTokenError(t('settings:aiValidateNeedToken'));
      setAiTokenValid(false);
      return;
    }
    await fetchAiModels({
      provider: aiProvider,
      token: trimmed.length > 0 ? trimmed : undefined,
    });
  }, [aiTokenInput, aiHasToken, aiProvider, fetchAiModels, t]);

  const mainMenuItems = [
    {
      key: 'view' as SettingsSection,
      label: t('settings:view'),
      icon: IconEye,
      description: t('settings:viewDescription'),
    },
    {
      key: 'language' as SettingsSection,
      label: t('settings:language'),
      icon: IconLanguage,
      description: t('settings:languageDescription'),
    },
    {
      key: 'ai' as SettingsSection,
      label: t('settings:ai'),
      icon: IconSparkles,
      description: t('settings:aiDescription'),
    },
  ];

  const aboutMenuItem = {
    key: 'about' as SettingsSection,
    label: t('settings:about'),
    icon: IconInfoCircle,
    description: t('settings:aboutDescription'),
  };

  const menuItems = [...mainMenuItems, aboutMenuItem];

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title={
        <Group gap="xs" ml="sm">
          <IconSettings size={24} stroke={1.5} />
          <Text size="xl" fw={600}>
            {t('spotlight:settings')}
          </Text>
        </Group>
      }
      size="xl"
      centered
      trapFocus
      returnFocus
      closeOnClickOutside
      closeOnEscape
      transitionProps={{ duration: 300, transition: 'fade' }}
      withCloseButton={true}
    >
      <div ref={modalContentRef} style={{ display: 'contents' }}>
        <Group align="stretch" gap={0} style={{ height: '500px' }}>
          {/* Navbar on the left */}
          <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
              {mainMenuItems.map(item => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.key}
                    className={classes.link}
                    data-active={activeSection === item.key || undefined}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      setActiveSection(item.key);
                    }}
                  >
                    <Icon className={classes.linkIcon} stroke={1.5} />
                    <span className={classes.linkLabel}>{item.label}</span>
                  </a>
                );
              })}
            </div>
            <div className={classes.navbarFooter}>
              {(() => {
                const AboutIcon = aboutMenuItem.icon;
                return (
                  <a
                    className={classes.link}
                    data-active={activeSection === aboutMenuItem.key || undefined}
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      setActiveSection(aboutMenuItem.key);
                    }}
                  >
                    <AboutIcon className={classes.linkIcon} stroke={1.5} />
                    <span className={classes.linkLabel}>{aboutMenuItem.label}</span>
                    {hasUpdateAvailable && latestVersion && (
                      <span
                        className={classes.linkBadge}
                        aria-label={t('settings:updateAvailableShort', { version: latestVersion })}
                        title={t('settings:updateAvailableShort', { version: latestVersion })}
                      />
                    )}
                  </a>
                );
              })()}
            </div>
          </nav>

          {/* Content area on the right */}
          <Box className={classes.contentArea}>
            {(() => {
              const activeItem = menuItems.find(item => item.key === activeSection);
              if (!activeItem) return null;

              const ActiveIcon = activeItem.icon;

              return (
                <Stack gap={activeSection === 'about' ? 'md' : 'lg'}>
                  {/* Title with icon */}
                  <Group gap="sm">
                    <ActiveIcon size={24} stroke={1.5} />
                    <Text size="xl" fw={600}>
                      {activeItem.label}
                    </Text>
                  </Group>

                  {activeSection === 'about' && (
                    <Stack gap="xs">
                      {updateStatus === 'checking' && (
                        <Group gap="xs" justify="flex-start">
                          <Loader size="xs" />
                          <Text size="xs" c="dimmed">
                            {t('common:loading')}
                          </Text>
                        </Group>
                      )}
                      {hasUpdateAvailable && latestVersion && (
                        <Paper shadow="none" radius="md" p="md" className={classes.updateBanner}>
                          <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                            <Text fw={700}>
                              {t('settings:updateAvailableShort', { version: latestVersion })}
                            </Text>
                            <Button variant="filled" color="blue" onClick={handleDownloadUpdate}>
                              {t('settings:updateDownloadCta')}
                            </Button>
                          </Group>
                        </Paper>
                      )}
                    </Stack>
                  )}

                  {/* Intro text */}
                  <Text size="sm" c="dimmed">
                    {activeItem.description}
                  </Text>

                  {/* Content */}
                  {activeSection === 'view' && (
                    <Stack gap="lg" mt="md">
                      <div>
                        <Text fw={500} size="sm" mb="xs">
                          {t('common:theme')}
                        </Text>
                        <Group gap="md">
                          <Tooltip label={t('common:light')} position="top" withArrow>
                            <UnstyledButton
                              onClick={() => handleThemeChange('light')}
                              style={{
                                width: 80,
                                height: 80,
                                borderRadius: 'var(--mantine-radius-md)',
                                border:
                                  theme === 'light'
                                    ? '3px solid var(--mantine-color-blue-6)'
                                    : '2px solid var(--mantine-color-gray-3)',
                                backgroundColor: 'white',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                              }}
                            >
                              {theme === 'light' && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: -8,
                                    right: -8,
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--mantine-color-blue-6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <IconCheck size={14} color="white" stroke={3} />
                                </div>
                              )}
                            </UnstyledButton>
                          </Tooltip>

                          <Tooltip label={t('common:dark')} position="top" withArrow>
                            <UnstyledButton
                              onClick={() => handleThemeChange('dark')}
                              style={{
                                width: 80,
                                height: 80,
                                borderRadius: 'var(--mantine-radius-md)',
                                border:
                                  theme === 'dark'
                                    ? '3px solid var(--mantine-color-blue-6)'
                                    : '2px solid var(--mantine-color-gray-3)',
                                backgroundColor: '#25262b',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                              }}
                            >
                              {theme === 'dark' && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: -8,
                                    right: -8,
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--mantine-color-blue-6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <IconCheck size={14} color="white" stroke={3} />
                                </div>
                              )}
                            </UnstyledButton>
                          </Tooltip>

                          <Tooltip label={t('common:auto')} position="top" withArrow>
                            <UnstyledButton
                              onClick={() => handleThemeChange('auto')}
                              style={{
                                width: 80,
                                height: 80,
                                borderRadius: 'var(--mantine-radius-md)',
                                border:
                                  theme === 'auto'
                                    ? '3px solid var(--mantine-color-blue-6)'
                                    : '2px solid var(--mantine-color-gray-3)',
                                backgroundColor: 'white',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <IconDeviceDesktop size={32} color="var(--mantine-color-gray-6)" />
                              {theme === 'auto' && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: -8,
                                    right: -8,
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--mantine-color-blue-6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <IconCheck size={14} color="white" stroke={3} />
                                </div>
                              )}
                            </UnstyledButton>
                          </Tooltip>
                        </Group>
                      </div>
                    </Stack>
                  )}

                  {activeSection === 'language' && (
                    <Stack gap="lg" mt="md">
                      <div>
                        <Text fw={500} size="sm" mb="xs">
                          {t('settings:language')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t('settings:languageHint')}
                        </Text>
                      </div>

                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                        {languageOptions.map(lang => {
                          const isActive = languageValue === lang.value;
                          return (
                            <UnstyledButton
                              key={lang.value}
                              onClick={() => handleLanguageChange(lang.value)}
                              className={classes.languageCard}
                              data-active={isActive || undefined}
                            >
                              <Group gap="md">
                                <span
                                  className={lang.flagClass}
                                  style={{
                                    fontSize: '1.8rem',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    display: 'inline-block',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.18)',
                                  }}
                                />
                                <Stack gap={2}>
                                  <Text size="sm" fw={500}>
                                    {lang.label}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {lang.nativeLabel}
                                  </Text>
                                </Stack>
                              </Group>

                              {isActive && (
                                <IconCheck
                                  size={18}
                                  stroke={2.5}
                                  color="var(--mantine-color-blue-6)"
                                />
                              )}
                            </UnstyledButton>
                          );
                        })}
                      </SimpleGrid>
                    </Stack>
                  )}

                  {activeSection === 'ai' && (
                    <Stack gap="md" mt="md">
                      {aiError && (
                        <Alert color="red" title={t('common:error')}>
                          {aiError}
                        </Alert>
                      )}
                      {aiLoading && !aiLoaded ? (
                        <Text size="sm">{t('common:loading')}</Text>
                      ) : (
                        <>
                          <Switch
                            label={t('settings:aiToggleLabel')}
                            description={t('settings:aiToggleDescription')}
                            checked={aiEnabled}
                            onChange={event => setAiEnabled(event.currentTarget.checked)}
                            disabled={aiSaving}
                          />
                          <Select
                            label={t('settings:aiProviderLabel')}
                            data={aiProviderOptions}
                            value={aiProvider}
                            onChange={value => {
                              if (!value) return;
                              setAiProvider(value);
                              setAiTokenValid(false);
                              setAiModelOptions([]);
                              if (aiHasToken && !aiTokenInput.trim()) {
                                void fetchAiModels({ provider: value });
                              }
                            }}
                            disabled={aiSaving}
                          />
                          <Select
                            label={t('settings:aiModelLabel')}
                            data={aiModelOptions}
                            value={aiModel}
                            onChange={value => value && setAiModel(value)}
                            disabled={
                              !aiTokenValid || aiModelOptions.length === 0 || aiModelsLoading
                            }
                            placeholder={
                              aiTokenValid
                                ? t('settings:aiModelPlaceholder')
                                : t('settings:aiModelRequiresValidation')
                            }
                          />
                          <Group align="flex-end" gap="md">
                            <Box style={{ flex: 1 }}>
                              <PasswordInput
                                label={t('settings:aiTokenLabel')}
                                value={aiTokenInput}
                                onChange={event => {
                                  const value = event.currentTarget.value;
                                  setAiTokenInput(value);
                                  if (value.trim().length > 0) {
                                    setAiTokenValid(false);
                                    setAiTokenError(null);
                                  }
                                }}
                                disabled={aiSaving}
                                placeholder={
                                  aiHasToken ? t('settings:aiTokenPlaceholderSaved') : undefined
                                }
                                description={
                                  aiHasToken
                                    ? t('settings:aiTokenHelperSet')
                                    : t('settings:aiTokenHelperUnset')
                                }
                                data-field="aiToken"
                                rightSection={
                                  aiModelsLoading ? (
                                    <Loader size="xs" />
                                  ) : aiTokenValid ? (
                                    <IconCheck size={16} color="var(--mantine-color-green-6)" />
                                  ) : undefined
                                }
                              />
                            </Box>
                            <Button
                              variant="light"
                              onClick={handleValidateToken}
                              loading={aiModelsLoading}
                              disabled={
                                aiModelsLoading || (!aiHasToken && aiTokenInput.trim().length === 0)
                              }
                            >
                              {t('settings:aiValidate')}
                            </Button>
                          </Group>
                          {aiTokenError && (
                            <Text size="sm" c="red">
                              {aiTokenError}
                            </Text>
                          )}
                          <Group justify="flex-end">
                            <Button variant="subtle" onClick={close} disabled={aiSaving}>
                              {t('common:cancel')}
                            </Button>
                            <Button
                              onClick={handleAiSave}
                              loading={aiSaving}
                              disabled={!aiProvider || !aiModel}
                            >
                              {t('settings:aiSave')}
                            </Button>
                          </Group>
                        </>
                      )}
                    </Stack>
                  )}

                  {activeSection === 'about' && (
                    <Stack gap="md" mt="md" align="center">
                      <Box style={{ width: '100%', textAlign: 'center' }}>
                        <img
                          src="/assets/logo3.svg"
                          alt={t('settings:appName')}
                          style={{
                            maxWidth: '300px',
                            height: 'auto',
                            marginBottom: 'var(--mantine-spacing-md)',
                            filter: computedColorScheme === 'dark' ? 'invert(1)' : 'none',
                            display: 'block',
                            marginLeft: 'auto',
                            marginRight: 'auto',
                          }}
                        />
                        <Text size="sm" c="dimmed" mb="xs" style={{ textAlign: 'center' }}>
                          {t('settings:appVersion')} {currentVersion}
                        </Text>
                        <Text size="sm" mb="md" style={{ textAlign: 'center' }}>
                          {t('settings:appDescription')}
                        </Text>
                        <Group gap="md" justify="center" mt="sm">
                          <Tooltip label="GitHub" withArrow>
                            <ActionIcon
                              component="a"
                              href={t('settings:githubLink')}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="subtle"
                              size="lg"
                              aria-label="GitHub"
                            >
                              <IconBrandGithub size={24} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="X (Twitter)" withArrow>
                            <ActionIcon
                              component="a"
                              href={t('settings:twitterLink')}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="subtle"
                              size="lg"
                              aria-label="X (Twitter)"
                            >
                              <IconBrandX size={24} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Box>

                      {/* OOTBee Support Tools Section */}
                      <Box
                        style={{
                          width: '100%',
                          marginTop: 'var(--mantine-spacing-xl)',
                          paddingTop: 'var(--mantine-spacing-xl)',
                          borderTop: '1px solid var(--mantine-color-gray-3)',
                        }}
                      >
                        <Stack gap="sm" align="center">
                          <img
                            src="/assets/ootbee.svg"
                            alt={t('settings:ootbeeTitle')}
                            style={{
                              maxWidth: '100px',
                              height: 'auto',
                              marginBottom: 'var(--mantine-spacing-sm)',
                              display: 'block',
                              marginLeft: 'auto',
                              marginRight: 'auto',
                            }}
                          />
                          <Anchor
                            href={t('settings:ootbeeGithubLink')}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            fw={500}
                            style={{ textAlign: 'center' }}
                          >
                            {t('settings:ootbeeTitle')}
                          </Anchor>
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{ textAlign: 'center', maxWidth: '600px' }}
                          >
                            {t('settings:ootbeeDescription')}
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{ textAlign: 'center', fontStyle: 'italic' }}
                          >
                            {t('settings:ootbeeGratitude')}
                          </Text>
                        </Stack>
                      </Box>
                    </Stack>
                  )}
                </Stack>
              );
            })()}
          </Box>
        </Group>
      </div>
    </Modal>
  );
}
