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
const ALFRESCO_PUBLIC_V1_SITES_BASE_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/sites';
const ALFRESCO_PUBLIC_V1_DELETED_NODES_BASE_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/deleted-nodes';
const ALFRESCO_PUBLIC_V1_TAGS_BASE_PATH = '/alfresco/api/-default-/public/alfresco/versions/1/tags';
const ALFRESCO_PUBLIC_V1_CATEGORIES_BASE_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/categories';

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
const ALFRESCO_SITE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_SITES_BASE_PATH}/{siteId}`;
const ALFRESCO_SITE_MEMBERS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_SITES_BASE_PATH}/{siteId}/members`;
const ALFRESCO_SITE_MEMBER_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_SITES_BASE_PATH}/{siteId}/members/{personId}`;
const ALFRESCO_SITE_CONTAINERS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_SITES_BASE_PATH}/{siteId}/containers`;
const ALFRESCO_DELETED_NODE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_DELETED_NODES_BASE_PATH}/{nodeId}`;
const ALFRESCO_DELETED_NODE_RESTORE_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_DELETED_NODES_BASE_PATH}/{nodeId}/restore`;
const ALFRESCO_TAG_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_TAGS_BASE_PATH}/{tagId}`;
const ALFRESCO_NODE_TAGS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/tags`;
const ALFRESCO_NODE_TAG_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/tags/{tagId}`;
const ALFRESCO_CATEGORY_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_CATEGORIES_BASE_PATH}/{categoryId}`;
const ALFRESCO_CATEGORY_SUBCATEGORIES_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_CATEGORIES_BASE_PATH}/{categoryId}/subcategories`;
const ALFRESCO_NODE_CATEGORY_LINKS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/category-links`;
const ALFRESCO_NODE_CATEGORY_LINK_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/category-links/{categoryId}`;
const ALFRESCO_PUBLIC_V1_AUDIT_APPLICATIONS_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/audit-applications';
const ALFRESCO_AUDIT_APP_ENTRIES_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_AUDIT_APPLICATIONS_PATH}/{auditApplicationId}/audit-entries`;
const ALFRESCO_NODE_AUDIT_ENTRIES_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/audit-entries`;
const ALFRESCO_ACTION_DEFINITIONS_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/action-definitions';
const ALFRESCO_ACTION_EXECUTIONS_PATH =
  '/alfresco/api/-default-/public/alfresco/versions/1/action-executions';
const ALFRESCO_NODE_ACTION_DEFINITIONS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/action-definitions`;
const ALFRESCO_NODE_LOCK_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/lock`;
const ALFRESCO_NODE_UNLOCK_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/unlock`;
const ALFRESCO_NODE_VERSION_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/versions/{versionId}`;
const ALFRESCO_NODE_VERSION_REVERT_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/versions/{versionId}/revert`;
const ALFRESCO_NODE_COMMENTS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/comments`;
const ALFRESCO_NODE_COMMENT_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/comments/{commentId}`;
const ALFRESCO_NODE_PARENTS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/parents`;
const ALFRESCO_NODE_SECONDARY_CHILDREN_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/secondary-children`;
const ALFRESCO_NODE_SECONDARY_CHILD_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/secondary-children/{childId}`;
const ALFRESCO_NODE_TARGETS_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/targets`;
const ALFRESCO_NODE_TARGET_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/targets/{targetId}`;
const ALFRESCO_NODE_SOURCES_PATH_TEMPLATE = `${ALFRESCO_PUBLIC_V1_NODES_BASE_PATH}/{nodeId}/sources`;

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

export function getAlfrescoSitesCollectionPath(): string {
  return ALFRESCO_PUBLIC_V1_SITES_BASE_PATH;
}

export function getAlfrescoSitePath(siteId: string): string {
  return ALFRESCO_SITE_PATH_TEMPLATE.replace('{siteId}', encodeURIComponent(siteId));
}

export function getAlfrescoSiteMembersPath(siteId: string): string {
  return ALFRESCO_SITE_MEMBERS_PATH_TEMPLATE.replace('{siteId}', encodeURIComponent(siteId));
}

export function getAlfrescoSiteMemberPath(siteId: string, personId: string): string {
  return ALFRESCO_SITE_MEMBER_PATH_TEMPLATE.replace('{siteId}', encodeURIComponent(siteId)).replace(
    '{personId}',
    encodeURIComponent(personId)
  );
}

export function getAlfrescoSiteContainersPath(siteId: string): string {
  return ALFRESCO_SITE_CONTAINERS_PATH_TEMPLATE.replace('{siteId}', encodeURIComponent(siteId));
}

export function getAlfrescoDeletedNodesCollectionPath(): string {
  return ALFRESCO_PUBLIC_V1_DELETED_NODES_BASE_PATH;
}

export function getAlfrescoDeletedNodePath(nodeId: string): string {
  return ALFRESCO_DELETED_NODE_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoDeletedNodeRestorePath(nodeId: string): string {
  return ALFRESCO_DELETED_NODE_RESTORE_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  );
}

export function getAlfrescoTagsCollectionPath(): string {
  return ALFRESCO_PUBLIC_V1_TAGS_BASE_PATH;
}

export function getAlfrescoTagPath(tagId: string): string {
  return ALFRESCO_TAG_PATH_TEMPLATE.replace('{tagId}', encodeURIComponent(tagId));
}

export function getAlfrescoNodeTagsPath(nodeId: string): string {
  return ALFRESCO_NODE_TAGS_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeTagPath(nodeId: string, tagId: string): string {
  return ALFRESCO_NODE_TAG_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId)).replace(
    '{tagId}',
    encodeURIComponent(tagId)
  );
}

export function getAlfrescoCategoryPath(categoryId: string): string {
  return ALFRESCO_CATEGORY_PATH_TEMPLATE.replace('{categoryId}', encodeURIComponent(categoryId));
}

export function getAlfrescoCategorySubcategoriesPath(categoryId: string): string {
  return ALFRESCO_CATEGORY_SUBCATEGORIES_PATH_TEMPLATE.replace(
    '{categoryId}',
    encodeURIComponent(categoryId)
  );
}

export function getAlfrescoNodeCategoryLinksPath(nodeId: string): string {
  return ALFRESCO_NODE_CATEGORY_LINKS_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeCategoryLinkPath(nodeId: string, categoryId: string): string {
  return ALFRESCO_NODE_CATEGORY_LINK_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  ).replace('{categoryId}', encodeURIComponent(categoryId));
}

export function getAlfrescoAuditApplicationsPath(): string {
  return ALFRESCO_PUBLIC_V1_AUDIT_APPLICATIONS_PATH;
}

export function getAlfrescoAuditAppEntriesPath(auditApplicationId: string): string {
  return ALFRESCO_AUDIT_APP_ENTRIES_PATH_TEMPLATE.replace(
    '{auditApplicationId}',
    encodeURIComponent(auditApplicationId)
  );
}

export function getAlfrescoNodeAuditEntriesPath(nodeId: string): string {
  return ALFRESCO_NODE_AUDIT_ENTRIES_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoActionDefinitionsPath(): string {
  return ALFRESCO_ACTION_DEFINITIONS_PATH;
}

export function getAlfrescoActionExecutionsPath(): string {
  return ALFRESCO_ACTION_EXECUTIONS_PATH;
}

export function getAlfrescoNodeActionDefinitionsPath(nodeId: string): string {
  return ALFRESCO_NODE_ACTION_DEFINITIONS_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  );
}

export function getAlfrescoNodeLockPath(nodeId: string): string {
  return ALFRESCO_NODE_LOCK_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeUnlockPath(nodeId: string): string {
  return ALFRESCO_NODE_UNLOCK_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeVersionPath(nodeId: string, versionId: string): string {
  return ALFRESCO_NODE_VERSION_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  ).replace('{versionId}', encodeURIComponent(versionId));
}

export function getAlfrescoNodeVersionRevertPath(nodeId: string, versionId: string): string {
  return ALFRESCO_NODE_VERSION_REVERT_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  ).replace('{versionId}', encodeURIComponent(versionId));
}

export function getAlfrescoNodeCommentsPath(nodeId: string): string {
  return ALFRESCO_NODE_COMMENTS_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeCommentPath(nodeId: string, commentId: string): string {
  return ALFRESCO_NODE_COMMENT_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  ).replace('{commentId}', encodeURIComponent(commentId));
}

export function getAlfrescoNodeParentsPath(nodeId: string): string {
  return ALFRESCO_NODE_PARENTS_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeSecondaryChildrenPath(nodeId: string): string {
  return ALFRESCO_NODE_SECONDARY_CHILDREN_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  );
}

export function getAlfrescoNodeSecondaryChildPath(nodeId: string, childId: string): string {
  return ALFRESCO_NODE_SECONDARY_CHILD_PATH_TEMPLATE.replace(
    '{nodeId}',
    encodeURIComponent(nodeId)
  ).replace('{childId}', encodeURIComponent(childId));
}

export function getAlfrescoNodeTargetsPath(nodeId: string): string {
  return ALFRESCO_NODE_TARGETS_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}

export function getAlfrescoNodeTargetPath(nodeId: string, targetId: string): string {
  return ALFRESCO_NODE_TARGET_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId)).replace(
    '{targetId}',
    encodeURIComponent(targetId)
  );
}

export function getAlfrescoNodeSourcesPath(nodeId: string): string {
  return ALFRESCO_NODE_SOURCES_PATH_TEMPLATE.replace('{nodeId}', encodeURIComponent(nodeId));
}
