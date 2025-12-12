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

import { Paper, PaperProps } from '@mantine/core';
import React, { ReactNode } from 'react';

interface PanelProps extends PaperProps {
  /**
   * Optional fixed width for left/middle columns.
   */
  width?: number | string;
}

/**
 * Shared chrome for the three main panels in the layout.
 */
export function Panel({
  width,
  children,
  style,
  styles: paperStyles,
  ...paperProps
}: PanelProps & { children?: ReactNode }) {
  const baseStyle: React.CSSProperties = {
    width,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minWidth: width == null ? 0 : undefined,
  };

  // Merge base style with provided style, handling MantineStyleProp types
  const mergedStyle: React.CSSProperties | undefined = style
    ? typeof style === 'function'
      ? baseStyle // Functions need theme context, so just use base style
      : Array.isArray(style)
        ? Object.assign(
            {},
            baseStyle,
            ...style.filter(
              (s): s is React.CSSProperties =>
                typeof s === 'object' && s !== null && !Array.isArray(s)
            )
          )
        : Object.assign({}, baseStyle, style)
    : baseStyle;

  return (
    <Paper radius={0} withBorder={false} style={mergedStyle} styles={paperStyles} {...paperProps}>
      {children}
    </Paper>
  );
}
