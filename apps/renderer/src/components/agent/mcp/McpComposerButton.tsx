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

import { useAgentStore } from '@/core/store/agent';
import type { AgentChatMcpSettings } from '@app/contracts';
import { ActionIcon, Indicator, Popover, Tooltip } from '@mantine/core';
import { IconPlug } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { McpPanel } from './McpPanel';
import { indicatorColor } from './mcpPanelModel';
import { useMcpCatalog } from './useMcpCatalog';

interface McpComposerButtonProps {
  serverId: number | null;
  chatId: number | null;
  draftEmpty: boolean;
  onInsertDraft: (text: string) => void;
}

export function McpComposerButton({
  serverId,
  chatId,
  draftEmpty,
  onInsertDraft,
}: McpComposerButtonProps) {
  const { t } = useTranslation('agent');
  const [opened, setOpened] = useState(false);
  const { catalog, loading, refresh } = useMcpCatalog(serverId);
  const mcpByChat = useAgentStore(state => state.mcpByChat);
  const pendingMcp = useAgentStore(state => state.pendingMcp);
  const setChatMcp = useAgentStore(state => state.setChatMcp);
  const setPendingMcp = useAgentStore(state => state.setPendingMcp);

  const settings: AgentChatMcpSettings = useMemo(() => {
    if (chatId && mcpByChat[chatId]) return mcpByChat[chatId];
    if (!chatId && pendingMcp) return pendingMcp;
    return { enabled: false, tools: [] };
  }, [chatId, mcpByChat, pendingMcp]);

  if (
    !serverId ||
    !catalog ||
    catalog.status === 'disabled' ||
    catalog.status === 'not_configured'
  ) {
    return null;
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="top-start" shadow="md" width={460}>
      <Popover.Target>
        <Tooltip label={t('mcp.button')} withArrow>
          <Indicator
            size={8}
            color={indicatorColor(catalog?.status ?? null, settings.enabled)}
            processing={settings.enabled && catalog?.status === 'connected'}
            offset={4}
          >
            <ActionIcon
              size={24}
              radius="xl"
              variant={settings.enabled ? 'light' : 'subtle'}
              color={settings.enabled ? 'blue' : 'gray'}
              onClick={() => setOpened(value => !value)}
              aria-label={t('mcp.button')}
            >
              <IconPlug size={14} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <McpPanel
          serverId={serverId}
          chatId={chatId}
          catalog={catalog}
          loading={loading}
          settings={settings}
          onSettingsChange={next => {
            if (chatId) setChatMcp(chatId, next);
            else setPendingMcp(next);
          }}
          onRefresh={() => void refresh()}
          onInsertDraft={text => {
            onInsertDraft(text);
            setOpened(false);
          }}
          draftEmpty={draftEmpty}
          onClose={() => setOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
