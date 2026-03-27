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
 * Agent model selection — localStorage persistence, scope hierarchy,
 * and AI provider/model loading logic used by the agent composer.
 */

import { getAiSettings, listAiModels, listAiProviders } from '@/core/ipc/aiSettings';
import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiProviderOption {
  value: string;
  label: string;
  defaultModel: string;
}

export interface AiModelChoice {
  value: string;
  label: string;
  provider: string;
  model: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_MODEL_SELECTION_STORAGE_KEY = 'agent.selected.model.v1';
const MODEL_SELECTION_GLOBAL_SCOPE = 'global';

// ── Persistence helpers ───────────────────────────────────────────────────────

const readModelSelectionStore = (): Record<string, { provider: string; model: string }> => {
  try {
    const raw = window.localStorage.getItem(AGENT_MODEL_SELECTION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const legacyProvider = (parsed as { provider?: unknown }).provider;
    const legacyModel = (parsed as { model?: unknown }).model;
    if (typeof legacyProvider === 'string' && typeof legacyModel === 'string') {
      return {
        [MODEL_SELECTION_GLOBAL_SCOPE]: {
          provider: legacyProvider,
          model: legacyModel,
        },
      };
    }

    const result: Record<string, { provider: string; model: string }> = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const provider = (value as { provider?: unknown }).provider;
      const model = (value as { model?: unknown }).model;
      if (typeof provider === 'string' && typeof model === 'string') {
        result[scope] = { provider, model };
      }
    }

    return result;
  } catch {
    return {};
  }
};

const buildModelSelectionScopes = (serverId: number | null, chatId: number | null): string[] => {
  const scopes: string[] = [];
  if (serverId !== null && chatId !== null) {
    scopes.push(`server:${serverId}:chat:${chatId}`);
  }
  if (serverId !== null) {
    scopes.push(`server:${serverId}`);
  }
  scopes.push(MODEL_SELECTION_GLOBAL_SCOPE);
  return scopes;
};

const readStoredModelSelection = (
  serverId: number | null,
  chatId: number | null
): { provider: string; model: string } | null => {
  const store = readModelSelectionStore();
  for (const scope of buildModelSelectionScopes(serverId, chatId)) {
    const match = store[scope];
    if (match) {
      return match;
    }
  }
  return null;
};

export const writeStoredModelSelection = (
  serverId: number | null,
  chatId: number | null,
  provider: string,
  model: string
) => {
  try {
    const nextStore = readModelSelectionStore();

    if (serverId !== null && chatId !== null) {
      nextStore[`server:${serverId}:chat:${chatId}`] = { provider, model };
    } else if (serverId !== null) {
      nextStore[`server:${serverId}`] = { provider, model };
    } else {
      nextStore[MODEL_SELECTION_GLOBAL_SCOPE] = { provider, model };
    }

    window.localStorage.setItem(AGENT_MODEL_SELECTION_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // ignore storage failures
  }
};

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseAgentModelSelectionOptions {
  modelSelectionServerId: number | null;
  activeChatId: number | null;
  isSettingsOpen: boolean;
}

interface UseAgentModelSelectionResult {
  aiModelOptions: AiModelChoice[];
  selectedAiModelOption: string | null;
  setSelectedAiModelOption: (value: string | null) => void;
  aiProvider: string | null;
  setAiProvider: (value: string | null) => void;
  aiModel: string | null;
  setAiModel: (value: string | null) => void;
  aiAssistantEnabled: boolean;
  aiModelsLoading: boolean;
  aiConfigInitialized: boolean;
  canSendMessages: boolean;
  aiSelectionResolved: boolean;
  showAiUnavailableState: boolean;
}

export function useAgentModelSelection({
  modelSelectionServerId,
  activeChatId,
  isSettingsOpen,
}: UseAgentModelSelectionOptions): UseAgentModelSelectionResult {
  const [aiModelOptions, setAiModelOptions] = useState<AiModelChoice[]>([]);
  const [selectedAiModelOption, setSelectedAiModelOption] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [defaultAiSelection, setDefaultAiSelection] = useState<{
    provider: string | null;
    model: string | null;
  }>({
    provider: null,
    model: null,
  });
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiConfigInitialized, setAiConfigInitialized] = useState(false);

  const canSendMessages = Boolean(
    aiAssistantEnabled && aiProvider && aiModel && aiModelOptions.length > 0
  );
  const aiSelectionResolved =
    !aiAssistantEnabled || aiModelOptions.length === 0 || Boolean(aiProvider && aiModel);
  const showAiUnavailableState = aiConfigInitialized && aiSelectionResolved && !canSendMessages;

  // Load AI options when settings modal closes
  useEffect(() => {
    if (isSettingsOpen) {
      return;
    }

    let cancelled = false;

    const loadAiOptions = async () => {
      setAiModelsLoading(true);
      try {
        const [providerCatalog, currentSettings] = await Promise.all([
          listAiProviders(),
          getAiSettings(),
        ]);

        if (cancelled) {
          return;
        }

        setAiAssistantEnabled(Boolean(currentSettings.enabled));

        const configuredProviders: AiProviderOption[] = (providerCatalog.providers || [])
          .filter(provider => provider.hasToken)
          .map(provider => ({
            value: provider.id,
            label: provider.label,
            defaultModel: provider.defaultModel,
          }));

        if (!configuredProviders.length) {
          setAiModelOptions([]);
          setSelectedAiModelOption(null);
          setAiProvider(null);
          setAiModel(null);
          return;
        }

        const optionGroups = await Promise.all(
          configuredProviders.map(async provider => {
            const remote = await listAiModels({ provider: provider.value }).catch(() => null);
            const models = remote?.models?.length
              ? remote.models
              : [{ id: provider.defaultModel, displayName: provider.defaultModel }];
            return models.map(model => ({
              value: `${provider.value}::${model.id}`,
              label: `${provider.label} · ${model.displayName || model.id}`,
              provider: provider.value,
              model: model.id,
            }));
          })
        );

        if (cancelled) {
          return;
        }

        const options = optionGroups.flat();
        setAiModelOptions(options);
        setDefaultAiSelection({
          provider: currentSettings.provider ?? null,
          model: currentSettings.model ?? null,
        });

        if (!options.length) {
          setSelectedAiModelOption(null);
          setAiProvider(null);
          setAiModel(null);
          return;
        }
      } catch {
        // keep composer functional without model selector data
      } finally {
        if (!cancelled) {
          setAiModelsLoading(false);
          setAiConfigInitialized(true);
        }
      }
    };

    void loadAiOptions();

    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  // Restore persisted model selection whenever the option list or scope changes
  useEffect(() => {
    if (!aiModelOptions.length) {
      return;
    }

    const stored = readStoredModelSelection(modelSelectionServerId, activeChatId);
    const storedValue = stored ? `${stored.provider}::${stored.model}` : null;
    const configuredValue =
      defaultAiSelection.provider && defaultAiSelection.model
        ? `${defaultAiSelection.provider}::${defaultAiSelection.model}`
        : null;

    const selectedValue =
      [storedValue, configuredValue, aiModelOptions[0].value].find(value =>
        Boolean(value && aiModelOptions.some(option => option.value === value))
      ) || aiModelOptions[0].value;
    const selected =
      aiModelOptions.find(option => option.value === selectedValue) || aiModelOptions[0];

    setSelectedAiModelOption(selected.value);
    setAiProvider(selected.provider);
    setAiModel(selected.model);
  }, [
    aiModelOptions,
    activeChatId,
    modelSelectionServerId,
    defaultAiSelection.provider,
    defaultAiSelection.model,
  ]);

  return {
    aiModelOptions,
    selectedAiModelOption,
    setSelectedAiModelOption,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    aiAssistantEnabled,
    aiModelsLoading,
    aiConfigInitialized,
    canSendMessages,
    aiSelectionResolved,
    showAiUnavailableState,
  };
}
