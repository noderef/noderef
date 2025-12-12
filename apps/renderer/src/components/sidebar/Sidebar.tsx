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

import { Box, Stack } from '@mantine/core';
import { ReactNode } from 'react';

interface SidebarProps {
  header: ReactNode;
  list: ReactNode;
  cta?: ReactNode;
  footer: ReactNode;
}

export function Sidebar({ header, list, cta, footer }: SidebarProps) {
  return (
    <Box
      h="100%"
      w="100%"
      p="sm"
      bg="var(--mantine-color-body)"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Stack
        gap="sm"
        w="100%"
        style={{
          alignItems: 'center',
          flex: 1,
          minHeight: 0,
        }}
      >
        {header}
        <Box
          w="100%"
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            minHeight: 0,
          }}
        >
          {list}
        </Box>
      </Stack>
      <Stack gap="sm" style={{ alignItems: 'center' }}>
        {cta}
        {footer}
      </Stack>
    </Box>
  );
}
