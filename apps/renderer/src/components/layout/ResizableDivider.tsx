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

import { useEffect, useRef, useState, useCallback } from 'react';

interface ResizableDividerProps {
  onResize: (width: number) => void;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function ResizableDivider({
  onResize,
  initialWidth,
  minWidth,
  maxWidth,
}: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [width, setWidth] = useState(initialWidth);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  // Sync local state with prop changes (e.g., from store persistence)
  useEffect(() => {
    if (!isDragging) {
      setWidth(initialWidth);
    }
  }, [initialWidth, isDragging]);

  useEffect(() => {
    return () => {
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const applyResize = useCallback(
    (nextWidth: number) => {
      pendingWidth.current = nextWidth;
      if (rafId.current != null) return;

      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const pending = pendingWidth.current;
        if (pending == null) return;

        pendingWidth.current = null;
        setWidth(pending);
        onResize(pending);

        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(
          new CustomEvent('noderef:layout-resize', { detail: { submenuWidth: pending } })
        );
      });
    },
    [onResize]
  );

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => {
        // Delta is positive when dragging right (increases width), negative when dragging left (decreases width)
        const delta = e.clientX - startXRef.current;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
        applyResize(newWidth);
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
    }
  }, [applyResize, isDragging, maxWidth, minWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const lineColor =
    isHovered || isDragging ? 'var(--mantine-color-blue-5)' : 'var(--layout-divider-color)';

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!isDragging) {
          setIsHovered(false);
        }
      }}
      style={{
        width: '2px',
        cursor: 'col-resize',
        backgroundColor: 'transparent',
        position: 'relative',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Left line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '0.5px',
          backgroundColor: lineColor,
          transition: isDragging ? 'none' : 'background-color 150ms ease',
          opacity: 1,
        }}
      />
      {/* Right line */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '0.5px',
          backgroundColor: lineColor,
          transition: isDragging ? 'none' : 'background-color 150ms ease',
          opacity: 1,
        }}
      />
    </div>
  );
}
