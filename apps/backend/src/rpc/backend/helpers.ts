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
 * Shared helper functions for backend RPC handlers
 * Consolidates utility functions used across multiple domain modules
 */

import { buildSlingshotNodeUrl } from '../../lib/alfresco-url.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('backend.rpc.helpers');

/**
 * Fetch node data from Alfresco Slingshot API
 */
export async function fetchSlingshotNodeData(
  baseUrl: string,
  nodeId: string,
  username: string,
  token: string,
  authType: 'basic' | 'openid_connect' = 'basic'
): Promise<{ nodeData: any; slingshotUrl: string }> {
  const nodeRef = `workspace/SpacesStore/${nodeId}`;
  const slingshotUrl = buildSlingshotNodeUrl(baseUrl, nodeRef);

  // Build Authorization header based on auth type
  const authHeader =
    authType === 'openid_connect'
      ? `Bearer ${token}`
      : `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;

  const response = await fetch(slingshotUrl, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    log.error({ slingshotUrl, status: response.status }, 'Failed to fetch node details');
    throw new Error(`Failed to fetch node details: ${response.statusText}`);
  }

  const nodeData = await response.json();
  return { nodeData, slingshotUrl };
}

/**
 * Normalize a node reference to workspace://SpacesStore/{guid} format
 */
export function normalizeNodeRef(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.includes('://')) {
    return value;
  }

  if (value.startsWith('workspace/')) {
    return value.replace('workspace/', 'workspace://');
  }

  return `workspace://SpacesStore/${value}`;
}

/**
 * Extract MIME type from Slingshot node data
 */
export function extractMimeTypeFromSlingshotNode(nodeData: any): string | null {
  if (!Array.isArray(nodeData?.properties)) {
    return null;
  }

  const contentProperty = nodeData.properties.find((prop: any) => {
    const prefixedName = prop?.name?.prefixedName ?? prop?.name;
    return (
      prefixedName === 'cm:content' ||
      prefixedName === '{http://www.alfresco.org/model/content/1.0}content'
    );
  });

  if (!contentProperty) {
    return null;
  }

  const firstValue = contentProperty.values?.[0]?.value;
  if (!firstValue) {
    return null;
  }

  if (typeof firstValue === 'string') {
    const match = firstValue.match(/mimetype=([^|]+)/i);
    return match ? match[1] : null;
  }

  if (typeof firstValue === 'object') {
    if (typeof firstValue.mimetype === 'string' && firstValue.mimetype) {
      return firstValue.mimetype;
    }
    if (typeof firstValue.mimeType === 'string' && firstValue.mimeType) {
      return firstValue.mimeType;
    }
  }

  return null;
}

/**
 * Extract a property value from Slingshot node data
 */
function extractPropertyValueFromSlingshotNode(
  nodeData: any,
  propertyNames: string[]
): string | null {
  if (!Array.isArray(nodeData?.properties)) {
    return null;
  }

  const property = nodeData.properties.find((prop: any) => {
    const prefixedName = prop?.name?.prefixedName ?? prop?.name;
    return propertyNames.includes(prefixedName);
  });

  if (!property) {
    return null;
  }

  const firstValue = property.values?.[0]?.value;
  if (!firstValue) {
    return null;
  }

  if (typeof firstValue === 'string') {
    return firstValue;
  }

  if (typeof firstValue === 'object' && typeof firstValue.value === 'string') {
    return firstValue.value;
  }

  return null;
}

/**
 * Extract node name from Slingshot node data
 */
export function extractNodeNameFromSlingshotNode(nodeData: any): string | null {
  const typeName = nodeData?.type?.prefixedName ?? nodeData?.type;

  if (typeName === 'cm:person') {
    const username = extractPropertyValueFromSlingshotNode(nodeData, [
      'cm:userName',
      '{http://www.alfresco.org/model/person/1.0}userName',
    ]);
    if (username) {
      return username;
    }
  }

  return (
    extractPropertyValueFromSlingshotNode(nodeData, [
      'cm:name',
      '{http://www.alfresco.org/model/content/1.0}name',
    ]) ?? null
  );
}

/**
 * Extract parent reference from Slingshot node data
 */
export function extractParentRefFromSlingshotNode(nodeData: any): string | null {
  if (!Array.isArray(nodeData?.parents)) {
    return null;
  }

  const primaryParent =
    nodeData.parents.find((parent: any) => parent?.primary) ?? nodeData.parents[0];
  const parentNodeRef = primaryParent?.nodeRef ?? primaryParent?.nodeId ?? null;

  if (typeof parentNodeRef === 'string' && parentNodeRef) {
    return normalizeNodeRef(parentNodeRef);
  }

  return null;
}

