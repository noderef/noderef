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

import {
  getAiSettings,
  getMaskingSettings,
  listAiModels,
  listAiProviders,
  previewMasking,
  saveAiSettings,
  saveMaskingSettings,
  type LlmMaskingConfig,
  type TextRegexRule,
} from '@/core/ipc/aiSettings';
import { ensureNeutralinoReady, isNeutralinoMode } from '@/core/ipc/neutralino';
import { MODAL_KEYS } from '@/core/store/keys';
import { useUIStore } from '@/core/store/ui';
import { getCurrentVersion, getDownloadUrl, useUpdateStore } from '@/core/store/updates';
import { useDesktopClipboardHandlers } from '@/hooks/useDesktopClipboardHandlers';
import { useModal } from '@/hooks/useModal';
import {
  ActionIcon,
  Alert,
  Anchor,
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
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { os } from '@neutralinojs/lib';
import {
  IconBrandGithub,
  IconBrandX,
  IconCheck,
  IconDeviceDesktop,
  IconEye,
  IconEyeOff,
  IconInfoCircle,
  IconLanguage,
  IconSettings,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './SettingsModal.module.css';

type SettingsSection = 'view' | 'language' | 'ai' | 'masking' | 'about';
const DEFAULT_AI_PROVIDER = 'anthropic';
const DEFAULT_AI_MODEL = 'claude-3-5-sonnet-20241022';

interface AiModelOption {
  value: string;
  label: string;
}

interface AiProviderOption {
  value: string;
  label: string;
  defaultModel: string;
  hasToken: boolean;
}

const FALLBACK_AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    value: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-sonnet-20241022',
    hasToken: false,
  },
  {
    value: 'minimax',
    label: 'MiniMax',
    defaultModel: 'M2.1',
    hasToken: false,
  },
];

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
  const [aiProviderOptions, setAiProviderOptions] = useState<AiProviderOption[]>(
    FALLBACK_AI_PROVIDER_OPTIONS
  );
  const [aiModelOptions, setAiModelOptions] = useState<AiModelOption[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiTokenValid, setAiTokenValid] = useState(false);
  const [aiTokenError, setAiTokenError] = useState<string | null>(null);

  // Masking state
  const [maskingConfig, setMaskingConfig] = useState<LlmMaskingConfig | null>(null);
  const [maskingLoading, setMaskingLoading] = useState(false);
  const [maskingLoaded, setMaskingLoaded] = useState(false);
  const [maskingSaving, setMaskingSaving] = useState(false);
  const [maskingError, setMaskingError] = useState<string | null>(null);
  const [maskingTestInput, setMaskingTestInput] = useState('');
  const [maskingTestOutput, setMaskingTestOutput] = useState('');
  const [maskingTestStats, setMaskingTestStats] = useState<{
    maskedFields: number;
    regexHits: number;
  } | null>(null);
  const [maskingTestRunning, setMaskingTestRunning] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const testModalContentRef = useRef<HTMLDivElement | null>(null);
  const maskingTestInputRef = useRef<HTMLTextAreaElement | null>(null);
  const maskingTestOutputRef = useRef<HTMLTextAreaElement | null>(null);
  const maskingTestScrollSyncingRef = useRef(false);
  const isDesktopMode = useMemo(
    () => typeof window !== 'undefined' && isNeutralinoMode() && !!(window as any).Neutralino,
    []
  );
  const handleInsertText = useCallback(
    (editableTarget: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string) => {
      if (
        editableTarget instanceof HTMLInputElement ||
        editableTarget instanceof HTMLTextAreaElement
      ) {
        const { selectionStart, selectionEnd, value } = editableTarget;
        const start = selectionStart ?? value.length;
        const end = selectionEnd ?? value.length;
        const newValue = value.slice(0, start) + text + value.slice(end);
        const cursorPos = start + text.length;
        const fieldName = editableTarget.getAttribute('data-field') || '';

        if (fieldName === 'aiToken') {
          setAiTokenInput(newValue);
          if (newValue.trim().length > 0) {
            setAiTokenValid(false);
            setAiTokenError(null);
          }
        } else {
          editableTarget.setRangeText(text, start, end, 'end');
          editableTarget.dispatchEvent(new Event('input', { bubbles: true }));
        }

        setTimeout(() => {
          if (document.activeElement === editableTarget) {
            editableTarget.setSelectionRange(cursorPos, cursorPos);
          }
        }, 0);
      } else if (editableTarget.isContentEditable) {
        document.execCommand('insertText', false, text);
      }
    },
    [setAiTokenInput, setAiTokenValid, setAiTokenError]
  );

  useDesktopClipboardHandlers({
    isEnabled: isOpen && isDesktopMode,
    containerRef: modalContentRef,
    onInsertText: handleInsertText,
    enableCopyCut: true,
  });
  useDesktopClipboardHandlers({
    isEnabled: isOpen && isDesktopMode && testModalOpen,
    containerRef: testModalContentRef,
    onInsertText: handleInsertText,
    enableCopyCut: true,
  });

  const syncMaskingTestScroll = useCallback((source: 'input' | 'output') => {
    if (maskingTestScrollSyncingRef.current) return;

    const sourceEl =
      source === 'input' ? maskingTestInputRef.current : maskingTestOutputRef.current;
    const targetEl =
      source === 'input' ? maskingTestOutputRef.current : maskingTestInputRef.current;
    if (!sourceEl || !targetEl) return;

    const sourceMax = Math.max(0, sourceEl.scrollHeight - sourceEl.clientHeight);
    const targetMax = Math.max(0, targetEl.scrollHeight - targetEl.clientHeight);
    const progress = sourceMax > 0 ? sourceEl.scrollTop / sourceMax : 0;

    maskingTestScrollSyncingRef.current = true;
    targetEl.scrollTop = progress * targetMax;
    requestAnimationFrame(() => {
      maskingTestScrollSyncingRef.current = false;
    });
  }, []);

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

  const aiProviderDefaultModelMap = useMemo(() => {
    return new Map(aiProviderOptions.map(option => [option.value, option.defaultModel]));
  }, [aiProviderOptions]);

  const resolveDefaultModelForProvider = useCallback(
    (provider: string | null | undefined) => {
      return aiProviderDefaultModelMap.get(provider ?? '') ?? DEFAULT_AI_MODEL;
    },
    [aiProviderDefaultModelMap]
  );

  const latestVersion = latestRelease?.version;
  const hasUpdateAvailable = hasUpdate && Boolean(latestVersion);
  const updateDownloadUrl = getDownloadUrl(latestRelease);
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

  const handleOpenUrl = useCallback(async (url: string) => {
    if (isNeutralinoMode()) {
      try {
        await ensureNeutralinoReady();
        await os.open(url);
        return;
      } catch (error) {
        console.warn('Neutralino open failed, falling back to window.open', error);
      }
    }
    window.open(url, '_blank', 'noreferrer');
  }, []);

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
        } else {
          setAiModel(resolveDefaultModelForProvider(providerToUse));
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
    [aiProvider, resolveDefaultModelForProvider, setAiModel, t]
  );

  const loadAiSection = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const providerCatalog = await listAiProviders().catch(error => {
        console.warn('[SettingsModal] Failed to load AI provider catalog', error);
        return null;
      });

      const resolvedProviderOptions =
        providerCatalog?.providers && providerCatalog.providers.length > 0
          ? providerCatalog.providers.map(provider => ({
              value: provider.id,
              label: provider.label,
              defaultModel: provider.defaultModel,
              hasToken: provider.hasToken,
            }))
          : FALLBACK_AI_PROVIDER_OPTIONS;

      setAiProviderOptions(resolvedProviderOptions);

      const response = await getAiSettings();
      const providerFromSettings = response.provider ?? providerCatalog?.defaultProvider;
      const providerExists = resolvedProviderOptions.some(
        option => option.value === providerFromSettings
      );
      const resolvedProvider =
        providerExists && providerFromSettings
          ? providerFromSettings
          : (providerCatalog?.defaultProvider ??
            resolvedProviderOptions[0]?.value ??
            DEFAULT_AI_PROVIDER);
      const providerDefaultModel =
        resolvedProviderOptions.find(option => option.value === resolvedProvider)?.defaultModel ??
        DEFAULT_AI_MODEL;
      const providerHasToken = Boolean(
        resolvedProviderOptions.find(option => option.value === resolvedProvider)?.hasToken
      );

      setAiProvider(resolvedProvider);
      setAiModel(response.model ?? providerDefaultModel);
      setAiHasToken(providerHasToken);
      setAiEnabled(Boolean(response.enabled));
      setAiTokenInput('');
      setAiTokenValid(false);
      setAiTokenError(null);
      setAiModelOptions([]);
      if (providerHasToken) {
        await fetchAiModels({
          provider: resolvedProvider,
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
        setAiProviderOptions(prev =>
          prev.map(option => (option.value === aiProvider ? { ...option, hasToken: true } : option))
        );
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

  // ── Masking callbacks ─────────────────────────────────────────────────────

  const loadMaskingSection = useCallback(async () => {
    setMaskingLoading(true);
    setMaskingError(null);
    try {
      const config = await getMaskingSettings();
      setMaskingConfig(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common:error');
      setMaskingError(message);
    } finally {
      setMaskingLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen && activeSection === 'masking' && !maskingLoaded) {
      void loadMaskingSection().finally(() => setMaskingLoaded(true));
    }
    if (!isOpen && maskingLoaded) {
      setMaskingLoaded(false);
      setMaskingConfig(null);
      setMaskingTestInput('');
      setMaskingTestOutput('');
      setMaskingTestStats(null);
    }
  }, [isOpen, activeSection, maskingLoaded, loadMaskingSection]);

  const updateMaskingConfig = useCallback((update: Partial<LlmMaskingConfig>) => {
    setMaskingConfig(prev => (prev ? { ...prev, ...update } : prev));
  }, []);

  const handleMaskingSave = useCallback(async () => {
    if (!maskingConfig) return;
    setMaskingSaving(true);
    try {
      await saveMaskingSettings(maskingConfig);
      notifications.show({
        title: t('common:success'),
        message: t('settings:maskingSaveSuccess'),
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
      setMaskingSaving(false);
    }
  }, [maskingConfig, t]);

  const handleMaskingTestRun = useCallback(async () => {
    if (!maskingConfig || !maskingTestInput.trim()) return;
    setMaskingTestRunning(true);
    try {
      const result = await previewMasking({
        config: maskingConfig,
        input: maskingTestInput,
      });
      setMaskingTestOutput(
        typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)
      );
      setMaskingTestStats(result.stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common:error');
      setMaskingTestOutput(`Error: ${message}`);
      setMaskingTestStats(null);
    } finally {
      setMaskingTestRunning(false);
    }
  }, [maskingConfig, maskingTestInput, t]);

  const addTextRegexRule = useCallback(() => {
    setMaskingConfig(prev => {
      if (!prev) return prev;
      const newRule: TextRegexRule = {
        id: `rule_${Date.now()}`,
        pattern: '',
        flags: 'gi',
        replacement: '[REDACTED]',
      };
      return { ...prev, textRegexRules: [...prev.textRegexRules, newRule] };
    });
  }, []);

  const updateTextRegexRule = useCallback((id: string, update: Partial<TextRegexRule>) => {
    setMaskingConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        textRegexRules: prev.textRegexRules.map(rule =>
          rule.id === id ? { ...rule, ...update } : rule
        ),
      };
    });
  }, []);

  const removeTextRegexRule = useCallback((id: string) => {
    setMaskingConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        textRegexRules: prev.textRegexRules.filter(rule => rule.id !== id),
      };
    });
  }, []);

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
    {
      key: 'masking' as SettingsSection,
      label: t('settings:masking'),
      icon: IconEyeOff,
      description: t('settings:maskingDescription'),
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
                              const providerOption = aiProviderOptions.find(
                                option => option.value === value
                              );
                              const hasStoredToken = Boolean(providerOption?.hasToken);
                              setAiProvider(value);
                              setAiModel(resolveDefaultModelForProvider(value));
                              setAiHasToken(hasStoredToken);
                              setAiTokenValid(false);
                              setAiModelOptions([]);
                              if (hasStoredToken && !aiTokenInput.trim()) {
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

                  {activeSection === 'masking' && (
                    <Stack gap="md" mt="md">
                      {maskingError && (
                        <Alert color="red" title={t('common:error')}>
                          {maskingError}
                        </Alert>
                      )}
                      {maskingLoading && !maskingLoaded ? (
                        <Text size="sm">{t('common:loading')}</Text>
                      ) : !maskingConfig ? (
                        !maskingError && (
                          <Text size="sm" c="dimmed">
                            {t('settings:maskingNoProvider')}
                          </Text>
                        )
                      ) : (
                        <>
                          <Switch
                            label={t('settings:maskingToggleLabel')}
                            description={t('settings:maskingToggleDescription')}
                            checked={maskingConfig.enabled}
                            onChange={event =>
                              updateMaskingConfig({ enabled: event.currentTarget.checked })
                            }
                            disabled={maskingSaving}
                          />

                          <Select
                            label={t('settings:maskingMode')}
                            data={[
                              { value: 'tokenize', label: t('settings:maskingModeTokenize') },
                              { value: 'redact', label: t('settings:maskingModeRedact') },
                            ]}
                            value={maskingConfig.mode}
                            onChange={value =>
                              value && updateMaskingConfig({ mode: value as 'tokenize' | 'redact' })
                            }
                            disabled={maskingSaving}
                            description={
                              maskingConfig.mode === 'tokenize'
                                ? t('settings:maskingModeTokenizeHint')
                                : t('settings:maskingModeRedactHint')
                            }
                          />

                          <TagsInput
                            label={t('settings:maskingExactKeys')}
                            description={t('settings:maskingExactKeysHint')}
                            placeholder={
                              maskingConfig.propertyRules.exact.length === 0
                                ? t('settings:maskingExactKeysPlaceholder')
                                : undefined
                            }
                            value={maskingConfig.propertyRules.exact}
                            onChange={exact =>
                              updateMaskingConfig({
                                propertyRules: { ...maskingConfig.propertyRules, exact },
                              })
                            }
                            disabled={maskingSaving}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />

                          <TagsInput
                            label={t('settings:maskingPrefixes')}
                            description={t('settings:maskingPrefixesHint')}
                            placeholder={
                              maskingConfig.propertyRules.prefixes.length === 0
                                ? t('settings:maskingPrefixesPlaceholder')
                                : undefined
                            }
                            value={maskingConfig.propertyRules.prefixes}
                            onChange={prefixes =>
                              updateMaskingConfig({
                                propertyRules: { ...maskingConfig.propertyRules, prefixes },
                              })
                            }
                            disabled={maskingSaving}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />

                          <TagsInput
                            label={t('settings:maskingRegexKeys')}
                            description={t('settings:maskingRegexKeysHint')}
                            placeholder={
                              maskingConfig.propertyRules.regex.length === 0
                                ? t('settings:maskingRegexKeysPlaceholder')
                                : undefined
                            }
                            value={maskingConfig.propertyRules.regex}
                            onChange={regex =>
                              updateMaskingConfig({
                                propertyRules: { ...maskingConfig.propertyRules, regex },
                              })
                            }
                            disabled={maskingSaving}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />

                          <TagsInput
                            label={t('settings:maskingPreserveKeys')}
                            description={t('settings:maskingPreserveKeysHint')}
                            placeholder={
                              maskingConfig.preserveKeys.length === 0
                                ? t('settings:maskingPreserveKeysPlaceholder')
                                : undefined
                            }
                            value={maskingConfig.preserveKeys}
                            onChange={preserveKeys => updateMaskingConfig({ preserveKeys })}
                            disabled={maskingSaving}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />

                          <div>
                            <Group justify="space-between" mb="xs">
                              <Text fw={500} size="sm">
                                {t('settings:maskingTextRegex')}
                              </Text>
                              <Button
                                variant="light"
                                size="xs"
                                onClick={addTextRegexRule}
                                disabled={maskingSaving}
                              >
                                {t('settings:maskingAddRule')}
                              </Button>
                            </Group>
                            <Text size="xs" c="dimmed" mb="sm">
                              {t('settings:maskingTextRegexHint')}
                            </Text>
                            <Stack gap="xs">
                              {maskingConfig.textRegexRules.map(rule => (
                                <Group key={rule.id} gap="xs" align="flex-end">
                                  <TextInput
                                    label={t('settings:maskingPattern')}
                                    size="xs"
                                    style={{ flex: 3 }}
                                    placeholder={t('settings:maskingPatternPlaceholder')}
                                    value={rule.pattern}
                                    onChange={e =>
                                      updateTextRegexRule(rule.id, {
                                        pattern: e.currentTarget.value,
                                      })
                                    }
                                    disabled={maskingSaving}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                  />
                                  <TextInput
                                    label={t('settings:maskingFlags')}
                                    size="xs"
                                    style={{ flex: 1 }}
                                    value={rule.flags || ''}
                                    onChange={e =>
                                      updateTextRegexRule(rule.id, { flags: e.currentTarget.value })
                                    }
                                    disabled={maskingSaving}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                  />
                                  <TextInput
                                    label={t('settings:maskingReplacement')}
                                    size="xs"
                                    style={{ flex: 2 }}
                                    value={rule.replacement}
                                    onChange={e =>
                                      updateTextRegexRule(rule.id, {
                                        replacement: e.currentTarget.value,
                                      })
                                    }
                                    disabled={maskingSaving}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                  />
                                  <Tooltip label={t('settings:maskingRemove')} withArrow>
                                    <ActionIcon
                                      variant="subtle"
                                      color="red"
                                      size="sm"
                                      onClick={() => removeTextRegexRule(rule.id)}
                                      disabled={maskingSaving}
                                    >
                                      <IconTrash size={14} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              ))}
                            </Stack>
                          </div>

                          <Group justify="space-between">
                            <Button
                              variant="light"
                              onClick={() => setTestModalOpen(true)}
                              disabled={maskingSaving}
                            >
                              {t('settings:maskingTestTitle')}
                            </Button>
                            <Group justify="flex-end">
                              <Button variant="subtle" onClick={close} disabled={maskingSaving}>
                                {t('common:cancel')}
                              </Button>
                              <Button onClick={handleMaskingSave} loading={maskingSaving}>
                                {t('settings:maskingSave')}
                              </Button>
                            </Group>
                          </Group>
                        </>
                      )}
                    </Stack>
                  )}

                  {/* Test Masking Modal */}
                  <Modal
                    opened={testModalOpen}
                    onClose={() => setTestModalOpen(false)}
                    title={
                      <Group gap="xs">
                        <IconEyeOff size={22} stroke={1.5} />
                        <Title order={4}>{t('settings:maskingTestTitle')}</Title>
                      </Group>
                    }
                    size="90vw"
                    radius="lg"
                    trapFocus
                    returnFocus
                    closeOnEscape
                    closeOnClickOutside
                    centered
                    styles={{
                      content: { maxWidth: '1280px' },
                      body: { padding: 'var(--mantine-spacing-xl)' },
                    }}
                  >
                    <div ref={testModalContentRef}>
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                        <Stack gap="xs">
                          <Text fw={500} size="sm">
                            {t('settings:maskingTestInput')}
                          </Text>
                          <Paper
                            withBorder
                            p={0}
                            radius="md"
                            style={{ overflow: 'hidden', height: '56vh', minHeight: 420 }}
                          >
                            <Textarea
                              ref={maskingTestInputRef}
                              value={maskingTestInput}
                              onChange={e => setMaskingTestInput(e.currentTarget.value)}
                              onScroll={() => syncMaskingTestScroll('input')}
                              variant="unstyled"
                              styles={{
                                root: {
                                  height: '100%',
                                },
                                wrapper: {
                                  height: '100%',
                                },
                                input: {
                                  padding: '6px 8px',
                                  boxSizing: 'border-box',
                                  height: '100%',
                                  minHeight: '100%',
                                  overflowY: 'auto',
                                  resize: 'none',
                                  lineHeight: '1.4',
                                  fontSize: '14px',
                                  fontFamily:
                                    'var(--mantine-font-family-monospace, Menlo, Monaco, Consolas, monospace)',
                                },
                              }}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                            />
                          </Paper>
                        </Stack>
                        <Stack gap="xs">
                          <Text fw={500} size="sm">
                            {t('settings:maskingTestOutput')}
                          </Text>
                          <Paper
                            withBorder
                            p={0}
                            radius="md"
                            style={{ overflow: 'hidden', height: '56vh', minHeight: 420 }}
                          >
                            <Textarea
                              ref={maskingTestOutputRef}
                              value={maskingTestOutput}
                              readOnly
                              onScroll={() => syncMaskingTestScroll('output')}
                              variant="unstyled"
                              styles={{
                                root: {
                                  height: '100%',
                                },
                                wrapper: {
                                  height: '100%',
                                },
                                input: {
                                  padding: '6px 8px',
                                  boxSizing: 'border-box',
                                  height: '100%',
                                  minHeight: '100%',
                                  overflowY: 'auto',
                                  resize: 'none',
                                  lineHeight: '1.4',
                                  fontSize: '14px',
                                  fontFamily:
                                    'var(--mantine-font-family-monospace, Menlo, Monaco, Consolas, monospace)',
                                },
                              }}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                            />
                          </Paper>
                        </Stack>
                      </SimpleGrid>
                      {maskingTestStats && (
                        <Text size="xs" c="dimmed" mt="xs">
                          {t('settings:maskingTestStats', {
                            fields: maskingTestStats.maskedFields,
                            regex: maskingTestStats.regexHits,
                          })}
                        </Text>
                      )}
                      <Group justify="flex-end" mt="md">
                        <Button
                          variant="light"
                          onClick={handleMaskingTestRun}
                          loading={maskingTestRunning}
                          disabled={!maskingTestInput.trim()}
                        >
                          {t('settings:maskingTestRun')}
                        </Button>
                      </Group>
                    </div>
                  </Modal>

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
                              onClick={() => handleOpenUrl(t('settings:githubLink'))}
                              variant="subtle"
                              size="lg"
                              aria-label="GitHub"
                            >
                              <IconBrandGithub size={24} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="X (Twitter)" withArrow>
                            <ActionIcon
                              onClick={() => handleOpenUrl(t('settings:twitterLink'))}
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
                            onClick={() => handleOpenUrl(t('settings:ootbeeGithubLink'))}
                            size="sm"
                            fw={500}
                            style={{ textAlign: 'center', cursor: 'pointer' }}
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
