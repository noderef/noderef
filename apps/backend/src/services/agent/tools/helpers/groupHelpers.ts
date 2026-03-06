/**
 * Copyright 2025-2026 NodeRef — Apache 2.0
 */

export function normalizeGroupId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('GROUP_') ? trimmed : `GROUP_${trimmed}`;
}
