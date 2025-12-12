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
 * Examples for the Alfresco ScriptAuthorityService root object: `groups`
 *
 * These examples assume the following root objects are available:
 *   - groups  (ScriptAuthorityService)
 *   - logger  (for logging)
 *
 * The functions are meant as usage examples, similar to search.js.
 */

/**
 * Get all root groups in all zones.
 */
function example_getAllRootGroups_basic() {
  var rootGroups = groups.getAllRootGroups();
  logger.log('Found ' + rootGroups.length + ' root group(s)');

  for (var i = 0; i < rootGroups.length; i++) {
    var g = rootGroups[i];
    logger.log(
      'Root group: ' +
        g.shortName +
        ' (displayName=' +
        g.displayName +
        ', fullName=' +
        g.fullName +
        ')'
    );
  }
}

/**
 * Get all root groups in all zones with simple paging.
 */
function example_getAllRootGroups_paged() {
  var maxItems = 20;
  var skipCount = 0;

  var rootGroups = groups.getAllRootGroups(maxItems, skipCount);
  logger.log(
    'Found ' +
      rootGroups.length +
      ' root group(s) (maxItems=' +
      maxItems +
      ', skipCount=' +
      skipCount +
      ')'
  );
}

/**
 * Get root groups in a specific zone.
 */
function example_getAllRootGroupsInZone_basic() {
  // Common zones: 'AUTH.ALF', 'APP.DEFAULT'
  var zone = 'AUTH.ALF';

  var rootGroups = groups.getAllRootGroupsInZone(zone);
  logger.log('Found ' + rootGroups.length + ' root group(s) in zone ' + zone);

  for (var i = 0; i < rootGroups.length; i++) {
    var g = rootGroups[i];
    logger.log(
      '[' +
        zone +
        '] ' +
        g.shortName +
        ' (displayName=' +
        g.displayName +
        ', fullName=' +
        g.fullName +
        ')'
    );
  }
}

/**
 * Search root groups by display name pattern in a specific zone.
 */
function example_searchRootGroupsInZone_withPattern() {
  var displayNamePattern = '*Admin*';
  var zone = 'AUTH.ALF';

  var rootGroups = groups.searchRootGroupsInZone(displayNamePattern, zone);
  logger.log(
    'Root groups matching pattern "' +
      displayNamePattern +
      '" in zone ' +
      zone +
      ': ' +
      rootGroups.length
  );

  for (var i = 0; i < rootGroups.length; i++) {
    var g = rootGroups[i];
    logger.log('  ' + g.displayName + ' [' + g.shortName + ']');
  }
}

/**
 * Search root groups in all zones by display name pattern.
 */
function example_searchRootGroups_allZones() {
  var displayNamePattern = '*Managers*';

  var rootGroups = groups.searchRootGroups(displayNamePattern);
  logger.log(
    'Root groups matching pattern "' + displayNamePattern + '" in all zones: ' + rootGroups.length
  );

  for (var i = 0; i < rootGroups.length; i++) {
    var g = rootGroups[i];
    logger.log(
      '  ' + g.displayName + ' (shortName=' + g.shortName + ', fullName=' + g.fullName + ')'
    );
  }
}

/**
 * Get groups with a filter in all zones.
 *
 * NOTE (from Java API):
 *  - If filter is null, empty or '*' then all groups are returned.
 */
function example_getGroups_withFilter() {
  var filter = '*SITE_*'; // for example, Share site groups

  // Minimal paging: create a paging object via the helper method if you have one
  // Here we just show the "maxItems/skipCount" variant for simplicity.
  var paging = {
    maxItems: 50,
    skipCount: 0,
  };

  // if your environment exposes a helper like utils.createPaging, use that instead
  var scriptGroups = groups.getGroups(filter, paging);

  logger.log(
    'getGroups() with filter "' + filter + '" returned ' + scriptGroups.length + ' group(s)'
  );
}

/**
 * Get groups with filter and sort options.
 *
 * sortBy: 'shortName' | 'displayName' | 'authorityName'
 */
function example_getGroups_withFilter_andSort() {
  var filter = 'GROUP_*';
  var paging = {
    maxItems: 100,
    skipCount: 0,
  };
  var sortBy = 'displayName';

  var scriptGroups = groups.getGroups(filter, paging, sortBy);

  logger.log(
    'getGroups() with filter "' +
      filter +
      '" sorted by ' +
      sortBy +
      ' returned ' +
      scriptGroups.length +
      ' group(s)'
  );
}

/**
 * Get groups in a specific zone, with filter, sort and sort direction.
 */
