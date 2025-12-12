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
  createTheme,
  DEFAULT_THEME,
  MantineColorScheme,
  MantineColorsTuple,
  mergeMantineTheme,
} from '@mantine/core';
import { defaultTheme } from './default';

/**
 * Color scheme storage key for localStorage
 * Used by Mantine's localStorageColorSchemeManager
 */
export const colorSchemePreferenceKey = 'noderef-color-scheme';

/**
 * Supported color schemes for the application
 * - light: Light mode
 * - dark: Dark mode
 * - auto: Sync with system preference
 */
export const supportedColorSchemes: MantineColorScheme[] = ['light', 'dark', 'auto'];

/**
 * Custom color palette: Slate
 * A neutral gray-blue color palette for professional UI
 */
const slate: MantineColorsTuple = [
  '#f4f6fb', // 0 - lightest
  '#e5e9f1',
  '#cbd3df',
  '#aeb8c6',
  '#909caf',
  '#788498',
  '#636c7f', // 6 - primary shade (light mode)
  '#4f5666',
  '#393e4b', // 8 - primary shade (dark mode)
  '#232630', // 9 - darkest
];

/**
 * NodeRef-specific theme overrides
 * Extends the default theme with custom colors, component defaults, and styles
 *
 * To add a new theme in the future:
 * 1. Create a new theme file (e.g., theme-ocean.ts)
 * 2. Define custom colors and overrides
 * 3. Export a theme created with createTheme()
 * 4. Update ThemeProvider to accept a theme prop or create a theme selector
 */
const nodeRefTheme = createTheme({
  colors: {
    slate,
  },
  primaryColor: 'slate',
  primaryShade: { light: 6, dark: 8 },
  luminanceThreshold: 0.25,
  scale: 1,
  defaultGradient: { from: 'indigo', to: 'violet', deg: 45 },

  // Component-specific defaults
  components: {
    Button: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Tabs: {
      styles: () => ({
        tab: {
          fontWeight: 500,
          color: `var(--mantine-color-text)`,
        },
      }),
    },
    Paper: {
      defaultProps: {
        radius: 'md',
        withBorder: true,
      },
    },
    Modal: {
      defaultProps: {
        centered: true,
        overlayProps: {
          backgroundOpacity: 0.55,
          blur: 3,
        },
      },
    },
  },
});

/**
 * Final custom theme: default theme + NodeRef theme overrides
 * This is the theme object passed to MantineProvider
 */
export const customTheme = mergeMantineTheme(
  mergeMantineTheme(DEFAULT_THEME, defaultTheme),
  nodeRefTheme
);
