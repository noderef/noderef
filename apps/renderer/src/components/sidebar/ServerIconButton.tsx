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

import { ActionIcon, Avatar, Badge, Box, Tooltip } from '@mantine/core';

interface ServerIconButtonProps {
  label: string;
  initials: string;
  active?: boolean;
  onSelect?: () => void;
  color?: string | null;
  thumbnail?: string | null;
  serverLabel?: string | null;
}

export function ServerIconButton({
  label,
  initials,
  active,
  onSelect,
  color,
  thumbnail,
  serverLabel,
}: ServerIconButtonProps) {
  const displayColor = color || (active ? 'slate' : undefined);

  return (
    <Tooltip label={label} position="right" withArrow>
      <Box pos="relative" w={56} h={56}>
        {thumbnail ? (
          <Avatar
            src={`data:image/png;base64,${thumbnail}`}
            alt={label}
            size={56}
            radius="xl"
            style={{
              cursor: 'pointer',
              border: active ? '2px solid var(--mantine-color-slate-6)' : '2px solid transparent',
            }}
            onClick={onSelect}
          />
        ) : (
          <ActionIcon
            aria-label={label}
            variant={active ? 'filled' : 'light'}
            color={displayColor}
            radius="xl"
            size={56}
            onClick={onSelect}
            styles={{
              root: {
                fontWeight: 600,
                fontSize: '1rem',
              },
            }}
          >
            {initials.slice(0, 2).toUpperCase()}
          </ActionIcon>
        )}
        {serverLabel && (
          <Badge
            size="xs"
            variant="filled"
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              minWidth: 'auto',
              height: 18,
              padding: '0 5px',
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1,
              pointerEvents: 'none',
              backgroundColor: 'var(--mantine-color-gray-7)',
              color: 'var(--mantine-color-gray-0)',
            }}
          >
            {serverLabel}
          </Badge>
        )}
      </Box>
    </Tooltip>
  );
}
