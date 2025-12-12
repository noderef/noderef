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

import { Box, ScrollArea, Stack } from '@mantine/core';
import { ReactNode } from 'react';

interface ContentAreaProps {
  header: ReactNode;
  children: ReactNode;
  noScroll?: boolean;
}

export function ContentArea({ header, children, noScroll = false }: ContentAreaProps) {
  return (
    <Stack gap={0} h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {header}
      {noScroll ? (
        <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</Box>
      ) : (
        <ScrollArea style={{ flex: 1, minHeight: 0 }}>
          <Box style={{ minHeight: '100%' }}>{children}</Box>
        </ScrollArea>
      )}
    </Stack>
  );
}