function example_getGroupsInZone_advanced() {
  var filter = '*Admin*';
  var zone = 'AUTH.ALF';
  var paging = {
    maxItems: 50,
    skipCount: 0,
  };
  var sortBy = 'displayName';
  var sortAsc = true;

  var scriptGroups = groups.getGroupsInZone(filter, zone, paging, sortBy, sortAsc);

  logger.log(
    'getGroupsInZone("' +
      filter +
      '", ' +
      zone +
      ') sorted by ' +
      sortBy +
      ' asc=' +
      sortAsc +
      ' returned ' +
      scriptGroups.length +
      ' group(s)'
  );
}

/**
 * Get a group by short name.
 *
 * Example: shortName "ALFRESCO_ADMINISTRATORS" for full name "GROUP_ALFRESCO_ADMINISTRATORS".
 */
function example_getGroup_byShortName() {
  var shortName = 'ALFRESCO_ADMINISTRATORS';

  var group = groups.getGroup(shortName);
  if (group) {
    logger.log(
      'Found group by shortName: ' +
        group.shortName +
        ' (displayName=' +
        group.displayName +
        ', fullName=' +
        group.fullName +
        ')'
    );
  } else {
    logger.log('Group not found for shortName: ' + shortName);
  }
}

/**
 * Get a group by its full authority name (must start with "GROUP_").
 */
function example_getGroup_byFullAuthorityName() {
  var fullName = 'GROUP_ALFRESCO_ADMINISTRATORS';

  var group = groups.getGroupForFullAuthorityName(fullName);
  if (group) {
    logger.log(
      'Found group by full authority name: ' +
        group.fullName +
        ' (shortName=' +
        group.shortName +
        ', displayName=' +
        group.displayName +
        ')'
    );
  } else {
    logger.log('Group not found for full authority name: ' + fullName);
  }
}

/**
 * Create a new root group in the default application zones.
 */
function example_createRootGroup() {
  var shortName = 'MY_CUSTOM_ROOT_GROUP';
  var displayName = 'My Custom Root Group';

  var group = groups.createRootGroup(shortName, displayName);
  if (group) {
    logger.log(
      'Created root group: ' +
        group.shortName +
        ' (displayName=' +
        group.displayName +
        ', fullName=' +
        group.fullName +
        ')'
    );
  } else {
    logger.log('Failed to create root group for shortName: ' + shortName);
  }
}

/**
 * Search for groups in all zones by shortName filter.
 *
 * shortNameFilter supports * and ?, e.g. "ALFRESCO_*".
 */
function example_searchGroups_allZones() {
  var shortNameFilter = 'ALFRESCO_*';

  var scriptGroups = groups.searchGroups(shortNameFilter);
  logger.log(
    'searchGroups("' + shortNameFilter + '") returned ' + scriptGroups.length + ' group(s)'
  );

  for (var i = 0; i < scriptGroups.length; i++) {
    var g = scriptGroups[i];
    logger.log(
      '  ' + g.shortName + ' (displayName=' + g.displayName + ', fullName=' + g.fullName + ')'
    );
  }
}

/**
 * Search for groups in a specific zone with paging.
 */
function example_searchGroupsInZone_paged() {
  var shortNameFilter = '*USERS*';
  var zone = 'AUTH.ALF';
  var maxItems = 25;
  var skipCount = 0;

  var scriptGroups = groups.searchGroupsInZone(shortNameFilter, zone, maxItems, skipCount);

  logger.log(
    'searchGroupsInZone("' +
      shortNameFilter +
      '", ' +
      zone +
      ', maxItems=' +
      maxItems +
      ', skipCount=' +
      skipCount +
      ') returned ' +
      scriptGroups.length +
      ' group(s)'
  );
}

/**
 * Get a user by username using ScriptAuthorityService.
 */
function example_getUser_byUsername() {
  var username = 'admin';

  var user = groups.getUser(username);
  if (user) {
    logger.log(
      'Found user: ' +
        user.userName +
        ' (firstName=' +
        user.firstName +
        ', lastName=' +
        user.lastName +
        ')'
    );
  } else {
    logger.log('User not found: ' + username);
  }
}

/**
 * Search users by name filter, with paging and sort.
 *
 * sortBy: 'firstName' | 'lastName' | 'userName'
 *
 * NOTE: Java API marks searchUsers as deprecated in favour of People.getPeople,
 * but it is still available via ScriptAuthorityService.
 */
function example_searchUsers_byName() {
  var nameFilter = 'John';
  var paging = {
    maxItems: 50,
    skipCount: 0,
  };
  var sortBy = 'lastName';

  var users = groups.searchUsers(nameFilter, paging, sortBy);
  logger.log(
    'searchUsers("' +
      nameFilter +
      '", maxItems=' +
      paging.maxItems +
      ', skipCount=' +
      paging.skipCount +
      ', sortBy=' +
      sortBy +
      ') returned ' +
      users.length +
      ' user(s)'
  );

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    logger.log('  ' + u.userName + ' (' + u.firstName + ' ' + u.lastName + ')');
  }
}
