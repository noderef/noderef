/**
 * AUDIT ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - audit -> ScriptAuditService (wraps Alfresco AuditService)
 *
 * Main capabilities:
 *   - enable / disable auditing globally
 *   - check if auditing is enabled globally or for a specific app+path
 *   - list audit applications
 *   - query audit entries
 *   - clear audit logs per application (optionally within time ranges)
 *
 * Important note about query():
 *   query(appName, user, path, fromTime, toTime, forward, limit, valuesRequired)
 *
 * In the current Java code, "path" is accepted in the JS method signature
 * but NOT used to set params.setPath(path).
 * That means filtering by path does NOT work in this wrapper.
 *
 * Also: valuesRequired is accepted but not honored: valuesRequired() always returns true.
 */

/**
 * Check if auditing is enabled globally.
 */
function example_isAllEnabled() {
  var enabled = audit.isAllEnabled();
  logger.log('Audit globally enabled: ' + enabled);
}

/**
 * Enable auditing globally.
 */
function example_enableAll() {
  audit.enableAll();
  logger.log('Audit enabled globally.');
}

/**
 * Disable auditing globally.
 */
function example_disableAll() {
  audit.disableAll();
  logger.log('Audit disabled globally.');
}

/**
 * Check if audit is enabled for a specific application and path.
 *
 * appName is the audit application name, e.g. "alfresco-access"
 * path is the audit path, e.g. "/alfresco-access/transaction/action"
 */
function example_isEnabledFor_appPath() {
  var appName = 'alfresco-access';
  var path = '/alfresco-access/transaction';

  var enabled = audit.isEnabledFor(appName, path);
  logger.log('Audit enabled for ' + appName + ' at ' + path + ': ' + enabled);
}

/**
 * List all registered audit applications.
 *
 * Returns Map<String, AuditApplication>
 * In JS you typically inspect keys only.
 */
function example_getApplications() {
  var apps = audit.getApplications();

  logger.log('Audit applications:');
  for (var appName in apps) {
    if (apps.hasOwnProperty(appName)) {
      logger.log('  ' + appName);
    }
  }
}

/**
 * Clear all audit entries for an application.
 *
 * WARNING: destructive.
 */
function example_clearAll_forApp() {
  var appName = 'alfresco-access';
  audit.clearAll(appName);
  logger.log('Cleared all audit entries for app: ' + appName);
}

/**
 * Clear audit entries for an application in a time range.
 *
 * start is inclusive, end is exclusive.
 * Use epoch millis.
 *
 * WARNING: destructive.
 */
function example_clear_forApp_timeRange() {
  var appName = 'alfresco-access';

  // last 24 hours
  var end = new Date().getTime();
  var start = end - 24 * 60 * 60 * 1000;

  audit.clear(appName, start, end);
  logger.log('Cleared audit entries for app ' + appName + ' from ' + start + ' to ' + end);
}

/**
 * Query audit entries with minimal parameters.
 *
 * Defaults in Java wrapper:
 *   limit = 25
 *   valuesRequired = true (always)
 *
 * forward:
 *   true  -> oldest to newest
 *   false -> newest to oldest
 */
function example_query_basic() {
  var appName = 'alfresco-access';
  var user = null;
  var path = null; // accepted but currently not used in wrapper
  var fromTime = null;
  var toTime = null;
  var forward = false; // newest first
  var limit = 10;
  var valuesRequired = true;

  var results = audit.query(appName, user, path, fromTime, toTime, forward, limit, valuesRequired);

  logger.log('Query returned ' + countKeys(results) + ' entries.');

  for (var entryId in results) {
    if (results.hasOwnProperty(entryId)) {
      var entry = results[entryId];
      logger.log(
        'Entry ' +
          entryId +
          ' | app=' +
          entry.applicationName +
          ' | user=' +
          entry.user +
          ' | time=' +
          entry.time
      );
    }
  }
}

/**
 * Query audit entries for a specific user in the last hour.
 */
function example_query_user_lastHour() {
  var appName = 'alfresco-access';
  var user = 'admin';
  var path = null; // accepted but currently not used in wrapper

  var toTime = new Date().getTime();
  var fromTime = toTime - 60 * 60 * 1000;

  var forward = true; // oldest -> newest
  var limit = 50;
  var valuesRequired = true;

  var results = audit.query(appName, user, path, fromTime, toTime, forward, limit, valuesRequired);
  logger.log('Query returned ' + countKeys(results) + ' entries.');

  for (var entryId in results) {
    if (results.hasOwnProperty(entryId)) {
      var entry = results[entryId];
      logger.log(
        'Entry ' +
          entryId +
          ' | user=' +
          entry.user +
          ' | time=' +
          new Date(entry.time) +
          ' | valuesKeys=' +
          countKeys(entry.values)
      );
    }
  }
}

/**
 * Query audit entries and print important fields from entry.values
 *
 * "values" is a map with audit path keys like:
 *   /alfresco-access/transaction/action
 *   /alfresco-access/transaction/sub-actions
 *   /alfresco-access/transaction/path
 *   /alfresco-access/transaction/node
 *
 * Keys vary by application, so treat it as dynamic.
 */
function example_query_and_dumpValues() {
  var appName = 'alfresco-access';
  var user = null;
  var path = null;

  var forward = false;
  var limit = 5;

  var results = audit.query(appName, user, path, null, null, forward, limit, true);

  for (var entryId in results) {
    if (!results.hasOwnProperty(entryId)) {
      continue;
    }

    var entry = results[entryId];
    logger.log('--- Audit entry: ' + entryId + ' ---');
    logger.log('app: ' + entry.applicationName);
    logger.log('user: ' + entry.user);
    logger.log('time: ' + new Date(entry.time));

    // dump values map
    var values = entry.values;
    if (values) {
      for (var k in values) {
        if (values.hasOwnProperty(k)) {
          logger.log('  ' + k + ' = ' + values[k]);
        }
      }
    } else {
      logger.log('  values: <null>');
    }
  }
}

/**
 * Helper: count keys of a JS object/map.
 */
function countKeys(obj) {
  if (!obj) return 0;
  var c = 0;
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) c++;
  }
  return c;
}

/**
 * Example: quick audit health check for an app.
 *
 * - confirms auditing is enabled globally
 * - lists applications
 * - runs a small query
 */
function example_audit_healthCheck() {
  logger.log('Audit globally enabled: ' + audit.isAllEnabled());

  var apps = audit.getApplications();
  logger.log('Known audit apps: ' + countKeys(apps));

  var appName = 'alfresco-access';
  var results = audit.query(appName, null, null, null, null, false, 3, true);
  logger.log('Sample query for ' + appName + ' returned: ' + countKeys(results) + ' entries');
}
