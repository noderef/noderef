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

const ALFRESCO_PUBLIC_V1_NODES_BASE_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/nodes';
const ALFRESCO_PUBLIC_V1_PEOPLE_BASE_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/people';
const ALFRESCO_PUBLIC_V1_GROUPS_BASE_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/groups';

export const ALFRESCO_NODE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}`;
const ALFRESCO_NODE_CHILDREN_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{parentId}/children`;
const ALFRESCO_NODE_CONTENT_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/content`;
const ALFRESCO_NODE_VERSIONS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/versions`;
const ALFRESCO_NODE_MOVE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/move`;
const ALFRESCO_NODE_COPY_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/copy`;
const ALFRESCO_PERSON_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_PEOPLE_BASE_PATH}/{personId}`;
const ALFRESCO_GROUP_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_GROUPS_BASE_PATH}/{groupId}`;
const ALFRESCO_GROUP_MEMBERS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_GROUPS_BASE_PATH}/{groupId}/members`;
const ALFRESCO_GROUP_MEMBER_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_GROUPS_BASE_PATH}/{groupId}/members/{memberId}`;

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

export function getAlfrescoNodeVersionsPath(nodeId: string): string {
  return ALFRESCO_NODE_VERSIONS_PATH_TEMPLATE.replace('{nodeId}', nodeId);
}

export function getAlfrescoPeoplePath(personId: string): string {
  return ALFRESCO_PERSON_PATH_TEMPLATE.replace('{personId}', personId);
}

export function getAlfrescoPeopleCollectionPath(): string {
  return ALFRESCO_PUBLIC_V1_PEOPLE_BASE_PATH;
}

export function getAlfrescoGroupPath(groupId: string): string {
  return ALFRESCO_GROUP_PATH_TEMPLATE.replace('{groupId}', groupId);
}

export function getAlfrescoGroupMembersPath(groupId: string): string {
  return ALFRESCO_GROUP_MEMBERS_PATH_TEMPLATE.replace('{groupId}', groupId);
}

export function getAlfrescoGroupMemberPath(groupId: string, memberId: string): string {
  return ALFRESCO_GROUP_MEMBER_PATH_TEMPLATE.replace('{groupId}', groupId).replace(
    '{memberId}',
    memberId
  );
}
