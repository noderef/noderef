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

import { PageKey } from '@/core/store/keys';
import { DashboardPage } from '@/pages/DashboardPage';
import { FileFolderBrowserPage } from '@/pages/FileFolderBrowserPage';
import { LocalFilesPage } from '@/pages/LocalFilesPage';
import { NodeBrowserPage } from '@/pages/NodeBrowserPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SavedSearchPage } from '@/pages/SavedSearchPage';
import { SearchPage } from '@/pages/SearchPage';
import { ComponentType, lazy } from 'react';

// Lazy load Monaco-dependent pages to reduce initial bundle size
const JsConsolePage = lazy(() => import('@/pages/JsConsolePage'));
const TextEditorPage = lazy(() => import('@/pages/TextEditorPage'));

export interface RouteConfig {
  title: string; // Full i18n key
  defaultTitle: string;
  icon: string;
  component: ComponentType;
  options?: {
    noScroll?: boolean;
  };
}

export const routes: Record<PageKey, RouteConfig> = {
  dashboard: {
    title: 'submenu:dashboard',
    defaultTitle: 'Dashboard',
    icon: 'dashboard',
    component: DashboardPage,
  },
  files: {
    title: 'submenu:files',
    defaultTitle: 'My Files',
    icon: 'folder',
    component: LocalFilesPage,
  },
  repo: {
    title: 'submenu:repository',
    defaultTitle: 'Repository',
    icon: 'folder',
    component: NotFoundPage, // Repository tree is in submenu
  },
  search: {
    title: 'submenu:search',
    defaultTitle: 'Search',
    icon: 'search',
    component: SearchPage,
  },
  'saved-search': {
    title: 'search:savedSearchPage',
    defaultTitle: 'Saved search',
    icon: 'search',
    component: SavedSearchPage,
  },
  jsconsole: {
    title: 'submenu:jsConsole',
    defaultTitle: 'JavaScript Console',
    icon: 'code',
    component: JsConsolePage,
    options: {
      noScroll: true,
    },
  },
  'node-browser': {
    title: 'submenu:nodeBrowser',
    defaultTitle: 'Node Browser',
    icon: 'file-search',
    component: NodeBrowserPage,
  },
  'file-folder-browser': {
    title: 'submenu:fileFolderBrowser',
    defaultTitle: 'Browse',
    icon: 'folder',
    component: FileFolderBrowserPage,
  },
  'text-editor': {
    title: 'submenu:textEditor',
    defaultTitle: 'Text Editor',
    icon: 'edit',
    component: TextEditorPage,
    options: {
      noScroll: true,
    },
  },
};

export function getRoute(key: PageKey | string): RouteConfig {
  if (key in routes) {
    return routes[key as PageKey];
  }
  // Fallback for unknown routes
  return {
    title: 'submenu:dashboard',
    defaultTitle: 'Page',
    icon: 'file',
    component: NotFoundPage,
  };
}
