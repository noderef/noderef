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
  IconListCheck,
  IconFileSearch,
  IconHash,
} from '@tabler/icons-react';
import { BrandLogo } from '@/components/BrandLogo';

const iconMap: Record<string, React.ComponentType<any>> = {
  gauge: IconGauge,
  notes: IconNotes,
  calendar: IconCalendarStats,
  analytics: IconPresentationAnalytics,
  file: IconFileAnalytics,
  settings: IconSettings,
  lock: IconLock,
  folder: IconFolder,
  fileIcon: IconFile,
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
  fileText: IconFileText,
  workflow: IconBriefcase,
  'list-check': IconListCheck,
  listCheck: IconListCheck,
  'file-search': IconFileSearch,
  fileSearch: IconFileSearch,
  hash: IconHash,
};

export function getIconComponent(iconName: string): React.ReactNode {
  const IconComponent = iconMap[iconName.toLowerCase()];
  if (!IconComponent) {
    return null;
  }
  return <IconComponent size={20} stroke={1.5} />;
}
