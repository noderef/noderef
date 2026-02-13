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

const STORAGE_KEY = 'noderef-column-widths';

interface ColumnWidths {
  [columnId: string]: number;
}

interface PerServerWidths {
  [serverKey: string]: ColumnWidths;
}

/**
 * Reads all column widths from localStorage
 */
const readAllWidths = (): PerServerWidths => {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as PerServerWidths;
    }
  } catch (error) {
    console.warn('Failed to read column widths from localStorage:', error);
  }

  return {};
};

/**
 * Gets the storage key for a specific server
 */
const getServerKey = (serverId: number | null): string => {
  return serverId === null ? 'noderef-space' : `server-${serverId}`;
};

/**
 * Gets a specific column width for a server
 */
const getPersistedWidth = (
  serverId: number | null,
  columnId: string,
  defaultWidth: number
): number => {
  const allWidths = readAllWidths();
  const serverKey = getServerKey(serverId);
  const serverWidths = allWidths[serverKey];

  if (serverWidths && typeof serverWidths[columnId] === 'number') {
    return serverWidths[columnId];
  }

  return defaultWidth;
};

/**
 * Persists a column width for a server
 */
const setPersistedWidth = (serverId: number | null, columnId: string, width: number): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const allWidths = readAllWidths();
    const serverKey = getServerKey(serverId);
    const serverWidths = allWidths[serverKey] || {};

    const nextState: PerServerWidths = {
      ...allWidths,
      [serverKey]: {
        ...serverWidths,
        [columnId]: width,
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn('Failed to persist column width:', error);
  }
};

interface UseColumnResizeOptions {
  serverId: number | null;
  columnId: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
}

interface UseColumnResizeResult {
  width: number;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing resizable table columns with per-server localStorage persistence.
 *
 * @example
 * ```tsx
 * const { width, isDragging, handleMouseDown } = useColumnResize({
 *   serverId: 1,
 *   columnId: 'name',
 *   defaultWidth: 200,
 *   minWidth: 100,
 *   maxWidth: 500,
 * });
 *
 * <Table.Th style={{ width, position: 'relative' }}>
 *   Name
 *   <div onMouseDown={handleMouseDown} style={{ cursor: 'col-resize', ... }} />
 * </Table.Th>
 * ```
 */
export function useColumnResize({
  serverId,
  columnId,
  defaultWidth,
  minWidth = 80,
  maxWidth = 600,
}: UseColumnResizeOptions): UseColumnResizeResult {
  const [width, setWidth] = useState(() => {
    const stored = getPersistedWidth(serverId, columnId, defaultWidth);
    return Math.max(minWidth, Math.min(maxWidth, stored));
  });
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  // Sync state when serverId changes
  useEffect(() => {
    const storedWidth = getPersistedWidth(serverId, columnId, defaultWidth);
    setWidth(Math.max(minWidth, Math.min(maxWidth, storedWidth)));
  }, [serverId, columnId, defaultWidth, minWidth, maxWidth]);

  // Cleanup RAF on unmount
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
        setPersistedWidth(serverId, columnId, pending);
      });
    },
    [serverId, columnId]
  );

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startXRef.current;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));
        applyResize(newWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  return { width, isDragging, handleMouseDown };
}
