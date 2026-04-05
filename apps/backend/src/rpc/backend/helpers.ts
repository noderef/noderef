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
