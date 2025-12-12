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

import { Box } from '@mantine/core';
import { ReactNode } from 'react';
import { Panel } from './Panel';
import { ResizableDivider } from './ResizableDivider';
import { useLayoutStore } from '@/core/store/layout';

interface AppLayoutProps {
  sidebar: ReactNode;
  submenu: ReactNode;
  content: ReactNode;
}

/**
 * Discord-inspired three-panel layout skeleton.
 * All panels are in a single flex container to ensure they resize together.
 */
export function AppLayout({ sidebar, submenu, content }: AppLayoutProps) {
  const submenuWidth = useLayoutStore(state => state.submenuWidth);
  const setSubmenuWidth = useLayoutStore(state => state.setSubmenuWidth);

  return (
    <Box
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        minWidth: 800,
        maxWidth: 2560,
        margin: '0 auto',
        overflow: 'hidden',
        paddingTop: 'var(--mantine-spacing-md)',
        border: 'none',
      }}
    >
      <Panel
        width={96}
        styles={{
          root: {
            borderWidth: 0,
            border: 'none',
          },
        }}
      >
        {sidebar}
      </Panel>
      <Panel
        width={submenuWidth}
        styles={{
          root: {
            borderWidth: 0,
            borderLeft: '0.5px solid var(--layout-divider-color)',
            borderTopLeftRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
          },
        }}
      >
        {submenu}
      </Panel>
      <ResizableDivider
        onResize={setSubmenuWidth}
        initialWidth={submenuWidth}
        minWidth={200}
        maxWidth={600}
      />
      <Panel
        style={{ flex: 1 }}
        styles={{
          root: {
            borderWidth: 0,
            borderLeft: '0.5px solid var(--layout-divider-color)',
            overflow: 'hidden',
          },
        }}
      >
        {content}
      </Panel>
    </Box>
  );
}
