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
 * Create a simple site with a visibility string.
 *
 * shortName:
 *   - URL-safe string, must be unique (e.g. "project-x")
 *
 * sitePreset:
 *   - e.g. "site-dashboard", "collaboration-site"
 *   - depends on what’s installed in your system
 */
function example_createSite_basic() {
  var sitePreset = 'site-dashboard';
  var shortName = 'project-x';
  var title = 'Project X';
  var description = 'Collaboration space for Project X';
  var visibility = 'PUBLIC'; // PUBLIC | MODERATED | PRIVATE

  var site = siteService.createSite(sitePreset, shortName, title, description, visibility);

  logger.log('Created site: ' + site.shortName + ' (' + site.title + ')');
}

/**
 * Create a site with an explicit site type (QName).
 *
 * siteType:
 *   - string QName, e.g. "{http://www.alfresco.org/model/site/1.0}site"
 *   - use this when you have custom site types.
 */
function example_createSite_withType() {
  var sitePreset = 'site-dashboard';
  var shortName = 'records-repo';
  var title = 'Records Repository';
  var description = 'Site for records management content';
  var visibility = 'PRIVATE';
  var siteType = '{http://www.alfresco.org/model/site/1.0}site';

  var site = siteService.createSite(
    sitePreset,
    shortName,
    title,
    description,
    visibility,
    siteType
  );

  logger.log('Created site with type: ' + siteType + ' -> ' + site.shortName);
}

/**
 * Deprecated boolean-based createSite API – still usable but not recommended.
 *
 * isPublic:
 *   - true  -> PUBLIC
 *   - false -> PRIVATE
 */
function example_createSite_deprecatedBoolean() {
  var sitePreset = 'site-dashboard';
  var shortName = 'legacy-site';
  var title = 'Legacy Example Site';
  var description = 'Created using deprecated boolean API';
  var isPublic = true;

  var site = siteService.createSite(sitePreset, shortName, title, description, isPublic);

  logger.log('Created legacy site (deprecated API): ' + site.shortName);
}

/**
 * Check if a site exists by shortName.
 *
 * Works even for private sites; it only checks existence,
 * not whether the current user can see the content.
 */
function example_hasSite() {
  var shortName = 'project-x';

  var exists = siteService.hasSite(shortName);
  logger.log('Site ' + shortName + ' exists: ' + exists);
}

/**
 * Check whether current user is allowed to create sites.
 *
 * Typically means they have Contributor rights on the "Sites" container.
 */
function example_hasCreateSitePermissions() {
  var allowed = siteService.hasCreateSitePermissions();
  logger.log('Current user can create sites: ' + allowed);
}

/**
 * Check if current user is a manager of a given site.
 */
function example_isSiteManager() {
  var shortName = 'project-x';

  var isManager = siteService.isSiteManager(shortName);
  logger.log('Current user is manager of ' + shortName + ': ' + isManager);
}

/**
 * Get a site as the current user (normal permission checks apply).
 *
 * Returns:
 *   - Site object, or
 *   - null if it doesn’t exist or is not visible to the user.
 */
function example_getSite_normal() {
  var shortName = 'project-x';

  var site = siteService.getSite(shortName);
  if (!site) {
    logger.log('Site not found or not visible: ' + shortName);
    return;
  }

  logger.log('Got site: ' + site.shortName + ' -> ' + site.title);

  // Example: update site properties
  site.title = site.title + ' (updated)';
  site.description = 'Updated from repo script at ' + new Date();
  site.save();

  logger.log('Updated title and description for site: ' + site.shortName);
}

/**
 * Get read-only site info, ignoring the current user's content permissions.
 *
 * This runs the lookup as admin, but any changes you try to save()
 * will still be constrained by ACLs.
 *
 * Useful for:
 *   - dashboards
 *   - admin-style reports
 *   - site existence checks without disclosing content
 */
function example_getSiteInfo_adminView() {
  var shortName = 'private-team-site';

  var site = siteService.getSiteInfo(shortName);
  if (!site) {
    logger.log('Site not found: ' + shortName);
    return;
  }

  logger.log(
    'Site info (ignoring ACL for visibility): ' +
      site.shortName +
      ' -> ' +
      site.title +
      ', visibility=' +
      site.visibility
  );
}

/**
 * getSites(filter, sitePresetFilter, size):
 *   - decides internally whether to use listSites (starts-with) or
 *     findSites (contains) based on the filter.
 *
 * Behaviour:
 *   - filter null / "" / "*" -> no filter (all sites)
 *   - filter "proj"          -> starts-with search (name/title/description)
 *   - filter "*proj"         -> contains search, using findSites()
 *
 * sitePresetFilter:
 *   - null or "" for all presets
 *   - or a specific preset, e.g. "site-dashboard"
 */

/**
 * List sites using getSites() with a simple starts-with filter.
 */
function example_getSites_startsWith() {
  var filter = 'proj'; // "proj*" behind the scenes
  var presetFilter = null; // all site presets
  var maxResults = 50;

  var sites = siteService.getSites(filter, presetFilter, maxResults);
  logger.log('Found ' + sites.length + " sites starting with '" + filter + "'");

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    logger.log(s.shortName + ' -> ' + s.title + ' (' + s.visibility + ')');
  }
}

