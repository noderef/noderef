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

import type { TreeNodeData } from '@mantine/core';

export type DisplayMode = 'menu' | 'tree';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  viewMode: 'monaco' | 'webview';
  content?: string;
  url?: string;
}

export interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
  collapsible?: boolean;
  icon?: string;
  initiallyOpened?: boolean;
}

export interface TreeNode extends TreeNodeData {
  value: string;
  label: string;
  children?: TreeNode[];
  viewMode?: 'monaco' | 'webview';
  content?: string;
  url?: string;
}

export interface Tab {
  id: string;
  label: string;
  icon?: string;
  displayMode: DisplayMode;
  sections?: MenuSection[];
  treeData?: TreeNode[];
}
