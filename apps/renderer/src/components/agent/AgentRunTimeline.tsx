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

import type { AgentRunEvent, AgentRunSummary } from '@/core/ipc/backend';
import {
  Accordion,
  Box,
  Group,
  Loader,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdown } from './agentMarkdownRenderer';
import { buildRunActivity } from './agentRunActivity';

const RunTimer = ({ createdAt }: { createdAt: string | Date }) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const update = () => setDuration(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return <>{duration}s</>;
};

const StepDetailAccordion = ({
  label,
  color,
  detail,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  color?: string;
  detail: string;
  copyLabel: string;
  copiedLabel: string;
}) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = colorScheme === 'dark';

  return (
    <Accordion
      variant="default"
      chevronPosition="right"
      chevronSize={14}
      styles={{
        root: { border: 'none', width: 'fit-content' },
        item: { border: 'none' },
        control: {
          padding: '2px 0',
          minHeight: 'unset',
          width: 'fit-content',
        },
        label: { padding: 0 },
        chevron: { marginLeft: 6, margin: 0 },
        panel: { padding: '4px 0', width: '100%' },
        content: { padding: 0 },
      }}
    >
      <Accordion.Item value="detail">
        <Accordion.Control>
          <Text size="sm" c={color}>
            {label}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Box
            className="agent-markdown"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(detail, { copyLabel, copiedLabel }),
            }}
            style={{
              margin: 0,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--mantine-color-text)',
              borderRadius: 'var(--mantine-radius-md)',
              backgroundColor: isDark ? theme.colors.dark[6] : theme.colors.gray[1],
              border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
              maxHeight: 300,
              overflow: 'auto',
              width: 'calc(100vw - 80px)',
              maxWidth: 800,
            }}
          />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

interface AgentRunTimelineItemProps {
  run: AgentRunSummary;
  runEvents: AgentRunEvent[];
  isActive: boolean;
  copyLabel: string;
  copiedLabel: string;
}

export function AgentRunTimelineItem({
  run,
  runEvents,
  isActive,
  copyLabel,
  copiedLabel,
}: AgentRunTimelineItemProps) {
  const { t } = useTranslation('agent');

  const activity = useMemo(() => buildRunActivity(runEvents), [runEvents]);

  return (
    <Box py={2}>
      <Stack gap="xs">
        {activity.map((step, idx) => {
          if (step.kind === 'note') {
            return (
              <Box
                key={idx}
                className="agent-markdown"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(step.label, {
                    copyLabel,
                    copiedLabel,
                  }),
                }}
                style={{ fontSize: 14, lineHeight: 1.6 }}
              />
            );
          }

          if (step.kind === 'execution' && step.detail) {
            const translatedLabel = step.label.startsWith('__i18n:')
              ? t(step.label.replace('__i18n:', ''))
              : step.label;

            return (
              <StepDetailAccordion
                key={idx}
                label={translatedLabel}
                color={step.level === 'error' ? 'red' : 'var(--mantine-color-text)'}
                detail={step.detail}
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
              />
            );
          }

          if (step.level === 'error') {
            const translatedLabel = step.label.startsWith('__i18n:')
              ? t(step.label.replace('__i18n:', ''))
              : step.label;

            if (step.detail) {
              return (
                <StepDetailAccordion
                  key={idx}
                  label={translatedLabel}
                  color="red"
                  detail={step.detail}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                />
              );
            }

            return (
              <Text key={idx} size="sm" c="red">
                {translatedLabel}
              </Text>
            );
          }

          return (
            <Text key={idx} size="xs" c="dimmed">
              {step.label.startsWith('__i18n:') ? t(step.label.replace('__i18n:', '')) : step.label}
            </Text>
          );
        })}

        {isActive && (
          <Group gap="xs" py={2}>
            <Loader size={14} />
            <Text size="xs" c="dimmed">
              {t('thinking')} (<RunTimer createdAt={run.createdAt} />)
            </Text>
          </Group>
        )}
      </Stack>
    </Box>
  );
}
