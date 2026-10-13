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

import { backendRpc } from '@/core/ipc/backend';
import { MODAL_KEYS } from '@/core/store/keys';
import { useUIStore } from '@/core/store/ui';
import type { AgentChatMcpSettings, McpCatalog, McpPromptSummary } from '@app/contracts';
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconChecks,
  IconRefresh,
  IconSettings,
  IconSquareOff,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultMcpSelection,
  emptyStateForStatus,
  filterTools,
  groupToolsByPrefix,
  promptArgOptions,
  schemaPropertyNames,
} from './mcpPanelModel';

interface McpPanelProps {
  serverId: number;
  chatId: number | null;
  catalog: McpCatalog | null;
  loading: boolean;
  settings: AgentChatMcpSettings;
  onSettingsChange: (settings: AgentChatMcpSettings) => void;
  onRefresh: () => void;
  onInsertDraft: (text: string) => void;
  draftEmpty: boolean;
  onClose: () => void;
}

export function McpPanel({
  serverId,
  chatId,
  catalog,
  loading,
  settings,
  onSettingsChange,
  onRefresh,
  onInsertDraft,
  draftEmpty,
  onClose,
}: McpPanelProps) {
  const { t } = useTranslation('agent');
  const openModal = useUIStore(state => state.openModal);
  const [tab, setTab] = useState('tools');
  const [query, setQuery] = useState('');
  const [promptName, setPromptName] = useState<string | null>(null);
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({});

  const emptyKey = emptyStateForStatus(catalog?.status ?? null);
  const tools = useMemo(() => filterTools(catalog?.tools ?? [], query), [catalog?.tools, query]);
  const toolGroups = useMemo(() => groupToolsByPrefix(catalog?.tools ?? []), [catalog?.tools]);
  const selected = new Set(settings.tools);

  const persist = async (next: AgentChatMcpSettings) => {
    onSettingsChange(next);
    if (chatId) {
      try {
        await backendRpc.agent.setChatMcpSettings({
          chatId,
          enabled: next.enabled,
          tools: next.tools,
        });
      } catch (error) {
        notifications.show({
          title: t('mcp.saveFailed'),
          message: error instanceof Error ? error.message : t('errors.generic'),
          color: 'red',
        });
      }
    }
  };

  const applyPrompt = async (item: McpPromptSummary) => {
    const args = Object.fromEntries(
      Object.entries(promptName === item.name ? promptArgs : {})
        .map(([name, value]) => [name, value.trim()])
        .filter(([, value]) => value)
    );
    const missing = (item.arguments ?? [])
      .filter(arg => arg.required && !args[arg.name])
      .map(arg =>
        t(`mcp.promptCatalog.${item.name}.args.${arg.name}.label`, { defaultValue: arg.name })
      );
    if (missing.length) {
      notifications.show({
        title: t('mcp.promptFailed'),
        message: t('mcp.requiredArgs', { names: missing.join(', ') }),
        color: 'red',
      });
      return;
    }
    if (!draftEmpty && !window.confirm(t('mcp.replaceDraft'))) {
      return;
    }
    try {
      const preview = await backendRpc.agentGateway.getPrompt({
        ...(chatId ? { chatId } : { serverId }),
        name: item.name,
        arguments: args,
      });
      onInsertDraft(preview.text);
    } catch (error) {
      notifications.show({
        title: t('mcp.promptFailed'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="sm" p="sm">
      <Switch
        label={t('mcp.useInChat')}
        checked={settings.enabled}
        onChange={event => {
          const enabled = event.currentTarget.checked;
          if (!enabled) {
            void persist({ ...settings, enabled: false });
            return;
          }
          void persist(
            settings.tools.length
              ? { ...settings, enabled: true }
              : { enabled: true, tools: defaultMcpSelection(catalog).tools }
          );
        }}
      />

      {catalog?.status !== 'connected' ? (
        <Alert color="yellow">{t(`mcp.empty.${emptyKey}`)}</Alert>
      ) : (
        <>
          <SegmentedControl
            size="xs"
            value={tab}
            onChange={setTab}
            data={[
              { label: t('mcp.tools'), value: 'tools' },
              { label: t('mcp.prompts'), value: 'prompts' },
            ]}
          />
          {tab === 'tools' ? (
            <Stack gap="xs">
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  size="xs"
                  style={{ flex: 1 }}
                  placeholder={t('mcp.searchTools')}
                  value={query}
                  onChange={event => setQuery(event.currentTarget.value)}
                  rightSectionWidth={64}
                  rightSection={
                    query.trim() ? (
                      <Text size="xs" c="dimmed">
                        {tools.length}/{catalog?.tools.length ?? 0}
                      </Text>
                    ) : null
                  }
                />
                <Menu position="bottom-end" withinPortal={false} shadow="md">
                  <Menu.Target>
                    <Tooltip label={t('mcp.selectTools')} withArrow>
                      <ActionIcon variant="subtle" color="gray" aria-label={t('mcp.selectTools')}>
                        <IconChecks size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      onClick={() =>
                        void persist({
                          ...settings,
                          enabled: true,
                          tools: (catalog?.tools ?? [])
                            .filter(tool => tool.policy === 'read')
                            .map(tool => tool.name),
                        })
                      }
                    >
                      {t('mcp.selectReadOnly')}
                    </Menu.Item>
                    {toolGroups.length > 1 ? (
                      <>
                        <Menu.Divider />
                        <Menu.Label>{t('mcp.groupsByPrefix')}</Menu.Label>
                        {toolGroups.map(group => {
                          const allSelected = group.toolNames.every(name => selected.has(name));
                          return (
                            <Menu.Item
                              key={group.prefix}
                              closeMenuOnClick={false}
                              leftSection={
                                <IconCheck
                                  size={14}
                                  style={{ visibility: allSelected ? 'visible' : 'hidden' }}
                                />
                              }
                              rightSection={
                                <Text size="xs" c="dimmed">
                                  {group.toolNames.length}
                                </Text>
                              }
                              onClick={() => {
                                const next = new Set(selected);
                                for (const name of group.toolNames) {
                                  if (allSelected) next.delete(name);
                                  else next.add(name);
                                }
                                void persist({ ...settings, enabled: true, tools: [...next] });
                              }}
                            >
                              {group.prefix}
                            </Menu.Item>
                          );
                        })}
                      </>
                    ) : null}
                  </Menu.Dropdown>
                </Menu>
                <Tooltip label={t('mcp.selectNone')} withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t('mcp.selectNone')}
                    onClick={() => void persist({ ...settings, tools: [] })}
                  >
                    <IconSquareOff size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Text size="xs" c="dimmed">
                {t('mcp.selectedCount', {
                  selected: settings.tools.length,
                  total: catalog?.tools.length ?? 0,
                })}
              </Text>
              <ScrollArea h={240}>
                {tools.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('mcp.noTools')}
                  </Text>
                ) : (
                  <Accordion variant="separated">
                    {tools.map(tool => (
                      <Accordion.Item key={tool.name} value={tool.name}>
                        <Accordion.Control>
                          <Group gap="xs" wrap="nowrap">
                            <Checkbox
                              checked={selected.has(tool.name)}
                              onChange={event => {
                                event.stopPropagation();
                                const next = new Set(selected);
                                if (event.currentTarget.checked) next.add(tool.name);
                                else next.delete(tool.name);
                                void persist({ ...settings, tools: [...next] });
                              }}
                              onClick={event => event.stopPropagation()}
                            />
                            <Text size="sm" lineClamp={1}>
                              {tool.title || tool.name}
                            </Text>
                            <Badge size="xs" variant="light">
                              {t(`mcp.policy.${tool.policy}`)}
                            </Badge>
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Text size="xs">{tool.description || t('mcp.noDescription')}</Text>
                          {schemaPropertyNames(tool.inputSchema).length ? (
                            <Text size="xs" c="dimmed" mt={4}>
                              {schemaPropertyNames(tool.inputSchema).join(', ')}
                            </Text>
                          ) : null}
                        </Accordion.Panel>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                )}
              </ScrollArea>
            </Stack>
          ) : null}

          {tab === 'prompts' ? (
            <ScrollArea h={280}>
              <Stack gap="xs">
                {(catalog?.prompts ?? []).length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('mcp.noPrompts')}
                  </Text>
                ) : (
                  (catalog?.prompts ?? []).map(item => {
                    const promptKey = `mcp.promptCatalog.${item.name}`;
                    const description = t(`${promptKey}.description`, {
                      defaultValue: item.description ?? '',
                    });
                    const setArg = (name: string, value: string) => {
                      const base = promptName === item.name ? promptArgs : {};
                      setPromptName(item.name);
                      setPromptArgs({ ...base, [name]: value });
                    };
                    return (
                      <Stack
                        key={item.name}
                        gap={6}
                        p="xs"
                        style={{
                          border: '1px solid var(--mantine-color-default-border)',
                          borderRadius: 8,
                        }}
                      >
                        <Text size="sm" fw={500}>
                          {t(`${promptKey}.title`, { defaultValue: item.title || item.name })}
                        </Text>
                        {description ? (
                          <Text size="xs" c="dimmed">
                            {description}
                          </Text>
                        ) : null}
                        {(item.arguments ?? []).map(arg => {
                          const argKey = `${promptKey}.args.${arg.name}`;
                          const label = t(`${argKey}.label`, { defaultValue: arg.name });
                          const argDescription = t(`${argKey}.description`, {
                            defaultValue: arg.description ?? '',
                          });
                          const value =
                            promptName === item.name ? (promptArgs[arg.name] ?? '') : '';
                          const options = promptArgOptions(item.name, arg.name);
                          return options ? (
                            <Select
                              key={arg.name}
                              size="xs"
                              label={label}
                              required={arg.required}
                              description={argDescription || undefined}
                              data={options.map(option => ({
                                value: option,
                                label: t(`${argKey}.options.${option}`, { defaultValue: option }),
                              }))}
                              value={value || null}
                              onChange={next => setArg(arg.name, next ?? '')}
                              comboboxProps={{ withinPortal: false }}
                            />
                          ) : (
                            <TextInput
                              key={arg.name}
                              size="xs"
                              label={label}
                              required={arg.required}
                              description={argDescription || undefined}
                              value={value}
                              onChange={event => setArg(arg.name, event.currentTarget.value)}
                            />
                          );
                        })}
                        <Button size="xs" onClick={() => void applyPrompt(item)}>
                          {t('mcp.insertPrompt')}
                        </Button>
                      </Stack>
                    );
                  })
                )}
              </Stack>
            </ScrollArea>
          ) : null}
        </>
      )}

      <Group justify="space-between">
        <Tooltip label={t('mcp.refresh')} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            loading={loading}
            aria-label={t('mcp.refresh')}
            onClick={onRefresh}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t('mcp.serverSettings')} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t('mcp.serverSettings')}
            onClick={() => {
              onClose();
              openModal(MODAL_KEYS.SERVER_EDIT, { serverId, section: 'agentGateway' });
            }}
          >
            <IconSettings size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  );
}
