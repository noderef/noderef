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
 * Get a fast, cm:name-based display path for a node.
 *
 * Uses:
 *   - utils.displayPath(node)
 *
 * Unlike node.displayPath, this version uses an unprotected NodeService
 * and a NOOP permission service for minimal overhead. Good for logging.
 */
function example_utils_displayPath() {
  // Example: resolve a node from a string NodeRef first
  var nodeRefStr = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = utils.getNodeFromString(nodeRefStr);
  if (!node) {
    logger.warn('Node not found: ' + nodeRefStr);
    return;
  }

  var path = utils.displayPath(node);
  logger.log('Display path: ' + path);
}

/**
 * Left-pad a string with zeros.
 *
 * utils.pad(s, len):
 *   - s: original string
 *   - len: target length
 *
 * If s is already >= len, it is returned unchanged.
 */
function example_utils_pad() {
  var n = 42;
  var padded = utils.pad(String(n), 5);

  logger.log('Original: ' + n); // "42"
  logger.log('Padded  : ' + padded); // "00042"
}

/**
 * Turn a string NodeRef into a ScriptNode.
 *
 * utils.getNodeFromString(nodeRefString):
 *   - returns ScriptNode, or throws if NodeRef is syntactically invalid.
 *   - does NOT check existence before wrapping, so use node.exists().
 */
function example_utils_getNodeFromString() {
  var nodeRefStr = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';

  var node = utils.getNodeFromString(nodeRefStr);
  logger.log('Got ScriptNode for ' + nodeRefStr + ', exists=' + node.exists());
}

/**
 * Resolve "virtual" or generic node references using NodeLocatorService.
 *
 * utils.resolveNodeReference(reference):
 *   Supported patterns:
 *     - "alfresco://company/home"
 *     - "alfresco://user/home"
 *     - "alfresco://company/shared"
 *     - "alfresco://sites/home"
 *     - full NodeRef: "workspace://SpacesStore/..."
 *     - XPath: "/app:company_home/cm:SomeFolder/cm:Child"
 */
function example_utils_resolveNodeReference_virtual() {
  var companyHome = utils.resolveNodeReference('alfresco://company/home');
  logger.log('Company Home: ' + (companyHome ? companyHome.nodeRef : 'not found'));

  var userHome = utils.resolveNodeReference('alfresco://user/home');
  logger.log('User Home: ' + (userHome ? userHome.nodeRef : 'not found'));

  var shared = utils.resolveNodeReference('alfresco://company/shared');
  logger.log('Shared: ' + (shared ? shared.nodeRef : 'not found'));

  var sitesRoot = utils.resolveNodeReference('alfresco://sites/home');
  logger.log('Sites root: ' + (sitesRoot ? sitesRoot.nodeRef : 'not found'));
}

/**
 * Resolve a generic NodeRef or XPath-style reference.
 */
function example_utils_resolveNodeReference_generic() {
  // Full NodeRef
  var nodeRefStr = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = utils.resolveNodeReference(nodeRefStr);
  logger.log(
    'Resolved ' +
      nodeRefStr +
      ' -> ' +
      (node ? node.nodeRef.toString() : 'null (no access / no node)')
  );

  // XPath starting at company home
  var xpath = '/app:company_home/cm:Data Dictionary';
  var ddNode = utils.resolveNodeReference(xpath);
  logger.log('Resolved XPath ' + xpath + ' -> ' + (ddNode ? ddNode.nodeRef.toString() : 'null'));
}

/**
 * Convert a string into a boolean value.
 *
 * utils.toBoolean(str) is basically Boolean.parseBoolean:
 *   - "true" (case insensitive)  -> true
 *   - "false" or anything else   -> false
 */
function example_utils_toBoolean() {
  var v1 = utils.toBoolean('true');
  var v2 = utils.toBoolean('FALSE');
  var v3 = utils.toBoolean('yes'); // false

  logger.log('toBoolean("true")  => ' + v1);
  logger.log('toBoolean("FALSE") => ' + v2);
  logger.log('toBoolean("yes")   => ' + v3);
}

/**
 * Check if a module is installed.
 *
 * utils.moduleInstalled(moduleName):
 *   - moduleName example: "org.alfresco.module.recordsManagement"
 *   - returns true if ModuleService reports a module detail
 */
function example_utils_moduleInstalled() {
  var moduleName = 'org.alfresco.module.recordsManagement';
  var installed = utils.moduleInstalled(moduleName);

  logger.log('Module ' + moduleName + ' installed: ' + installed);
}

/**
 * Format a timestamp (millis) to ISO-8601 string.
 */
function example_utils_toISO8601_fromMillis() {
  var nowMillis = new Date().getTime();
  var iso = utils.toISO8601(nowMillis);

  logger.log('Now millis: ' + nowMillis);
  logger.log('ISO-8601 : ' + iso);
}

/**
 * Format a JavaScript Date to ISO-8601 string.
 */
function example_utils_toISO8601_fromDate() {
  var d = new Date();
  var iso = utils.toISO8601(d);

  logger.log('Date: ' + d);
  logger.log('ISO-8601: ' + iso);
}

