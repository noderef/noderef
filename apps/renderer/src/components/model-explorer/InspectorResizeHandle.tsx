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

import { useCallback, useEffect, useRef, useState } from 'react';

interface InspectorResizeHandleProps {
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
}

/** Drag handle on the left edge of a right-side panel (drag left to widen). */
export function InspectorResizeHandle({
  width,
  minWidth,
  maxWidth,
  onResize,
}: InspectorResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  useEffect(() => {
    if (!isDragging) {
      startWidthRef.current = width;
    }
  }, [width, isDragging]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const delta = startXRef.current - event.clientX;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
      onResize(nextWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsHovered(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, maxWidth, minWidth, onResize]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsDragging(true);
      startXRef.current = event.clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  const lineColor =
    isHovered || isDragging ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-default-border)';

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!isDragging) {
          setIsHovered(false);
        }
      }}
      style={{
        width: 6,
        flexShrink: 0,
        cursor: 'col-resize',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 2,
          top: 0,
          bottom: 0,
          width: 2,
          borderRadius: 1,
          backgroundColor: lineColor,
          transition: isDragging ? 'none' : 'background-color 150ms ease',
        }}
      />
    </div>
  );
}
