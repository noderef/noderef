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

import type { AgentRunEvent } from '@/core/ipc/backend';
import type { AgentRunSummary } from '@app/contracts';
import {
  Accordion,
  Box,
  Collapse,
  Group,
  Loader,
  Stack,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconChevronRight,
  IconClock,
  IconListCheck,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdown } from './agentMarkdownRenderer';
import {
  buildRunActivity,
  resolveActivityHeaderLabel,
  type RunActivityItem,
} from './agentRunActivity';
import { StreamingAgentMessage } from './StreamingAgentMessage';

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

const translateLabel = (
  label: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string => (label.startsWith('__i18n:') ? t(label.replace('__i18n:', '')) : label);

const translateProgressNote = (
  label: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const trimmed = label.trim();
  if (!trimmed) {
    return label;
  }
  if (trimmed.startsWith('__i18n:')) {
    return translateLabel(trimmed, t);
  }
  const exactKeys: Record<string, string> = {
    'Composing answer': 'composingAnswer',
    'Analyzing request': 'progressAnalyzing',
    'Choosing a tool': 'progressChoosingTool_one',
    Queued: 'progressQueued',
    'Done.': 'progressDone',
    'Completed with errors.': 'progressCompletedWithErrors',
  };
  const exactKey = exactKeys[trimmed];
  if (exactKey) {
    return t(exactKey);
  }
  const choosingTools = /^Choosing (\d+) tools?$/.exec(trimmed);
  if (choosingTools) {
    return t('progressChoosingTool_other', { count: Number(choosingTools[1]) });
  }
  const running = /^Running (.+)$/.exec(trimmed);
  if (running) {
    return t('progressRunning', { label: running[1] });
  }
  const awaiting = /^Awaiting confirmation: (.+)$/.exec(trimmed);
  if (awaiting) {
    return t('progressAwaitingConfirmation', { action: awaiting[1] });
  }
  return label;
};

const looksLikeMarkdown = (value: string): boolean =>
  /[*_`#[\]]/.test(value) || value.includes('\n- ') || value.includes('\n|');

const ACTIVITY_TEXT_PROPS = {
  size: 'sm' as const,
  lh: 1.6,
};

const ACTIVITY_ICON_PROPS = {
  size: 16,
  stroke: 1.5,
  color: 'var(--mantine-color-dimmed)',
} as const;

const ActivityChevron = ({ open }: { open: boolean }) => (
  <IconChevronRight
    {...ACTIVITY_ICON_PROPS}
    size={14}
    style={{
      flexShrink: 0,
      transform: open ? 'rotate(90deg)' : 'none',
      transition: 'transform 150ms ease',
    }}
  />
);

type StepIconVariant = 'running' | 'completed' | 'failed' | 'waiting' | 'default';

const stepIconVariantFromLabel = (label: string): StepIconVariant => {
  if (label === '__i18n:stepStarted') {
    return 'running';
  }
  if (label === '__i18n:stepCompleted') {
    return 'completed';
  }
  if (label === '__i18n:stepFailed' || label === '__i18n:runFailed') {
    return 'failed';
  }
  if (label === '__i18n:stepAwaitingConfirmation') {
    return 'waiting';
  }
  return 'default';
};

const ActivityStepIcon = ({ variant }: { variant: StepIconVariant }) => {
  const Icon =
    variant === 'running'
      ? IconPlayerPlay
      : variant === 'completed'
        ? IconListCheck
        : variant === 'failed'
          ? IconAlertCircle
          : variant === 'waiting'
            ? IconClock
            : IconListCheck;

  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        flexShrink: 0,
      }}
    >
      <Icon {...ACTIVITY_ICON_PROPS} />
    </Box>
  );
};

const ActivityHeaderIcon = ({ isActive }: { isActive: boolean }) => (
  <Box
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      flexShrink: 0,
    }}
  >
    {isActive ? (
      <Loader size={16} />
    ) : (
      <IconListCheck size={18} stroke={1.5} color="var(--mantine-color-dimmed)" />
    )}
  </Box>
);

const StepDetailBlock = ({
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
  const [open, { toggle }] = useDisclosure(false);

  return (
    <Box>
      <UnstyledButton onClick={toggle} style={{ width: '100%' }}>
        <Group gap={6} wrap="nowrap" align="center">
          <ActivityStepIcon variant="completed" />
          <Text {...ACTIVITY_TEXT_PROPS} c={color}>
            {label}
          </Text>
          <ActivityChevron open={open} />
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Box
          className="agent-markdown agent-markdown--compact"
          mt={6}
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(detail, { copyLabel, copiedLabel }),
          }}
          style={{
            margin: 0,
            padding: '8px 10px',
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: isDark ? theme.colors.dark[6] : theme.colors.gray[0],
            border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[3]}`,
            maxHeight: 280,
            overflow: 'auto',
          }}
        />
      </Collapse>
    </Box>
  );
};

