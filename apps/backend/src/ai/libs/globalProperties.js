/**
 * globalProperties root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - globalProperties -> ScriptVariablesService
 *
 * API:
 *   - globalProperties.get(key) -> String | null
 *   - globalProperties.get(key, otherwise) -> String
 *   - globalProperties.getProperties() -> java.util.Properties
 *
 * Notes:
 *   - Reads properties from Alfresco's "global-properties" bean
 *   - Useful for environment-specific config without hardcoding
 */

/**
 * Read a property (returns null if missing).
 */
function example_globalProperties_basicRead() {
  var dbType = globalProperties.get('db.driver');
  logger.log('db.driver = ' + dbType);
}

/**
 * Read a property with fallback value.
 */
function example_globalProperties_withFallback() {
  var env = globalProperties.get('my.project.environment', 'dev');
  logger.log('Environment = ' + env);
}

/**
 * Use property to configure script logic.
 * Example: enable/disable behavior depending on a flag.
 */
function example_globalProperties_featureFlag() {
  var enabled = globalProperties.get('my.script.enabled', 'false') === 'true';
  if (!enabled) {
    logger.warn('Feature disabled by configuration (my.script.enabled=false)');
    return;
  }

  logger.log('Feature enabled, continuing...');
}

/**
 * Read numeric properties safely.
 */
function example_globalProperties_numeric() {
  function getInt(key, defaultValue) {
    var val = globalProperties.get(key, '' + defaultValue);
    var parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      logger.warn(
        'Property ' + key + ' is not a number: ' + val + ', using default=' + defaultValue
      );
      return defaultValue;
    }
    return parsed;
  }

  var batchSize = getInt('my.script.batchSize', 200);
  logger.log('batchSize = ' + batchSize);
}

/**
 * Dump selected known keys.
 * (Avoid dumping everything: global properties can include secrets)
 */
function example_globalProperties_dumpSelected() {
  var keys = [
    'alfresco.host',
    'alfresco.port',
    'alfresco.context',
    'share.host',
    'share.port',
    'dir.root',
  ];

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    logger.log(k + ' = ' + globalProperties.get(k, '<not set>'));
  }
}

/**
 * DO NOT do this unless you're absolutely sure no secrets are present.
 * There is no clean JS iteration for java.util.Properties,
 * but it is possible via Java enumeration.
 */
function example_globalProperties_javaIteration_USE_WITH_CARE() {
  var props = globalProperties.getProperties();
  var names = props.propertyNames(); // java.util.Enumeration
  while (names.hasMoreElements()) {
    var key = names.nextElement();
    var value = props.getProperty(key);
    logger.log(key + ' = ' + value);
  }
}
