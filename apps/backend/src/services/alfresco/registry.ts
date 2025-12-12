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
  ActionsApi,
  ActivitiesApi,
  AuthenticationApi,
  ClassesApi,
  ContentApi,
  CustomModelApi,
  DownloadsApi,
  FavoritesApi,
  GroupsApi,
  NodesApi,
  PeopleApi,
  PreferencesApi,
  QueriesApi,
  RenditionsApi,
  SearchApi,
  SitesApi,
  TrashcanApi,
  UploadApi,
  VersionsApi,
  WebscriptApi,
} from '@alfresco/js-api';
import type { AlfrescoApi } from '@alfresco/js-api';

/**
 * Registry mapping RPC namespaces to Alfresco JS API classes
 * This enables dynamic instantiation of API classes based on method names
 */

export type ApiClass = new (api: AlfrescoApi) => any;

export interface ApiRegistryEntry {
  namespace: string;
  ApiClass: ApiClass;
}

/**
 * Registry of all Alfresco API classes organized by namespace
 * Namespaces map to RPC method prefixes: alfresco.<namespace>.<method>
 */
export const API_REGISTRY: Record<string, ApiClass> = {
  // content-rest APIs
  nodes: NodesApi,
  people: PeopleApi,
  sites: SitesApi,
  queries: QueriesApi,
  downloads: DownloadsApi,
  activities: ActivitiesApi,
  preferences: PreferencesApi,
  groups: GroupsApi,
  favorites: FavoritesApi,
  trashcan: TrashcanApi,
  versions: VersionsApi,
  renditions: RenditionsApi,
  actions: ActionsApi,

  // search-rest APIs
  search: SearchApi,

  // content-custom APIs
  webscript: WebscriptApi,
  upload: UploadApi,
  classes: ClassesApi,
  content: ContentApi,
  customModel: CustomModelApi,

  // auth-rest APIs
  auth: AuthenticationApi,
};

/**
 * Get the API class for a given namespace
 * @param namespace The namespace (e.g., "nodes", "people")
 * @returns The API class constructor, or undefined if not found
 */
export function getApiClass(namespace: string): ApiClass | undefined {
  return API_REGISTRY[namespace];
}

/**
 * Parse a dotted method name (e.g., "nodes.getNode") into namespace and method
 * @param dottedMethod The dotted method name
 * @returns Object with namespace and method, or undefined if invalid
 */
export function parseMethod(
  dottedMethod: string
): { namespace: string; method: string } | undefined {
  const parts = dottedMethod.split('.');
  if (parts.length < 2) {
    return undefined;
  }

  const namespace = parts[0];
  const method = parts.slice(1).join('.');

  return { namespace, method };
}

/**
 * Check if a namespace is registered
 * @param namespace The namespace to check
 * @returns True if the namespace exists in the registry
 */
export function hasNamespace(namespace: string): boolean {
  return namespace in API_REGISTRY;
}
