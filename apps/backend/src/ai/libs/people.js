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
 * Get a person node by username.
 *
 * Returns a ScriptNode (cm:person) or null.
 */
function example_getPerson() {
  var username = 'mjackson';

  var person = people.getPerson(username);
  if (person) {
    logger.log(
      'Found person: ' +
        person.properties['cm:firstName'] +
        ' ' +
        person.properties['cm:lastName'] +
        ' (' +
        person.properties['cm:userName'] +
        ')'
    );
  } else {
    logger.log('No person found for username: ' + username);
  }
}

/**
 * Get a person’s full name as a string.
 *
 * Faster than loading the whole person node.
 */
function example_getPersonFullName() {
  var username = 'mjackson';
  var fullName = people.getPersonFullName(username);

  if (fullName) {
    logger.log('Full name for ' + username + ': ' + fullName);
  } else {
    logger.log('User ' + username + ' does not exist.');
  }
}

/**
 * Create a bare cm:person with just a username.
 *
 * No password is created here, and the person will be very minimal.
 */
function example_createPerson_minimal() {
  var username = 'new.user';

  var person = people.createPerson(username);
  if (person) {
    logger.log('Created person with username: ' + username);
  } else {
    logger.log('Person ' + username + ' already exists.');
  }
}

/**
 * Create a person with username, name and email.
 *
 * Still no password here – that’s handled separately.
 */
function example_createPerson_withDetails() {
  var person = people.createPerson('jdoe', 'John', 'Doe', 'john.doe@example.com');

  if (person) {
    logger.log(
      'Created person: ' +
        person.properties['cm:firstName'] +
        ' ' +
        person.properties['cm:lastName'] +
        ' (' +
        person.properties['cm:email'] +
        ')'
    );
  } else {
    logger.log('User jdoe already exists.');
  }
}

/**
 * Create a person, optionally generate username, set password and enable/disable account.
 *
 * userName:
 *   - string  -> use it if available
 *   - null    -> let Alfresco generate a unique username based on first/last/email
 *
 * setAccountEnabled:
 *   - true  -> user can log in immediately
 *   - false -> account exists but is disabled
 */
function example_createPerson_full_noEmailNotification() {
  var userName = null; // let Alfresco generate one
  var firstName = 'Alice';
  var lastName = 'Smith';
  var emailAddress = 'alice.smith@example.com';
  var password = 'Password1!';
  var setAccountEnabled = true;

  var person = people.createPerson(
    userName,
    firstName,
    lastName,
    emailAddress,
    password,
    setAccountEnabled
  );
  if (person) {
    logger.log('Created person ' + person.properties['cm:userName'] + ' with full profile');
  } else {
    logger.log('Could not create person (username might already exist or validation failed).');
  }
}

/**
 * Create a person and send notification email with credentials.
 *
 * notifyByEmail:
 *   - true -> send email (requires outbound email configured)
 */
function example_createPerson_full_withNotification() {
  var userName = 'alice.smith';
  var firstName = 'Alice';
  var lastName = 'Smith';
  var emailAddress = 'alice.smith@example.com';
  var password = 'Password1!';
  var setAccountEnabled = true;
  var notifyByEmail = true;

  var person = people.createPerson(
    userName,
    firstName,
    lastName,
    emailAddress,
    password,
    setAccountEnabled,
    notifyByEmail
  );

  if (person) {
    logger.log('Created person and sent credentials email to: ' + emailAddress);
  } else {
    logger.log('Could not create person ' + userName);
  }
}

/**
 * Delete a person by username.
 *
 * IMPORTANT: This removes the cm:person node and may have side effects
 * depending on configuration. Usually admin-only.
 */
function example_deletePerson() {
  var username = 'jdoe';

  people.deletePerson(username);
  logger.log('Requested deletion for user: ' + username);
}

/**
 * Enable or disable user accounts (admin only).
 */
function example_enable_disable_account() {
  var username = 'some.user';

  // Disable the account
  people.disableAccount(username);
  logger.log('Disabled account: ' + username);

  // Re-enable the account
  people.enableAccount(username);
  logger.log('Enabled account: ' + username);
}

/**
 * Check whether a user account is enabled.
 */
function example_isAccountEnabled() {
  var username = 'some.user';

  var enabled = people.isAccountEnabled(username);
  logger.log('User ' + username + ' enabled: ' + enabled);
}

/**
 * Change password for the CURRENT user (the one executing the script).
 *
 * Requires the old password.
 */
function example_changePassword_forCurrentUser() {
  var oldPassword = 'oldPass';
  var newPassword = 'newStrongPass1!';

  // Will throw if old password is wrong.
  people.changePassword(oldPassword, newPassword);
  logger.log('Password changed for current user.');
}

/**
 * Set password for another user (admin only).
 *
 * The admin must NOT be setting their own password here.
 */