const ActivityStepRow = ({
  step,
  copyLabel,
  copiedLabel,
  t,
}: {
  step: RunActivityItem;
  copyLabel: string;
  copiedLabel: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) => {
  if (step.kind === 'note') {
    const label = translateProgressNote(step.label, t);
    if (looksLikeMarkdown(label)) {
      return (
        <Box
          className="agent-markdown"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(label, { copyLabel, copiedLabel }),
          }}
        />
      );
    }
    return (
      <Text {...ACTIVITY_TEXT_PROPS} c="dimmed">
        {label}
      </Text>
    );
  }

  const translatedLabel = translateLabel(step.label, t);

  if (step.detail) {
    return (
      <StepDetailBlock
        label={translatedLabel}
        color={step.level === 'error' ? 'red' : 'var(--mantine-color-text)'}
        detail={step.detail}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />
    );
  }

  return (
    <Group gap={6} wrap="nowrap" align="center">
      <ActivityStepIcon variant={stepIconVariantFromLabel(step.label)} />
      <Text {...ACTIVITY_TEXT_PROPS} c={step.level === 'error' ? 'red' : 'dimmed'}>
        {translatedLabel}
      </Text>
    </Group>
  );
};

interface AgentRunTimelineItemProps {
  run: AgentRunSummary;
  runEvents: AgentRunEvent[];
  isActive: boolean;
  streamingText?: string | null;
  copyLabel: string;
  copiedLabel: string;
}

export function AgentRunTimelineItem({
  run,
  runEvents,
  isActive,
  streamingText,
  copyLabel,
  copiedLabel,
}: AgentRunTimelineItemProps) {
  const { t } = useTranslation('agent');
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = colorScheme === 'dark';

  const activity = useMemo(() => buildRunActivity(runEvents), [runEvents]);
  const hasPanelContent = activity.length > 0 || Boolean(streamingText?.trim());

  const isStreaming = Boolean(streamingText?.trim());

  const headerLabel = useMemo(() => {
    const resolved = resolveActivityHeaderLabel(runEvents, activity, t, {
      streaming: isStreaming,
    });
    if (resolved) {
      return resolved.startsWith('__i18n:') ? translateLabel(resolved, t) : resolved;
    }
    if (isStreaming) {
      return t('composingAnswer');
    }
    return isActive ? t('thinking') : t('activity');
  }, [runEvents, activity, t, isStreaming, isActive]);

  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive || streamingText) {
      setExpanded(true);
    }
  }, [isActive, streamingText]);

  useEffect(() => {
    if (!isActive && !streamingText) {
      setExpanded(false);
    }
  }, [isActive, streamingText]);

  if (!hasPanelContent && !isActive) {
    return null;
  }

  const railColor = isDark ? theme.colors.dark[4] : theme.colors.gray[3];
  const hoverBg = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';

  return (
    <Box py={4}>
      <Accordion
        value={expanded ? 'activity' : null}
        onChange={value => setExpanded(value === 'activity')}
        chevron={null}
        variant="default"
        styles={{
          root: {
            backgroundColor: 'transparent',
          },
          item: {
            border: 'none',
          },
          control: {
            padding: '6px 0',
            minHeight: 'unset',
            backgroundColor: 'transparent',
            gap: 0,
            '&:hover': {
              backgroundColor: hoverBg,
            },
          },
          label: {
            padding: 0,
            width: '100%',
          },
          chevron: {
            display: 'none',
          },
          panel: {
            padding: '4px 0 8px',
            backgroundColor: 'transparent',
          },
          content: { padding: 0 },
        }}
      >
        <Accordion.Item value="activity">
          <Accordion.Control>
            <Group gap={6} wrap="nowrap" justify="space-between" style={{ width: '100%' }}>
              <Group gap={6} wrap="nowrap" align="center">
                <ActivityHeaderIcon isActive={isActive} />
                <Text {...ACTIVITY_TEXT_PROPS} c="var(--mantine-color-text)" fw={400}>
                  {headerLabel}
                </Text>
                <ActivityChevron open={expanded} />
              </Group>
              {isActive ? (
                <Text {...ACTIVITY_TEXT_PROPS} c="dimmed">
                  <RunTimer createdAt={run.createdAt} />
                </Text>
              ) : null}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={8}>
              {activity.length > 0 ? (
                <Stack gap={6}>
                  {activity.map((step, idx) => (
                    <ActivityStepRow
                      key={`${step.kind}-${idx}-${step.label.slice(0, 24)}`}
                      step={step}
                      copyLabel={copyLabel}
                      copiedLabel={copiedLabel}
                      t={t}
                    />
                  ))}
                </Stack>
              ) : null}

              {streamingText?.trim() ? (
                <Box
                  pt={activity.length > 0 ? 8 : 0}
                  style={{
                    borderTop: activity.length > 0 ? `1px solid ${railColor}` : undefined,
                  }}
                >
                  <StreamingAgentMessage
                    text={streamingText}
                    copyLabel={copyLabel}
                    copiedLabel={copiedLabel}
                  />
                </Box>
              ) : null}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Box>
  );
}
