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

import {
  IconGauge,
  IconNotes,
  IconCalendarStats,
  IconPresentationAnalytics,
  IconFileAnalytics,
  IconLock,
  IconFolder,
  IconFile,
  IconDatabase,
  IconCode,
  IconBrowser,
  IconEdit,
  IconSettings,
  IconUser,
  IconWorld,
  IconBriefcase,
  IconDashboard,
  IconServer,
  IconSearch,
  IconFileText,
  IconFileTypePdf,
  IconListCheck,
  IconFileSearch,
  IconHash,
  IconPlus,
  IconCpu,
} from '@tabler/icons-react';
import { BrandLogo } from '@/components/BrandLogo';
import { Loader } from '@mantine/core';

const iconMap: Record<string, React.ComponentType<any>> = {
  gauge: IconGauge,
  notes: IconNotes,
  calendar: IconCalendarStats,
  analytics: IconPresentationAnalytics,
  'file-analytics': IconFileAnalytics,
  fileanalytics: IconFileAnalytics,
  file: IconFile,
  settings: IconSettings,
  lock: IconLock,
  folder: IconFolder,
  fileicon: IconFile,
  database: IconDatabase,
  code: IconCode,
  browser: IconBrowser,
  edit: IconEdit,
  settingsIcon: IconSettings,
  user: IconUser,
  world: IconWorld,
  briefcase: IconBriefcase,
  home: BrandLogo,
  dashboard: IconDashboard,
  server: IconServer,
  search: IconSearch,
  'file-text': IconFileText,
  filetext: IconFileText,
  'file-pdf': IconFileTypePdf,
  filepdf: IconFileTypePdf,
  pdf: IconFileTypePdf,
  workflow: IconBriefcase,
  'list-check': IconListCheck,
  listcheck: IconListCheck,
  'file-search': IconFileSearch,
  filesearch: IconFileSearch,
  hash: IconHash,
  agent: IconCpu,
  plus: IconPlus,
};

export function getIconComponent(iconName: string): React.ReactNode {
  const normalizedIconName = iconName.toLowerCase();
  if (normalizedIconName === 'loading') {
    return <Loader size={14} />;
  }

  const IconComponent = iconMap[normalizedIconName];
  if (!IconComponent) {
    return null;
  }
  return <IconComponent size={20} stroke={1.5} />;
}