function example_setPassword_forOtherUser() {
  var username = 'jdoe';
  var newPassword = 'NewPass123!';

  people.setPassword(username, newPassword);
  logger.log('Password set for user: ' + username);
}

/**
 * Set a user quota (in bytes).
 *
 * quota:
 *   - "-1" means no quota.
 *   - any positive number as a string is a hard limit in bytes.
 *
 * Only admin is allowed to call this.
 */
function example_setQuota() {
  var username = 'jdoe';
  var person = people.getPerson(username);
  if (!person) {
    logger.log('No person for ' + username);
    return;
  }

  // e.g. 1 GB quota
  var quotaBytes = String(1024 * 1024 * 1024);

  people.setQuota(person, quotaBytes);
  logger.log('Set quota for ' + username + ' to ' + quotaBytes + ' bytes');
}

/**
 *
 * The search is performed by people.getPeople(filter, maxResults, sortBy, sortAsc)
 *
 * filter:
 *   - null or "*" -> everyone (up to limit)
 *   - "john"      -> first name / last name / username containing "john"
 *   - "john bob"  -> any of the name parts containing "john" or "bob"
 *
 * sortBy:
 *   - "username"  (default if omitted)
 *   - "firstName"
 *   - "lastName"
 *
 * sortAsc:
 *   - true  -> ascending
 *   - false -> descending
 */

/**
 * Get people by simple filter with max results.
 */
function example_getPeople_simple() {
  var filter = 'john';
  var maxResults = 50;

  var peopleNodes = people.getPeople(filter, maxResults);
  logger.log('Found ' + peopleNodes.length + ' people matching: ' + filter);

  for (var i = 0; i < peopleNodes.length; i++) {
    var person = peopleNodes[i];
    logger.log(
      person.properties['cm:userName'] +
        ' -> ' +
        person.properties['cm:firstName'] +
        ' ' +
        person.properties['cm:lastName']
    );
  }
}

/**
 * Get people with sorting.
 */
function example_getPeople_withSorting() {
  var filter = 'smith';
  var maxResults = 100;
  var sortBy = 'lastName'; // "firstName" or "username" also allowed
  var sortAsc = true;

  var peopleNodes = people.getPeople(filter, maxResults, sortBy, sortAsc);
  logger.log('Found ' + peopleNodes.length + ' people matching: ' + filter);

  for (var i = 0; i < peopleNodes.length; i++) {
    var p = peopleNodes[i];
    logger.log(
      p.properties['cm:lastName'] +
        ', ' +
        p.properties['cm:firstName'] +
        ' (' +
        p.properties['cm:userName'] +
        ')'
    );
  }
}

/**
 * Paging example using getPeoplePaging().
 *
 * ScriptPagingDetails is exposed to scripts as an object:
 *   { maxItems: <int>, skipCount: <int> }
 *
 * That’s what js-console and Repo scripts typically use.
 */
function example_getPeople_paging() {
  // First page: 20 items starting at 0
  var pagingRequest = new ScriptPagingDetails(20, 0); // if available in your environment
  // If ScriptPagingDetails is not directly constructible in your JS console,
  // use people.getPeople(filter, maxResults) instead.

  var filter = '*';
  var sortBy = 'username';
  var sortAsc = true;

  var page = people.getPeoplePaging(filter, pagingRequest, sortBy, sortAsc);
  logger.log('Paged result returned ' + page.length + ' nodes.');
}

/**
 * Get a group ScriptNode from a group name.
 *
 * groupName must be the full authority name, e.g.:
 *   "GROUP_SITE_COLLABORATORS"
 *   "GROUP_EVERYONE"
 */
function example_getGroup() {
  var groupName = 'GROUP_EVERYONE';
  var group = people.getGroup(groupName);

  if (group) {
    logger.log('Group node for ' + groupName + ' -> ' + group.nodeRef);
  } else {
    logger.log('Group not found: ' + groupName);
  }
}

/**
 * Create a root-level group.
 *
 * groupName should NOT contain the "GROUP_" prefix; that will be added.
 */
function example_createGroup_root() {
  var shortName = 'PROJECT_X_USERS';

  var group = people.createGroup(shortName); // creates GROUP_PROJECT_X_USERS
  if (group) {
    logger.log('Created group: ' + group.properties['cm:authorityName']);
  } else {
    logger.log('Group already exists: ' + shortName);
  }
}

/**
 * Create a sub-group under a parent group.
 */
function example_createGroup_underParent() {
  var parentGroup = people.getGroup('GROUP_PROJECT_X_USERS');
  if (!parentGroup) {
    logger.log('Parent group does not exist.');
    return;
  }

  var childShortName = 'PROJECT_X_MANAGERS';
  var childGroup = people.createGroup(parentGroup, childShortName);

  if (childGroup) {
    logger.log('Created child group: ' + childGroup.properties['cm:authorityName']);
  } else {
    logger.log('Child group already exists.');
  }
}

