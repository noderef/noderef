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
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultMcpSelection, emptyStateForStatus, filterTools, schemaPropertyNames } from './mcpPanelModel';

interface McpPanelProps {
  serverId: number;
  chatId: number | null;
  catalog: McpCatalog | null;
  loading: boolean;
  settings: AgentChatMcpSettings;
  onSettingsChange: (settings: AgentChatMcpSettings) => void;
  onRefresh: () => void;
  onInsertDraft: (text: string) => void;
  onAddContext: (item: { uri: string; name?: string | null }) => void;
  draftEmpty: boolean;
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
  onAddContext,
  draftEmpty,
}: McpPanelProps) {
  const { t } = useTranslation('agent');
  const openModal = useUIStore(state => state.openModal);
  const [tab, setTab] = useState('tools');
  const [query, setQuery] = useState('');
  const [promptName, setPromptName] = useState<string | null>(null);
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({});
  const [templateParams, setTemplateParams] = useState<Record<string, Record<string, string>>>({});

  const emptyKey = emptyStateForStatus(catalog?.status ?? null);
  const tools = useMemo(
    () => filterTools(catalog?.tools ?? [], query),
    [catalog?.tools, query]
  );
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
    if (!chatId) {
      notifications.show({
        title: t('mcp.promptFailed'),
        message: t('mcp.chatRequired'),
        color: 'red',
      });
      return;
    }
    const missing = (item.arguments ?? [])
      .filter(arg => arg.required && !promptArgs[arg.name]?.trim())
      .map(arg => arg.name);
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
        chatId,
        name: item.name,
        arguments: promptArgs,
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

  const readResource = async (input: {
    uri?: string;
    uriTemplate?: string;
    params?: Record<string, string>;
    add?: boolean;
  }) => {
    if (!chatId) {
      notifications.show({
        title: t('mcp.resourceFailed'),
        message: t('mcp.chatRequired'),
        color: 'red',
      });
      return;
    }
    try {
      const preview = await backendRpc.agentGateway.readResource({
        chatId,
        uri: input.uri,
        uriTemplate: input.uriTemplate,
        params: input.params,
      });
      if (input.add) {
        onAddContext({ uri: preview.uri, name: preview.name });
      } else {
        notifications.show({
          title: preview.name || preview.uri,
          message: preview.text.slice(0, 400) || t('mcp.emptyResource'),
          color: 'blue',
        });
      }
    } catch (error) {
      notifications.show({
        title: t('mcp.resourceFailed'),
        message: error instanceof Error ? error.message : t('errors.generic'),
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="sm" p="sm" w={420}>
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
        <Alert color="yellow">
          {t(`mcp.empty.${emptyKey}`)}
        </Alert>
      ) : (
        <>
          <SegmentedControl
            size="xs"
            value={tab}
            onChange={setTab}
            data={[
              { label: t('mcp.tools'), value: 'tools' },
              { label: t('mcp.prompts'), value: 'prompts' },
              { label: t('mcp.resources'), value: 'resources' },
            ]}
          />
          {tab === 'tools' ? (
            <Stack gap="xs">
              <TextInput
                size="xs"
                placeholder={t('mcp.searchTools')}
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
              />
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="subtle"
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
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => void persist({ ...settings, tools: [] })}
                >
                  {t('mcp.selectNone')}
                </Button>
              </Group>
              {settings.tools.length > 25 ? (
                <Text size="xs" c="orange">
                  {t('mcp.tooManyTools')}
                </Text>
              ) : null}
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
                  (catalog?.prompts ?? []).map(item => (
                    <Stack key={item.name} gap={6} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
                      <Text size="sm" fw={500}>
                        {item.title || item.name}
                      </Text>
                      {item.description ? (
                        <Text size="xs" c="dimmed">
                          {item.description}
                        </Text>
                      ) : null}
                      {(item.arguments ?? []).map(arg => (
                        <TextInput
                          key={arg.name}
                          size="xs"
                          label={arg.name}
                          required={arg.required}
                          description={arg.description}
                          value={promptName === item.name ? (promptArgs[arg.name] ?? '') : ''}
                          onChange={event => {
                            setPromptName(item.name);
                            setPromptArgs(current => ({
                              ...current,
                              [arg.name]: event.currentTarget.value,
                            }));
                          }}
                        />
                      ))}
                      <Button size="xs" onClick={() => void applyPrompt(item)}>
                        {t('mcp.insertPrompt')}
                      </Button>
                    </Stack>
                  ))
                )}
              </Stack>
            </ScrollArea>
          ) : null}

          {tab === 'resources' ? (
            <ScrollArea h={280}>
              <Stack gap="xs">
                {(catalog?.resources ?? []).map(resource => (
                  <Group key={resource.uri} justify="space-between" wrap="nowrap">
                    <Text size="sm" lineClamp={1}>
                      {resource.name || resource.uri}
                    </Text>
                    <Group gap={4} wrap="nowrap">
                      <Button size="compact-xs" variant="subtle" onClick={() => void readResource({ uri: resource.uri })}>
                        {t('mcp.read')}
                      </Button>
                      <Button
                        size="compact-xs"
                        onClick={() => void readResource({ uri: resource.uri, add: true })}
                      >
                        {t('mcp.addContext')}
                      </Button>
                    </Group>
                  </Group>
                ))}
                {(catalog?.resourceTemplates ?? []).map(template => {
                  const params = templateParams[template.uriTemplate] ?? {};
                  const names = Array.from(template.uriTemplate.matchAll(/\{([^}]+)\}/g)).map(
                    match => match[1]
                  );
                  return (
                    <Stack key={template.uriTemplate} gap={6}>
                      <Text size="sm">{template.name || template.uriTemplate}</Text>
                      {names.map(name => (
                        <TextInput
                          key={name}
                          size="xs"
                          label={name}
                          value={params[name] ?? ''}
                          onChange={event =>
                            setTemplateParams(current => ({
                              ...current,
                              [template.uriTemplate]: {
                                ...(current[template.uriTemplate] ?? {}),
                                [name]: event.currentTarget.value,
                              },
                            }))
                          }
                        />
                      ))}
                      <Group gap={4}>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          onClick={() =>
                            void readResource({
                              uriTemplate: template.uriTemplate,
                              params,
                            })
                          }
                        >
                          {t('mcp.read')}
                        </Button>
                        <Button
                          size="compact-xs"
                          onClick={() =>
                            void readResource({
                              uriTemplate: template.uriTemplate,
                              params,
                              add: true,
                            })
                          }
                        >
                          {t('mcp.addContext')}
                        </Button>
                      </Group>
                    </Stack>
                  );
                })}
                {!catalog?.resources.length && !catalog?.resourceTemplates.length ? (
                  <Text size="sm" c="dimmed">
                    {t('mcp.noResources')}
                  </Text>
                ) : null}
              </Stack>
            </ScrollArea>
          ) : null}
        </>
      )}

      <Group justify="space-between">
        <Button size="xs" variant="subtle" loading={loading} onClick={onRefresh}>
          {t('mcp.refresh')}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          onClick={() => openModal(MODAL_KEYS.SERVER_EDIT, { serverId, section: 'agentGateway' })}
        >
          {t('mcp.serverSettings')}
        </Button>
      </Group>
    </Stack>
  );
}
