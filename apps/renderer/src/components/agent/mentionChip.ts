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

import type { CSSProperties } from 'react';

export const mentionChipBadgeProps = {
  component: 'span' as const,
  size: 'md' as const,
  variant: 'default' as const,
};

export const mentionChipStyle: CSSProperties = {
  display: 'inline-flex',
  verticalAlign: 'middle',
  textTransform: 'none',
  margin: '0 2px',
  backgroundColor: 'var(--mantine-color-gray-2)',
  color: 'var(--mantine-color-dark-4)',
};

export const mentionChipWrapperStyle: CSSProperties = {
  display: 'inline-block',
  verticalAlign: 'middle',
};
