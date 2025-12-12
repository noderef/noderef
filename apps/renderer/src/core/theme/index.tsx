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

import { ColorSchemeScript, MantineProvider, localStorageColorSchemeManager } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { ReactNode } from 'react';
import { colorSchemePreferenceKey, customTheme } from './custom';

/**
 * Color scheme manager for persisting user's color scheme preference
 * Uses localStorage to save and retrieve the selected theme (light/dark/auto)
 * Key: 'noderef-color-scheme'
 */
const colorSchemeManager = localStorageColorSchemeManager({
  key: colorSchemePreferenceKey,
});

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider - Root theme configuration for NodeRef
 *
 * Wraps the application with:
 * - MantineProvider: Provides theme context and CSS variables
 * - ModalsProvider: Enables Mantine's modal system
 * - Notifications: Provides notification system
 * - ColorSchemeScript: Injects color scheme before React hydration (prevents flash)
 *
 * Features:
 * - Automatic color scheme persistence via localStorage
 * - System preference detection (auto mode)
 * - CSS variables injection for theming
 * - Support for light/dark/auto modes
 *
 * @see https://mantine.dev/theming/mantine-provider/
 * @see https://mantine.dev/theming/theme-object/
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <>
      {/* Inject color scheme script before React to prevent flash */}
      <ColorSchemeScript defaultColorScheme="auto" localStorageKey={colorSchemePreferenceKey} />
      <MantineProvider
        theme={customTheme}
        defaultColorScheme="auto"
        colorSchemeManager={colorSchemeManager}
        withCssVariables
        withGlobalClasses
        withStaticClasses
      >
        <ModalsProvider>
          <Notifications position="bottom-center" zIndex={1000} />
          {children}
        </ModalsProvider>
      </MantineProvider>
    </>
  );
}

/**
 * Export theme and color scheme manager for use in:
 * - Unit tests
 * - Storybook
 * - Server-side rendering
 * - Direct theme access outside components
 */
export { colorSchemeManager, customTheme as theme };