/**
 * Extract parent reference from Alfresco API node entry
 */
export function extractParentRefFromNodeEntry(nodeEntry: any): string | null {
  if (typeof nodeEntry?.parentId === 'string' && nodeEntry.parentId) {
    return normalizeNodeRef(nodeEntry.parentId);
  }

  const elements = nodeEntry?.path?.elements;
  if (Array.isArray(elements) && elements.length > 0) {
    const parentElement = elements[elements.length - 1];
    if (typeof parentElement?.id === 'string' && parentElement.id) {
      return normalizeNodeRef(parentElement.id);
    }
  }

  return null;
}

/**
 * Get a property value from a node's properties object
 */
export function getNodePropertyValue(node: any, propertyName: string): string | undefined {
  const value = node.properties?.[propertyName];
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    return value.filter(entry => entry != null).join(', ');
  }

  if (typeof value === 'object') {
    if ('value' in value && value.value != null) {
      return String(value.value);
    }
    if ('displayName' in value && value.displayName != null) {
      return String(value.displayName);
    }
  }

  return typeof value === 'string' ? value : String(value);
}

/**
 * Map an Alfresco API node entry to a standardized format
 */
function mapNodeEntry(entry: any) {
  return {
    id: entry.id,
    name: entry.name,
    isFolder: entry.isFolder,
    isFile: entry.isFile,
    nodeType: entry.nodeType,
    mimeType: entry.content?.mimeType,
    description: getNodePropertyValue(entry, 'cm:description'),
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt,
    modifiedBy: entry.modifiedByUser?.displayName || entry.modifiedByUser?.id,
    modifiedById: entry.modifiedByUser?.id,
    hasChildren: entry.isFolder,
    path: entry.path?.name,
  };
}

const SYSTEM_FOLDER_NAME = 'system';
const SYSTEM_FOLDER_QNAME = 'sys:system';
const STORE_CHILDREN_ASSOC = 'sys:children';

type NodesApiLike = {
  getNode: (nodeId: string, opts?: Record<string, unknown>) => Promise<any>;
  listNodeChildren: (nodeId: string, opts?: Record<string, unknown>) => Promise<any>;
  listParents?: (nodeId: string, opts?: Record<string, unknown>) => Promise<any>;
};

type SearchApiLike = {
  search: (query: unknown) => Promise<any>;
};

export type ResolveSystemNodeIdOptions = {
  searchApi?: SearchApiLike;
  fetchSlingshotNode?: (nodeId: string) => Promise<any>;
};

function isSystemFolderName(name: unknown): boolean {
  return typeof name === 'string' && name.toLowerCase() === SYSTEM_FOLDER_NAME;
}

function nodeIdFromRef(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  const uuid = value.split('/').pop();
  return uuid || undefined;
}

function findSystemChildId(result: any): string | undefined {
  const entries = result?.list?.entries;
  if (!Array.isArray(entries)) {
    return undefined;
  }

  const match = entries.find((item: any) => isSystemFolderName(item?.entry?.name));
  return typeof match?.entry?.id === 'string' ? match.entry.id : undefined;
}

function findSystemSlingshotChildId(nodeData: any): string | undefined {
  const children = nodeData?.children;
  if (!Array.isArray(children)) {
    return undefined;
  }

  const match = children.find((child: any) => {
    const qname = child?.name?.prefixedName ?? child?.qname?.prefixedName;
    const name = child?.name?.name ?? child?.name;
    return qname === SYSTEM_FOLDER_QNAME || isSystemFolderName(name);
  });

  return nodeIdFromRef(match?.nodeRef);
}

async function listSystemChildId(
  nodesApi: NodesApiLike,
  parentId: string,
  assocType?: string
): Promise<string | undefined> {
  const result = await nodesApi.listNodeChildren(parentId, {
    ...(assocType ? { where: `(assocType='${assocType}')` } : {}),
    maxItems: 200,
  });
  return findSystemChildId(result);
}

async function resolveStoreRootId(
  nodesApi: NodesApiLike,
  companyHome: any
): Promise<string | undefined> {
  const parentId = companyHome?.entry?.parentId;
  if (typeof parentId === 'string' && parentId) {
    return parentId;
  }

  // GET /nodes/-root- is Company Home and Alfresco omits parentId on purpose.
  if (!nodesApi.listParents) {
    return undefined;
  }

  try {
    const parents = await nodesApi.listParents('-root-', {
      where: '(isPrimary=true)',
      maxItems: 10,
    });
    const id = parents?.list?.entries?.[0]?.entry?.id;
    return typeof id === 'string' && id ? id : undefined;
  } catch (err) {
    log.warn({ err }, 'Failed to list parents of -root- while resolving sys:system');
    return undefined;
  }
}

