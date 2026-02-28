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

const ALFRESCO_PUBLIC_V1_NODES_BASE_PATH = '/alfresco/api/-default-/public/alfresco/versions/1/nodes';

export const ALFRESCO_NODE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}`;
export const ALFRESCO_NODE_CHILDREN_PATH_TEMPLATE =
  `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{parentId}/children`;
export const ALFRESCO_NODE_CONTENT_PATH_TEMPLATE =
  `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/content`;
export const ALFRESCO_NODE_MOVE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/move`;
export const ALFRESCO_NODE_COPY_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/copy`;

export function getAlfrescoNodePath(nodeId: string): string {
  return ALFRESCO_NODE_PATH_TEMPLATE.replace('{nodeId}', nodeId);
}

export function getAlfrescoNodeChildrenPath(parentId: string): string {
  return ALFRESCO_NODE_CHILDREN_PATH_TEMPLATE.replace('{parentId}', parentId);
}

export function getAlfrescoNodeContentPath(nodeId: string, property?: string): string {
  const basePath = ALFRESCO_NODE_CONTENT_PATH_TEMPLATE.replace('{nodeId}', nodeId);
  if (!property?.trim()) {
    return basePath;
  }
  return `${basePath};${property.trim()}`;
}

export function getAlfrescoNodeMovePath(nodeId: string): string {
  return ALFRESCO_NODE_MOVE_PATH_TEMPLATE.replace('{nodeId}', nodeId);
}

export function getAlfrescoNodeCopyPath(nodeId: string): string {
  return ALFRESCO_NODE_COPY_PATH_TEMPLATE.replace('{nodeId}', nodeId);
}