/**
 * List sites using getSites() with a contains-based filter via leading "*".
 */
function example_getSites_contains() {
  // Leading "*" triggers findSites() internally.
  var filter = '*project'; // contains "project"
  var presetFilter = null;
  var maxResults = 100;

  var sites = siteService.getSites(filter, presetFilter, maxResults);
  logger.log('Found ' + sites.length + " sites containing 'project'");

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    logger.log(s.shortName + ' -> ' + s.title);
  }
}

/**
 * Direct use of listSites(): starts-with behaviour, typically backed by a canned query.
 *
 * Good for:
 *   - stable results
 *   - not depending on index freshness
 */
function example_listSites_byPreset() {
  var filter = 'project'; // starts-with
  var presetFilter = 'site-dashboard';
  var maxResults = 20;

  var sites = siteService.listSites(filter, presetFilter, maxResults);
  logger.log(
    'listSites returned ' + sites.length + " dashboard sites starting with '" + filter + "'"
  );

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    logger.log(s.shortName + ' -> ' + s.title);
  }
}

/**
 * Direct use of findSites(): contains filter + optional preset.
 *
 * Depends on search index, so very new sites might not appear immediately.
 */
function example_findSites_withPreset() {
  var filter = 'hr'; // contains "hr"
  var presetFilter = null; // any preset
  var maxResults = 100;

  var sites = siteService.findSites(filter, presetFilter, maxResults);
  logger.log('findSites(filter, preset) returned ' + sites.length + ' site(s)');

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    logger.log(s.shortName + ' -> ' + s.title);
  }
}

/**
 * Shorter findSites() variant: filter + size only.
 */
function example_findSites_simple() {
  var filter = 'marketing';
  var maxResults = 50;

  var sites = siteService.findSites(filter, maxResults);
  logger.log('findSites(filter, size) returned ' + sites.length + ' site(s)');

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    logger.log(s.shortName + ' -> ' + s.title);
  }
}

/**
 * List all sites where a user has an explicit membership (any role).
 *
 * Includes:
 *   - public sites where they’re a member
 *   - private/moderated sites where they’re a member
 *
 * Does NOT include:
 *   - sites they can see only because they’re public, but with no membership
 */
function example_listUserSites_all() {
  var userName = 'jdoe';

  var sites = siteService.listUserSites(userName);
  logger.log('User ' + userName + ' has explicit membership in ' + sites.length + ' site(s)');

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    logger.log('  ' + s.shortName + ' (' + s.title + ')');
  }
}

/**
 * Same as above, but with an explicit max size.
 */
function example_listUserSites_limited() {
  var userName = 'jdoe';
  var maxResults = 10;

  var sites = siteService.listUserSites(userName, maxResults);
  logger.log('User ' + userName + ' sites (limited to ' + maxResults + '): ' + sites.length);

  for (var i = 0; i < sites.length; i++) {
    logger.log('  ' + sites[i].shortName);
  }
}

/**
 * List all possible site roles configured system-wide.
 */
function example_listSiteRoles_global() {
  var roles = siteService.listSiteRoles();
  logger.log('Available site roles (' + roles.length + '):');

  for (var i = 0; i < roles.length; i++) {
    logger.log('  ' + roles[i]);
  }
}

/**
 * List allowed roles for a specific site.
 *
 * Useful if some sites have custom role definitions or restrictions.
 */
function example_listSiteRoles_forSite() {
  var shortName = 'project-x';

  var roles = siteService.listSiteRoles(shortName);
  logger.log('Roles for site ' + shortName + ' (' + roles.length + '):');

  for (var i = 0; i < roles.length; i++) {
    logger.log('  ' + roles[i]);
  }
}

/**
 *
 * cleanSitePermissions():
 *   - Strips permissions on the target node that belong to OTHER sites
 *   - Keeps permissions related to the node’s current site
 *
 * Use when:
 *   - moving content between sites
 *   - cleaning up mixed permissions inherited from previous site structures
 */

/**
 * Clean site permissions using a NodeRef (Java-style API).
 */
function example_cleanSitePermissions_byNodeRef() {
  // Put the real NodeRef here (e.g. from a rule/script parameter).
  var nodeRef = new NodeRef('workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef');

  siteService.cleanSitePermissions(nodeRef);
  logger.log('Cleaned site-related permissions for nodeRef: ' + nodeRef.toString());
}

/**
 * Clean site permissions using a ScriptNode.
 */
function example_cleanSitePermissions_byScriptNode() {
  var site = siteService.getSite('project-x');
  if (!site) {
    logger.log('Site not found.');
    return;
  }

  // Example: clean permissions on the documentLibrary root
  var doclib = site.getContainer('documentLibrary');
  if (!doclib) {
    logger.log('Site has no documentLibrary container.');
    return;
  }

  siteService.cleanSitePermissions(doclib);
  logger.log('Cleaned site-related permissions for doclib of site: ' + site.shortName);
}
