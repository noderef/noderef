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

import type React from 'react';

interface ColumnResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
}

/**
 * A visual resize handle for table column headers.
 * Shows a subtle line on hover that becomes blue when actively resizing.
 */
export function ColumnResizeHandle({ onMouseDown, isResizing }: ColumnResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 8,
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 2,
          height: '60%',
          backgroundColor: isResizing ? 'var(--mantine-color-blue-5)' : 'transparent',
          borderRadius: 1,
          transition: isResizing ? 'none' : 'background-color 150ms ease',
        }}
        onMouseEnter={e => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-5)';
          }
        }}
        onMouseLeave={e => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      />
    </div>
  );
}
