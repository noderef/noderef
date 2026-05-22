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

import type { AgentMention, AgentMessage } from '@/core/ipc/backend';
import { ActionIcon, Badge, Box, CopyButton, Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { mentionChipBadgeProps, mentionChipStyle } from './mentionChip';
import { renderMarkdown } from './agentMarkdownRenderer';

const NODE_BROWSER_LINK_PROTOCOL = 'nodebrowser:';
const NODE_BROWSER_LINK_HOST = 'node';
const QNAME_TOKEN_PATTERN = '[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_-]+';
const QNAME_TOKEN_REGEX = new RegExp(`^${QNAME_TOKEN_PATTERN}$`);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMessageTokenRegex(mentionLabels: string[]): RegExp {
  const mentionParts = mentionLabels.map(label => escapeRegExp(`@${label}`));
  const splitPattern = mentionParts.length
    ? `${mentionParts.join('|')}|${QNAME_TOKEN_PATTERN}`
    : QNAME_TOKEN_PATTERN;
  return new RegExp(`(${splitPattern})`, 'g');
}

function renderUserMessageContent(content: string, mentions: AgentMention[] = []) {
  if (!content) return content;

  try {
    const sortedMentions = [...mentions].sort((a, b) => b.label.length - a.label.length);
    const regex = buildMessageTokenRegex(sortedMentions.map(m => m.label));
    const mentionTokenSet = new Set(sortedMentions.map(m => `@${m.label}`));

    const parts = content.split(regex);

    return parts.map((part, index) => {
      if (mentionTokenSet.has(part) || QNAME_TOKEN_REGEX.test(part)) {
        return (
          <Badge key={index} {...mentionChipBadgeProps} style={mentionChipStyle}>
            {part}
          </Badge>
        );
      }
      return <span key={index}>{part}</span>;
    });
  } catch {
    return content;
  }
}

export const parseNodeBrowserLink = (
  href: string
): { nodeId: string; nodeName: string | null } | null => {
  try {
    const parsed = new URL(href);
    if (
      parsed.protocol !== NODE_BROWSER_LINK_PROTOCOL ||
      parsed.hostname !== NODE_BROWSER_LINK_HOST
    ) {
      return null;
    }

    const nodeId = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').trim());
    if (!nodeId) {
      return null;
    }

    const nodeNameRaw = parsed.searchParams.get('name');
    const nodeName = nodeNameRaw && nodeNameRaw.trim() ? nodeNameRaw.trim() : null;
    return { nodeId, nodeName };
  } catch {
    return null;
  }
};

interface AgentMessageBubbleProps {
  message: AgentMessage;
  copyLabel: string;
  copiedLabel: string;
}

export function AgentMessageBubble({ message, copyLabel, copiedLabel }: AgentMessageBubbleProps) {
  if (message.role === 'assistant') {
    return (
      <Box className="agent-message-group" style={{ position: 'relative' }} mb={32}>
        <Box
          py={2}
          className="agent-markdown"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(message.content, {
              copyLabel,
              copiedLabel,
            }),
          }}
        />
        <Box
          className="agent-message-copy-btn"
          style={{
            position: 'absolute',
            bottom: -24,
            right: 0,
            opacity: 0,
            transition: 'opacity 0.2s',
          }}
        >
          <CopyButton value={message.content} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? copiedLabel : copyLabel} withArrow position="top">
                <ActionIcon
                  color={copied ? 'teal' : 'gray'}
                  variant="subtle"
                  onClick={copy}
                  size="sm"
                >
                  {copied ? (
                    <IconCheck style={{ width: 14 }} />
                  ) : (
                    <IconCopy style={{ width: 14 }} />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Box>
      </Box>
    );
  }

  return (
    <Group
      justify="flex-end"
      className="agent-message-group"
      style={{ position: 'relative' }}
      mb={32}
    >
      <Paper
        p="sm"
        withBorder={false}
        shadow="none"
        style={{
          maxWidth: '72%',
          width: 'fit-content',
          backgroundColor: 'var(--mantine-color-gray-light)',
        }}
      >
        <Text component="div" size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {renderUserMessageContent(message.content, message.mentions)}
        </Text>
      </Paper>

      <Box
        className="agent-message-copy-btn"
        style={{
          position: 'absolute',
          bottom: -28,
          right: 0,
          opacity: 0,
          transition: 'opacity 0.2s',
          zIndex: 10,
        }}
      >
        <CopyButton value={message.content} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? copiedLabel : copyLabel} withArrow position="top">
              <ActionIcon
                color={copied ? 'teal' : 'gray'}
                variant="subtle"
                onClick={copy}
                size="sm"
              >
                {copied ? <IconCheck style={{ width: 14 }} /> : <IconCopy style={{ width: 14 }} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Box>
    </Group>
  );
}
