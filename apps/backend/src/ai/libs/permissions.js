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

/**
 * PERMISSIONS ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - permissions -> ScriptPermissionService (wraps Alfresco PermissionService)
 *
 * API overview:
 *   Read / checks:
 *     - permissions.hasReadPermission(nodeRefString) : boolean
 *     - permissions.hasReadPermission(scriptNode) : boolean
 *     - permissions.hasPermission(nodeRefString, permission) : boolean
 *     - permissions.hasPermission(scriptNode, permission) : boolean
 *     - permissions.hasPermission(nodeRefString, permission, authorityName) : boolean (runAs authority)
 *     - permissions.hasPermission(scriptNode, permission, authorityScriptNode) : boolean (runAs authority.username)
 *
 *   Listing:
 *     - permissions.getPermissions(nodeRefString) : JS Array<AccessPermission>
 *     - permissions.getPermissionsOfCurrentUser(scriptNode) : JS Array<AccessPermission>
 *     - permissions.getAllPermissions(scriptNode) : JS Array<AccessPermission> (all set permissions, not only current user)
 *
 *   Mutations:
 *     - permissions.setPermission(nodeRefString, permission, authority, allow) : void
 *     - permissions.deletePermission(nodeRefString, permission, authority) : void
 *     - permissions.deletePermissions(nodeRefString) : void (delete all set perms on node)
 *     - permissions.clearPermissions(nodeRefString, authority) : void (remove all perms for authority)
 *
 *   Store-wide:
 *     - permissions.deleteStorePermissions(protocol, storeId) : void
 *     - permissions.clearStorePermission(protocol, storeId, authority) : void
 *
 *   Inheritance:
 *     - permissions.setInheritParentPermissions(nodeRefString, "true"|"false") : void
 *     - permissions.isInheritParentPermissions(nodeRefString) : boolean
 *
 * Notes:
 *   - permission names are the internal ones from permissionDefinitions.xml
 *     e.g. "Read", "Consumer", "Contributor", "Editor", "Collaborator", "Coordinator", etc.
 *   - authorities can be usernames ("jdoe") or groups ("GROUP_EVERYONE", "GROUP_SITE_XYZ_COLLABORATORS", ...)
 *   - getPermissions() returns AccessPermission objects (Java). You usually inspect:
 *       getAuthority(), getPermission(), getAccessStatus()
 */

/**
 * Check if current user can read a node.
 */
function example_hasReadPermission() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var allowed = permissions.hasReadPermission(node);
  logger.log('Read allowed for current user? ' + allowed + ' on ' + node.nodeRef);
}

/**
 * Check if a user/group has a permission.
 *
 * This uses runAs(authority) inside the Java wrapper:
 * permissions.hasPermission(nodeRef, permission, authorityName)
 *
 * Great for diagnostics: "does jdoe have Write here?"
 */
function example_hasPermission_asAuthority() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var authority = 'jdoe'; // username or group
  var perm = 'Read';

  var allowed = permissions.hasPermission(String(node.nodeRef), perm, authority);
  logger.log(authority + ' has ' + perm + '? ' + allowed);
}

/**
 * Set / grant a permission to a user or group on a node.
 *
 * allow=true -> grant
 * allow=false -> deny
 */
function example_setPermission_allow() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var authority = 'jdoe';
  var perm = 'Read';

  permissions.setPermission(String(node.nodeRef), perm, authority, true);
  logger.log('Granted ' + perm + ' to ' + authority + ' on ' + node.nodeRef);
}

/**
 * Explicitly deny a permission.
 *
 * Be careful: deny rules can override allows and inheritance.
 */
function example_setPermission_deny() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var authority = 'jdoe';
  var perm = 'Read';

  permissions.setPermission(String(node.nodeRef), perm, authority, false);
  logger.log('Denied ' + perm + ' to ' + authority + ' on ' + node.nodeRef);
}

/**
 * List effective permissions (for current user) on a node.
 *
 * permissions.getPermissions(nodeRef) wraps PermissionService.getPermissions(nodeRef)
 * which returns set of AccessPermission.
 */
function example_getPermissions_effective() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var perms = permissions.getPermissions(String(node.nodeRef));
  logger.log('Effective permissions returned: ' + perms.length);

  for (var i = 0; i < perms.length; i++) {
    var p = perms[i];
    logger.log('  ' + p);

    // Probe common AccessPermission getters:
    try {
      if (p.getAuthority) logger.log('    authority: ' + p.getAuthority());
    } catch (e1) {}
    try {
      if (p.getPermission) logger.log('    permission: ' + p.getPermission());
    } catch (e2) {}
    try {
      if (p.getAccessStatus) logger.log('    status: ' + p.getAccessStatus());
    } catch (e3) {}
  }
}

/**
 * List ALL set permissions on a node (not only effective).
 *
 * This wraps PermissionService.getAllSetPermissions(nodeRef).
 * Useful to see explicit permissions + denies.
 */
function example_getAllPermissions_setOnNode() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var perms = permissions.getAllPermissions(node);
  logger.log('All set permissions returned: ' + perms.length);

  for (var i = 0; i < perms.length; i++) {
    var p = perms[i];
    logger.log('  ' + p);

    try {
      if (p.getAuthority) logger.log('    authority: ' + p.getAuthority());
    } catch (e1) {}
    try {
      if (p.getPermission) logger.log('    permission: ' + p.getPermission());
    } catch (e2) {}
    try {
      if (p.getAccessStatus) logger.log('    status: ' + p.getAccessStatus());
    } catch (e3) {}
  }
}

/**
 * Delete a single permission for an authority.
 *
 * Removes that explicit permission entry from the node.
 */
function example_deletePermission() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var authority = 'jdoe';
  var perm = 'Read';

  permissions.deletePermission(String(node.nodeRef), perm, authority);
  logger.log('Deleted permission ' + perm + ' for ' + authority + ' on ' + node.nodeRef);
}

/**
 * Clear all permissions for an authority on a node.
 *
 * This removes everything for that authority (all permission entries).
 */
function example_clearPermissions_forAuthority() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var authority = 'jdoe';
  permissions.clearPermissions(String(node.nodeRef), authority);
  logger.log('Cleared all permissions for ' + authority + ' on ' + node.nodeRef);
}

/**
 * Delete ALL explicit permissions on a node.
 *
 * This is a strong action. Inherited permissions can still apply afterwards.
 */
function example_deletePermissions_allOnNode() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  permissions.deletePermissions(String(node.nodeRef));
  logger.log('Deleted ALL explicit permissions on node: ' + node.nodeRef);
}

/**
 * Enable or disable permission inheritance on a node.
 *
 * Your wrapper expects "true"/"false" as STRING, not boolean.
 */
function example_setInheritParentPermissions() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  // Disable inheritance
  permissions.setInheritParentPermissions(String(node.nodeRef), 'false');
  logger.log(
    'Inheritance disabled: ' + permissions.isInheritParentPermissions(String(node.nodeRef))
  );

  // Re-enable inheritance
  permissions.setInheritParentPermissions(String(node.nodeRef), 'true');
  logger.log(
    'Inheritance enabled: ' + permissions.isInheritParentPermissions(String(node.nodeRef))
  );
}

/**
 * Store-wide cleanup example:
 * delete all permissions in a store.
 *
 * WARNING: extremely destructive. Use only in controlled environments.
 */
function example_deleteStorePermissions() {
  var protocol = 'workspace';
  var storeId = 'SpacesStore';

  permissions.deleteStorePermissions(protocol, storeId);
  logger.log('Requested deletion of all store permissions for: ' + protocol + '://' + storeId);
}