async function tryListSystemChild(
  nodesApi: NodesApiLike,
  parentId: string,
  assocType?: string
): Promise<string | undefined> {
  try {
    return await listSystemChildId(nodesApi, parentId, assocType);
  } catch (err) {
    log.warn(
      { err, parentId, assocType },
      'Failed to list children while resolving sys:system'
    );
    return undefined;
  }
}

async function resolveViaNodesApi(nodesApi: NodesApiLike): Promise<string | undefined> {
  const companyHome = await nodesApi.getNode('-root-');
  const storeRootId = await resolveStoreRootId(nodesApi, companyHome);
  const rootId = companyHome?.entry?.id;

  if (storeRootId) {
    const fromStoreRoot =
      (await tryListSystemChild(nodesApi, storeRootId, STORE_CHILDREN_ASSOC)) ??
      (await tryListSystemChild(nodesApi, storeRootId));
    if (fromStoreRoot) {
      return fromStoreRoot;
    }
  }

  // `-root-` is Company Home; only sys:children is safe here so we don't pick a
  // user folder named "system". Some servers may still map -root- to store root.
  const maybeRootIds = ['-root-', typeof rootId === 'string' ? rootId : undefined];
  const seen = new Set(storeRootId ? [storeRootId] : []);
  for (const parentId of maybeRootIds) {
    if (!parentId || seen.has(parentId)) {
      continue;
    }
    seen.add(parentId);
    const fromRoot = await tryListSystemChild(nodesApi, parentId, STORE_CHILDREN_ASSOC);
    if (fromRoot) {
      return fromRoot;
    }
  }

  return undefined;
}

async function resolveViaSlingshot(
  nodesApi: NodesApiLike,
  fetchSlingshotNode: (nodeId: string) => Promise<any>
): Promise<string | undefined> {
  const companyHome = await nodesApi.getNode('-root-');
  const companyHomeId = companyHome?.entry?.id;
  if (typeof companyHomeId !== 'string' || !companyHomeId) {
    return undefined;
  }

  const companyHomeData = await fetchSlingshotNode(companyHomeId);
  const storeRootId = nodeIdFromRef(extractParentRefFromSlingshotNode(companyHomeData));
  if (!storeRootId) {
    return undefined;
  }

  const storeRootData = await fetchSlingshotNode(storeRootId);
  return findSystemSlingshotChildId(storeRootData);
}

async function resolveViaSearch(searchApi: SearchApiLike): Promise<string | undefined> {
  const searchResult = await searchApi.search({
    query: {
      query: `PATH:"/${SYSTEM_FOLDER_QNAME}"`,
      language: 'afts',
    },
    fields: ['id'],
  });
  const nodeId = searchResult?.list?.entries?.[0]?.entry?.id;
  return typeof nodeId === 'string' && nodeId ? nodeId : undefined;
}

/**
 * Resolve the /sys:system node ID without depending on SOLR first.
 *
 * `-root-` is Company Home. Its parent (the SpacesStore root) is hidden on GET
 * /nodes, and sys:system is a sys:children sibling — not a cm:contains child.
 */
export async function resolveSystemNodeId(
  nodesApi: NodesApiLike,
  options?: ResolveSystemNodeIdOptions
): Promise<string | null> {
  try {
    const fromNodes = await resolveViaNodesApi(nodesApi);
    if (fromNodes) {
      return fromNodes;
    }
  } catch (err) {
    log.warn({ err }, 'Nodes API lookup failed while resolving sys:system');
  }

  if (options?.fetchSlingshotNode) {
    try {
      const fromSlingshot = await resolveViaSlingshot(nodesApi, options.fetchSlingshotNode);
      if (fromSlingshot) {
        return fromSlingshot;
      }
    } catch (err) {
      log.warn({ err }, 'Slingshot lookup failed while resolving sys:system');
    }
  }

  if (options?.searchApi) {
    try {
      const fromSearch = await resolveViaSearch(options.searchApi);
      if (fromSearch) {
        return fromSearch;
      }
    } catch (err) {
      log.warn({ err }, 'AFTS fallback failed while resolving sys:system');
    }
  }

  return null;
}