/**
 * Delete a group.
 */
function example_deleteGroup() {
  var group = people.getGroup('GROUP_PROJECT_X_USERS');
  if (!group) {
    logger.log('Group does not exist.');
    return;
  }

  people.deleteGroup(group);
  logger.log('Deleted group: ' + group.properties['cm:authorityName']);
}

/**
 * Add a user to a group.
 */
function example_addUserToGroup() {
  var group = people.getGroup('GROUP_PROJECT_X_USERS');
  var person = people.getPerson('jdoe');

  if (!group || !person) {
    logger.log('Group or person not found.');
    return;
  }

  people.addAuthority(group, person);
  logger.log(
    'Added user ' +
      person.properties['cm:userName'] +
      ' to group ' +
      group.properties['cm:authorityName']
  );
}

/**
 * Add a subgroup to a parent group.
 */
function example_addGroupToGroup() {
  var parentGroup = people.getGroup('GROUP_PROJECT_X_USERS');
  var childGroup = people.getGroup('GROUP_PROJECT_X_MANAGERS');

  if (!parentGroup || !childGroup) {
    logger.log('Parent or child group not found.');
    return;
  }

  people.addAuthority(parentGroup, childGroup);
  logger.log(
    'Added group ' +
      childGroup.properties['cm:authorityName'] +
      ' to ' +
      parentGroup.properties['cm:authorityName']
  );
}

/**
 * Remove a user or group from a group.
 */
function example_removeAuthorityFromGroup() {
  var group = people.getGroup('GROUP_PROJECT_X_USERS');
  var person = people.getPerson('jdoe');

  if (!group || !person) {
    logger.log('Group or person not found.');
    return;
  }

  people.removeAuthority(group, person);
  logger.log(
    'Removed user ' +
      person.properties['cm:userName'] +
      ' from group ' +
      group.properties['cm:authorityName']
  );
}

/**
 * List all members (people only) of a group, recursing into sub-groups.
 */
function example_getMembers_recursive() {
  var group = people.getGroup('GROUP_PROJECT_X_USERS');
  if (!group) {
    logger.log('Group not found.');
    return;
  }

  var members = people.getMembers(group); // default recurse = true
  logger.log('Group has ' + members.length + ' member(s).');

  for (var i = 0; i < members.length; i++) {
    var person = members[i];
    logger.log('Member: ' + person.properties['cm:userName']);
  }
}

/**
 * List direct members only (recurse = false).
 */
function example_getMembers_nonRecursive() {
  var group = people.getGroup('GROUP_PROJECT_X_USERS');
  if (!group) {
    logger.log('Group not found.');
    return;
  }

  var members = people.getMembers(group, false);
  logger.log('Direct members: ' + members.length);

  for (var i = 0; i < members.length; i++) {
    var person = members[i];
    logger.log('Direct member: ' + person.properties['cm:userName']);
  }
}

/**
 * Get the groups a user belongs to.
 */
function example_getContainerGroups_forPerson() {
  var person = people.getPerson('jdoe');
  if (!person) {
    logger.log('Person not found.');
    return;
  }

  var groups = people.getContainerGroups(person);
  logger.log('User is part of ' + groups.length + ' group(s).');

  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    logger.log('Group: ' + g.properties['cm:authorityName']);
  }
}

/**
 * Check if a person is an admin.
 */
function example_isAdmin() {
  var person = people.getPerson('admin');
  if (!person) {
    logger.log('Person not found.');
    return;
  }

  var admin = people.isAdmin(person);
  logger.log('Is admin: ' + admin);
}

/**
 * Check if a person is guest user.
 */
function example_isGuest() {
  var person = people.getPerson('guest');
  if (!person) {
    logger.log('Person not found.');
    return;
  }

  var guest = people.isGuest(person);
  logger.log('Is guest: ' + guest);
}

/**
 * Get capability map for a person.
 *
 * Keys (as of the underlying implementation):
 *   - isAdmin
 *   - isGuest
 *   - isMutable  (can this user modify their own account?)
 */
function example_getCapabilities() {
  var person = people.getPerson('jdoe');
  if (!person) {
    logger.log('Person not found.');
    return;
  }

  var caps = people.getCapabilities(person);
  logger.log('Capabilities for ' + person.properties['cm:userName'] + ':');
  for (var key in caps) {
    logger.log('  ' + key + ' = ' + caps[key]);
  }
}

/**
 * Get the properties of a user that are considered immutable
 * because they’re controlled by an external directory (e.g. LDAP).
 *
 * Returns a map: { "{qname}": true, ... }
 */
function example_getImmutableProperties() {
  var username = 'jdoe';
  var immutables = people.getImmutableProperties(username);

  logger.log('Immutable properties for ' + username + ':');
  for (var key in immutables) {
    if (immutables.hasOwnProperty(key)) {
      logger.log('  ' + key);
    }
  }
}
