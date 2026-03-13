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

/**
 * Centralized type definitions for PageKey and ModalKey
 * to avoid drift and ensure type safety across the app.
 */

export type PageKey =
  | 'dashboard'
  | 'files'
  | 'repo'
  | 'search'
  | 'agentPage'
  | 'jsconsole'
  | 'node-browser'
  | 'file-folder-browser'
  | 'text-editor'
  | 'saved-search'
  | 'saved-search-new'
  | 'insights';

export type ModalKey =
  | 'settings'
  | 'server_info'
  | 'server_edit'
  | 'server_remove_confirm'
  | 'add_server'
  | 'confirm'
  | 'create_search_query'
  | 'save_search'
  | 'logs'
  | 'reauth'
  | 'node_permissions'
  | 'users_groups';

export type ServerType = 'alfresco' | 'process_services';

export const PAGE_KEYS: Record<string, PageKey> = {
  DASHBOARD: 'dashboard',
  FILES: 'files',
  REPO: 'repo',
  SEARCH: 'search',
  AGENT_PAGE: 'agentPage',
  JSCONSOLE: 'jsconsole',
  NODE_BROWSER: 'node-browser',
  FILE_FOLDER_BROWSER: 'file-folder-browser',
  TEXT_EDITOR: 'text-editor',
  SAVED_SEARCH: 'saved-search',
  SAVED_SEARCH_NEW: 'saved-search-new',
  INSIGHTS: 'insights',
} as const;

export const MODAL_KEYS: Record<string, ModalKey> = {
  SETTINGS: 'settings',
  SERVER_INFO: 'server_info',
  SERVER_EDIT: 'server_edit',
  SERVER_REMOVE_CONFIRM: 'server_remove_confirm',
  ADD_SERVER: 'add_server',
  CONFIRM: 'confirm',
  CREATE_SEARCH_QUERY: 'create_search_query',
  SAVE_SEARCH: 'save_search',
  LOGS: 'logs',
  REAUTH: 'reauth',
  NODE_PERMISSIONS: 'node_permissions',
  USERS_GROUPS: 'users_groups',
} as const;
