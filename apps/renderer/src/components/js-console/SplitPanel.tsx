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
import React, { ReactNode, useEffect, useRef, useState } from 'react';

interface SplitPanelProps {
  topPanel: ReactNode;
  middleBar?: ReactNode; // Optional middle bar between panels
  bottomPanel: ReactNode;
  initialSplitPosition?: number; // percentage (0-100)
  onSplitChange?: (position: number) => void;
  minTopHeight?: number; // minimum height in pixels
  minBottomHeight?: number; // minimum height in pixels
}

export function SplitPanel({
  topPanel,
  middleBar,
  bottomPanel,
  initialSplitPosition = 60,
  onSplitChange,
  minTopHeight = 200,
  minBottomHeight = 150,
}: SplitPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPosition, setSplitPosition] = useState(initialSplitPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const containerHeight = rect.height;

      // Calculate new split position as percentage
      let newPosition = (y / containerHeight) * 100;

      // Apply minimum constraints
      const minTopPercent = (minTopHeight / containerHeight) * 100;
      const minBottomPercent = (minBottomHeight / containerHeight) * 100;

      newPosition = Math.max(minTopPercent, Math.min(100 - minBottomPercent, newPosition));

      setSplitPosition(newPosition);
      onSplitChange?.(newPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsHovered(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minTopHeight, minBottomHeight, onSplitChange]);

  const lineColor =
    isHovered || isDragging ? 'var(--mantine-color-blue-5)' : 'var(--layout-divider-color)';

  return (
    <Box
      ref={containerRef}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      {isDragging && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: 'ns-resize',
          }}
        />
      )}
      {/* Top Panel */}
      <Box
        style={{
          height: `${splitPosition}%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {topPanel}
      </Box>

      {/* Divider */}
      <Box
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          if (!isDragging) {
            setIsHovered(false);
          }
        }}
        style={{
          height: '2px',
          cursor: 'ns-resize',
          backgroundColor: 'transparent',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {/* Top line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '0.5px',
            backgroundColor: lineColor,
            transition: isDragging ? 'none' : 'background-color 150ms ease',
            opacity: 1,
          }}
        />
        {/* Bottom line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '0.5px',
            backgroundColor: lineColor,
            transition: isDragging ? 'none' : 'background-color 150ms ease',
            opacity: 1,
          }}
        />
      </Box>

      {/* Middle Bar (optional - e.g., execute button) */}
      {middleBar && <Box style={{ flexShrink: 0 }}>{middleBar}</Box>}

      {/* Bottom Panel */}
      <Box
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {bottomPanel}
      </Box>
    </Box>
  );
}
