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

import {
  ActionIcon,
  Group,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

/**
 * Quick toggle to verify Mantine color schemes are wired correctly.
 */
export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const isDark = computedScheme === 'dark';

  const toggleScheme = () => {
    setColorScheme(isDark ? 'light' : 'dark');
  };

  return (
    <Group justify="space-between">
      <div>
        <Text fw={500}>Theme</Text>
        <Text size="sm" c="dimmed">
          Mode: {computedScheme}
        </Text>
      </div>
      <Tooltip label={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
        <ActionIcon
          variant="default"
          size="lg"
          radius="md"
          aria-label="Toggle color scheme"
          onClick={toggleScheme}
        >
          {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
