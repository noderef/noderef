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

import type { AiStatusResponse } from '@/core/ai/consoleClient';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useServersStore } from '@/core/store/servers';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Menu,
  Paper,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconClearAll,
  IconFile,
  IconFileCode,
  IconLoader2,
  IconPlayerPlay,
  IconRobot,
  IconRobotOff,
  IconServer2,
} from '@tabler/icons-react';
import { Trans, useTranslation } from 'react-i18next';

interface ExecuteBarProps {
  onExecute: () => void;
  aiStatus?: AiStatusResponse | null;
  aiBusy?: boolean;
  isNodeRefSpace: boolean;
}

export function ExecuteBar({ onExecute, aiStatus, aiBusy, isNodeRefSpace }: ExecuteBarProps) {
  const { t } = useTranslation(['jsConsole', 'common']);
  const isExecuting = useJsConsoleStore(state => state.isExecuting);
  const code = useJsConsoleStore(state => state.code);
  const clearOutputs = useJsConsoleStore(state => state.clearOutputs);
  const outputs = useJsConsoleStore(state => state.outputs);
  const documentName = useJsConsoleStore(state => state.documentName);
  const documentNodeRef = useJsConsoleStore(state => state.documentNodeRef);
  const clearDocumentContext = useJsConsoleStore(state => state.clearDocumentContext);
  const loadedScriptName = useJsConsoleStore(state => state.loadedScriptName);
  const clearLoadedScript = useJsConsoleStore(state => state.clearLoadedScript);
  const selectedServerIds = useJsConsoleStore(state => state.selectedServerIds);
  const setSelectedServerIds = useJsConsoleStore(state => state.setSelectedServerIds);
  const setActiveOutputServerId = useJsConsoleStore(state => state.setActiveOutputServerId);
  const servers = useServersStore(state => state.servers);
  const aiReady = Boolean(aiStatus?.enabled && aiStatus?.providerConfigured);
  const executeDisabled = isExecuting || !code.trim() || selectedServerIds.length === 0;
  const shortcutLabel = 'Ctrl+Enter';
  const serverSelectionTooltip = selectedServerIds.length
    ? t('jsConsole:serverSelectionCount', { count: selectedServerIds.length })
    : t('jsConsole:serverSelectionPrompt');
  const aiTooltip = aiBusy
    ? t('jsConsole:aiTooltipBusy')
    : aiReady
      ? t('jsConsole:aiTooltipReady')
      : t('jsConsole:aiTooltipUnavailable');

  const toggleServerSelection = (id: number) => {
    const alreadySelected = selectedServerIds.includes(id);
    if (alreadySelected) {
      if (selectedServerIds.length === 1) {
        return; // keep at least one server selected
      }
      const nextSelection = selectedServerIds.filter(serverId => serverId !== id);
      setSelectedServerIds(nextSelection);
      setActiveOutputServerId(nextSelection[0] ?? null);
    } else {
      const nextSelection = [...selectedServerIds, id];
      setSelectedServerIds(nextSelection);
      setActiveOutputServerId(nextSelection[0] ?? null);
    }
  };

  return (
    <Paper
      p="md"
      withBorder={false}
      style={{
        borderRadius: 0,
        borderTop: '1px solid var(--layout-divider-color)',
        backgroundColor: 'var(--mantine-color-body)',
      }}
    >
      <Group justify="space-between" align="center">
        <Group gap="sm" align="center">
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            onClick={onExecute}
            loading={isExecuting}
            disabled={executeDisabled}
            variant="filled"
            color="blue"
            px="xl"
          >
            {t('jsConsole:execute')}
          </Button>
          {isNodeRefSpace && (
            <Menu width={240} position="bottom-start" closeOnItemClick={false} withinPortal={false}>
              <Menu.Target>
                <Tooltip label={serverSelectionTooltip} position="top" withArrow>
                  <ActionIcon
                    variant="light"
                    color={selectedServerIds.length ? 'blue' : 'gray'}
                    size="lg"
                    aria-label={t('jsConsole:serverSelectionAria')}
                  >
                    <IconServer2 size={18} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {servers.length === 0 ? (
                  <Menu.Label>{t('common:noServers')}</Menu.Label>
                ) : (
                  servers.map(server => (
                    <Menu.Item key={server.id} closeMenuOnClick={false}>
                      <Checkbox
                        label={server.name}
                        checked={selectedServerIds.includes(server.id)}
                        onChange={() => toggleServerSelection(server.id)}
                      />
                    </Menu.Item>
                  ))
                )}
              </Menu.Dropdown>
            </Menu>
          )}
          {documentNodeRef && (
            <Tooltip
              label={t('jsConsole:documentTooltip', { nodeRef: documentNodeRef })}
              position="top"
              withArrow
            >
              <Badge
                leftSection={<IconFile size={12} />}
                rightSection={
                  <CloseButton
                    size="xs"
                    onClick={e => {
                      e.stopPropagation();
                      clearDocumentContext();
                    }}
                    style={{ marginLeft: 4 }}
                  />
                }
                variant="light"
                color="blue"
                pr={4}
              >
                {documentName || t('jsConsole:documentBadge')}
              </Badge>
            </Tooltip>
          )}
          {loadedScriptName && (
            <Tooltip
              label={t('jsConsole:loadedScriptTooltip', { name: loadedScriptName })}
              position="top"
              withArrow
            >
              <Badge
                leftSection={<IconFileCode size={12} />}
                rightSection={
                  <CloseButton
                    size="xs"
                    onClick={e => {
                      e.stopPropagation();
                      clearLoadedScript();
                    }}
                    style={{ marginLeft: 4 }}
                  />
                }
                variant="light"
                color="green"
                pr={4}
              >
                {loadedScriptName}
              </Badge>
            </Tooltip>
          )}
          <Text size="sm" c="dimmed">
            <Trans
              i18nKey="jsConsole:executeHint"
              values={{ shortcut: shortcutLabel }}
              components={{ shortcut: <Text span fw={500} c="blue" /> }}
            />
          </Text>
          {aiStatus && (
            <Tooltip label={aiTooltip} position="top" withArrow>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {aiBusy ? (
                  <IconLoader2
                    size={20}
                    color="var(--mantine-color-blue-6)"
                    style={{ animation: 'spin 1s linear infinite' }}
                  />
                ) : aiReady ? (
                  <IconRobot size={20} color="var(--mantine-color-green-6)" />
                ) : (
                  <IconRobotOff size={20} color="var(--mantine-color-gray-5)" />
                )}
              </div>
            </Tooltip>
          )}
        </Group>

        <Tooltip label={t('jsConsole:clearConsole')} position="left" withArrow>
          <ActionIcon
            onClick={clearOutputs}
            disabled={outputs.length === 0 || isExecuting}
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={t('jsConsole:clearConsole')}
          >
            <IconClearAll size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}
