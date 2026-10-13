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

import { invalidateMcpCatalog } from '@/components/agent/mcp/useMcpCatalog';
import { backendRpc } from '@/core/ipc/backend';
import type { AgentGatewayConfigView, AgentGatewayConnectionTestResult } from '@app/contracts';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AgentGatewaySectionProps {
  serverId: number;
}

const EMPTY_TEST: AgentGatewayConnectionTestResult = {
  status: 'not_configured',
  serverInfo: null,
  protocolVersion: null,
  toolCount: 0,
  promptCount: 0,
  truncated: false,
};

export function AgentGatewaySection({ serverId }: AgentGatewaySectionProps) {
  const { t } = useTranslation('server');
  const [config, setConfig] = useState<AgentGatewayConfigView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AgentGatewayConnectionTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void backendRpc.agentGateway.getConfig(serverId).then(view => {
      if (cancelled) return;
      setConfig(view);
      setEnabled(view.enabled);
      setEndpointUrl(view.endpointUrl ?? '');
      setApiKey('');
      setClearApiKey(false);
      setTestResult(null);
    });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const view = await backendRpc.agentGateway.saveConfig({
        serverId,
        enabled,
        endpointUrl: endpointUrl.trim() || null,
        apiKey: apiKey.trim() || undefined,
        clearApiKey: clearApiKey || undefined,
      });
      setConfig(view);
      invalidateMcpCatalog(serverId);
      setApiKey('');
      setClearApiKey(false);
      notifications.show({
        title: t('success'),
        message: t('agentGateway.saved'),
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: t('updateError'),
        message: error instanceof Error ? error.message : t('updateErrorMessage'),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await backendRpc.agentGateway.testConnection({
        serverId,
        enabled,
        endpointUrl: endpointUrl.trim() || null,
        apiKey: apiKey.trim() || undefined,
        clearApiKey: clearApiKey || undefined,
      });
      setTestResult(result);
    } catch (error) {
      notifications.show({
        title: t('agentGateway.testFailed'),
        message: error instanceof Error ? error.message : t('updateErrorMessage'),
        color: 'red',
      });
    } finally {
      setTesting(false);
    }
  };

  const result = testResult ?? EMPTY_TEST;

  return (
    <Stack gap="lg" mt={4}>
      <Switch
        label={t('agentGateway.enable')}
        checked={enabled}
        onChange={event => setEnabled(event.currentTarget.checked)}
      />
      <TextInput
        label={t('agentGateway.endpointUrl')}
        placeholder="http://localhost:3100/mcp"
        value={endpointUrl}
        onChange={event => setEndpointUrl(event.currentTarget.value)}
      />
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <PasswordInput
          style={{ flex: 1 }}
          label={t('agentGateway.apiKey')}
          placeholder={
            config?.hasApiKey && !clearApiKey
              ? t('agentGateway.apiKeySavedPlaceholder')
              : t('agentGateway.apiKeyPlaceholder')
          }
          value={apiKey}
          disabled={clearApiKey}
          onChange={event => {
            setApiKey(event.currentTarget.value);
            setClearApiKey(false);
          }}
        />
        {config?.hasApiKey && !clearApiKey ? (
          <Tooltip label={t('agentGateway.removeKey')} withArrow>
            <ActionIcon
              variant="subtle"
              color="red"
              size="lg"
              aria-label={t('agentGateway.removeKey')}
              onClick={() => {
                setClearApiKey(true);
                setApiKey('');
              }}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        ) : null}
        {clearApiKey || apiKey ? (
          <Tooltip label={t('agentGateway.undoKey')} withArrow>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={t('agentGateway.undoKey')}
              onClick={() => {
                setClearApiKey(false);
                setApiKey('');
              }}
            >
              <IconArrowBackUp size={16} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>

      <Group gap="xs">
        <Badge variant="light">{t(`agentGateway.status.${result.status}`)}</Badge>
        {testResult ? (
          <Text size="sm" c="dimmed">
            {t('agentGateway.counts', {
              tools: result.toolCount,
              prompts: result.promptCount,
            })}
          </Text>
        ) : null}
      </Group>
      {result.serverInfo?.title || result.serverInfo?.name ? (
        <Text size="xs" c="dimmed">
          {result.serverInfo.title || result.serverInfo.name}
          {result.serverInfo.version ? ` ${result.serverInfo.version}` : ''}
        </Text>
      ) : null}

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={() => void handleTest()} loading={testing}>
          {t('agentGateway.test')}
        </Button>
        <Button onClick={() => void handleSave()} loading={loading}>
          {t('save')}
        </Button>
      </Group>
    </Stack>
  );
}
