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

import type { SchemaNodeData } from './types';

/** Matches `max-width` in nodeStyles.css */
const SCHEMA_NODE_WIDTH = 250;

/** Matches MAX_PROPS in SchemaNode.tsx */
export const SCHEMA_NODE_MAX_DISPLAYED_PROPS = 5;

/** Vertical chrome: padding, kind label, title (single line), borders */
const HEADER_HEIGHT = 64;
/** One property row at 12px / line-height 1.35 */
const PROPERTY_ROW_HEIGHT = 19;
/** "+N more" badge block */
const MORE_BADGE_HEIGHT = 20;
/** Small safety margin for ELK only (not applied to DOM node size) */
const NODE_HEIGHT_BUFFER = 8;
/** Extra height when the title wraps to a second line */
const WRAPPED_TITLE_HEIGHT = 16;
const WRAPPED_TITLE_CHAR_THRESHOLD = 28;

function estimateSchemaNodeHeight(propertyCount: number, label?: string): number {
  const displayed = Math.min(propertyCount, SCHEMA_NODE_MAX_DISPLAYED_PROPS);
  const hasMoreBadge = propertyCount > displayed;
  const wrappedTitle =
    label !== undefined && label.length > WRAPPED_TITLE_CHAR_THRESHOLD ? WRAPPED_TITLE_HEIGHT : 0;

  return (
    HEADER_HEIGHT +
    wrappedTitle +
    displayed * PROPERTY_ROW_HEIGHT +
    (hasMoreBadge ? MORE_BADGE_HEIGHT : 0) +
    NODE_HEIGHT_BUFFER
  );
}

export function getSchemaNodeDimensions(data: SchemaNodeData | undefined): {
  width: number;
  height: number;
} {
  const propertyCount = data?.record.properties.length ?? 0;
  const label = data?.record.label;

  return {
    width: SCHEMA_NODE_WIDTH,
    height: estimateSchemaNodeHeight(propertyCount, label),
  };
}