/**
 * Parse an ISO-8601 string into a Java Date (exposed as JS Date proxy).
 *
 * Note:
 *   - utils.fromISO8601 takes an ISO string and returns a java.util.Date
 *   - In the JS runtime, this behaves mostly like a Date object, but
 *     string concatenation will show the Java toString format.
 */
function example_utils_fromISO8601() {
  var iso = '2025-01-15T10:30:00.000Z';

  var dateObj = utils.fromISO8601(iso);
  logger.log('Parsed ISO ' + iso + ' -> ' + dateObj);
}

/**
 * Convert long-form QName string to short-form with prefix.
 *
 * utils.shortQName(longString):
 *   - "{http://www.alfresco.org/model/content/1.0}content"
 *     -> "cm:content"
 */
function example_utils_shortQName() {
  var longQ = '{http://www.alfresco.org/model/content/1.0}content';
  var shortQ = utils.shortQName(longQ);

  logger.log('Long QName : ' + longQ);
  logger.log('Short QName: ' + shortQ);
}

/**
 * Convert short-form QName string to long-form.
 *
 * utils.longQName(shortString):
 *   - "cm:content"
 *     -> "{http://www.alfresco.org/model/content/1.0}content"
 */
function example_utils_longQName() {
  var shortQ = 'cm:content';
  var longQ = utils.longQName(shortQ);

  logger.log('Short QName: ' + shortQ);
  logger.log('Long QName : ' + longQ);
}

/**
 * Build a ScriptPagingDetails object from explicit maxItems and skipCount.
 *
 * Useful with:
 *   - search.queryPaging
 *   - node.childFileFolders(...)
 *   - custom repo JavaScript APIs expecting ScriptPagingDetails
 */
function example_utils_createPaging_simple() {
  var maxItems = 50;
  var skipCount = 0;

  var paging = utils.createPaging(maxItems, skipCount);
  logger.log('Created paging: maxItems=' + paging.maxItems + ', skipCount=' + paging.skipCount);
}

/**
 * Build paging with queryExecutionId – useful for search optimizations.
 */
function example_utils_createPaging_withQueryExecutionId() {
  var maxItems = 100;
  var skipCount = 200;
  var queryExecutionId = 'debug-query-1';

  var paging = utils.createPaging(maxItems, skipCount, queryExecutionId);
  logger.log(
    'Paging with queryExecutionId: maxItems=' +
      paging.maxItems +
      ', skipCount=' +
      paging.skipCount +
      ', queryExecutionId=' +
      paging.queryExecutionId
  );
}

/**
 * Build paging from an argument map, e.g. from a web script request.
 *
 * utils.createPaging(argsMap):
 *   Recognized keys:
 *     - "maxItems"
 *     - "skipCount"
 *     - "queryId" or "queryExecutionId"
 */
function example_utils_createPaging_fromMap() {
  // In a web script, args would come from `args`, here we build it manually.
  var argsMap = {
    maxItems: '25',
    skipCount: '50',
    queryExecutionId: 'example-exec-id',
  };

  var paging = utils.createPaging(argsMap);

  logger.log(
    'Paging from map: maxItems=' +
      paging.maxItems +
      ', skipCount=' +
      paging.skipCount +
      ', queryExecutionId=' +
      paging.queryExecutionId
  );
}

/**
 * Temporarily disable rules for the current thread while doing bulk updates.
 *
 * Pattern:
 *   utils.disableRules();
 *   try {
 *     // modify nodes
 *   } finally {
 *     utils.enableRules();
 *   }
 *
 * Be careful to always re-enable, even on error.
 */
function example_utils_disable_enable_rules() {
  var nodeRefStr = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = utils.getNodeFromString(nodeRefStr);
  if (!node || !node.exists()) {
    logger.warn('Node not found for rule example.');
    return;
  }

  utils.disableRules();
  try {
    logger.log('Rules disabled, updating node: ' + node.nodeRef);

    node.properties['cm:title'] = 'Updated without triggering rules at ' + new Date();
    node.save();

    logger.log('Update complete with rules disabled.');
  } finally {
    utils.enableRules();
    logger.log('Rules re-enabled.');
  }
}

/**
 * Set the current locale for the thread.
 *
 * utils.setLocale(localeStr):
 *   - localeStr examples: "en", "en_US", "de_DE"
 *
 * Affects:
 *   - I18NUtil.getMessage()
 *   - date / number formatting in some contexts
 */
function example_utils_setLocale() {
  var oldLocale = utils.getLocale();
  logger.log('Old locale: ' + oldLocale);

  utils.setLocale('de_DE');
  var newLocale = utils.getLocale();
  logger.log('New locale after setLocale("de_DE"): ' + newLocale);

  // Restore
  utils.setLocale(oldLocale);
  logger.log('Locale restored to: ' + utils.getLocale());
}

/**
 * Get the current thread's locale string.
 *
 * Usually something like:
 *   - "en"
 *   - "en_US"
 *   - "de_DE"
 */
function example_utils_getLocale() {
  var localeStr = utils.getLocale();
  logger.log('Current locale: ' + localeStr);
}
