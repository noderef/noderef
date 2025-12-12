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
 * Check whether logging is enabled at all.
 *
 * Note:
 *   - This mirrors ScriptLogger.isLoggingEnabled()
 *   - In practice this is tied to debug logging on the underlying logger.
 */
function example_logger_isLoggingEnabled() {
  var enabled = logger.isLoggingEnabled();
  logger.info('Logging enabled: ' + enabled);
}

/**
 * Basic logging at all levels: debug, info, warn, error.
 *
 * In the JS Console this will:
 *   - write to the configured SLF4J / Log4j backend
 *   - print to the console result area (via JavascriptConsoleScriptObject.print)
 */
function example_logger_basicLevels() {
  logger.debug('Debug: entered example_logger_basicLevels()');
  logger.info('Info: doing some work here');
  logger.warn('Warn: this is just a demo warning');
  logger.error('Error: simulated error condition for demo');

  logger.info('Finished example_logger_basicLevels()');
}

/**
 * Check which log levels are enabled on the ScriptLogger backend.
 *
 * Useful when tweaking log configuration or log4j2.properties.
 */
function example_logger_checkLevels() {
  var flags = {
    logging: logger.isLoggingEnabled(),
    debug: logger.isDebugLoggingEnabled(),
    info: logger.isInfoLoggingEnabled(),
    warn: logger.isWarnLoggingEnabled(),
    error: logger.isErrorLoggingEnabled(),
  };

  logger.info('Logger enabled levels:');
  logger.info('  logging: ' + flags.logging);
  logger.info('  debug  : ' + flags.debug);
  logger.info('  info   : ' + flags.info);
  logger.info('  warn   : ' + flags.warn);
  logger.info('  error  : ' + flags.error);

  return flags;
}

/**
 * Use logger.log() as a generic "debug-ish" logging method.
 *
 * In JavascriptConsoleScriptLogger.log():
 *   - backend uses logger.debug(...)
 *   - console prints "DEBUG - <message>"
 */
function example_logger_logAlias() {
  logger.log('logger.log() example: this is treated as DEBUG internally');
}

/**
 * Demonstrate logger.getSystem().out() which writes both to:
 *   - System.out
 *   - JavaScript Console result
 */
function example_logger_systemOut() {
  var system = logger.getSystem();

  system.out('SystemOut: hello from JS Console');
  system.out('SystemOut: this goes to stdout AND the console result');

  logger.info('Wrote two lines via logger.getSystem().out()');
}

/**
 * Use logger to time a piece of work.
 *
 * This is a small inline helper function; you can copy it into your script and
 * adapt as needed.
 */
function example_logger_timedBlock() {
  function logTimed(name, fn) {
    if (typeof name !== 'string') {
      throw new Error('logTimed(name, fn): name must be a string');
    }
    if (typeof fn !== 'function') {
      throw new Error('logTimed(name, fn): fn must be a function');
    }

    var start = new Date().getTime();
    logger.debug('Starting: ' + name);

    var threw = false;
    var error;
    var result;

    try {
      result = fn();
    } catch (e) {
      threw = true;
      error = e;
    }

    var end = new Date().getTime();
    var delta = end - start;
    var msg = 'Finished: ' + name + ' in ' + delta + ' ms';

    if (threw) {
      logger.error(msg + ' (error: ' + error + ')');
      throw error;
    } else {
      logger.debug(msg);
      return result;
    }
  }

  // Example usage: time a simple loop
  var count = logTimed('count-to-1M', function () {
    var sum = 0;
    for (var i = 0; i < 100000; i++) {
      sum += i;
    }
    logger.info('Inside timed block: final sum = ' + sum);
    return sum;
  });

  logger.info('Timed block result = ' + count);
}

/**
 * Log a JavaScript object as JSON at debug level.
 *
 * This is handy to inspect complex data structures from repository scripts.
 */
function example_logger_structuredJson() {
  function logJson(label, obj) {
    var json;
    try {
      json = JSON.stringify(obj);
    } catch (e) {
      json = '[unserializable: ' + e + ']';
    }
    logger.debug(label + ': ' + json);
  }

  var sample = {
    time: new Date().toISOString(),
    user: person.properties['cm:userName'],
    email: person.properties['cm:email'],
    siteCount: (siteService.listSites(null, null, 0) || []).length,
  };

  logJson('Sample diagnostic payload', sample);
}

/**
 * Print a visible banner / separator into the console.
 *
 * Good for marking phases in larger maintenance scripts.
 */
function example_logger_banner() {
  function logBanner(title) {
    var line = '============================================================';
    logger.info(line);
    if (title && title.length) {
      logger.info('== ' + title);
      logger.info(line);
    }
  }

  logBanner('Before bulk operation');
  logger.info('Doing some work here...');
  logBanner('After bulk operation');
}

/**
 * Dynamically change log level for a specific logger name.
 *
 * Backed by:
 *   - JavascriptConsoleScriptLogger.setLevel(loggerName, level)
 *   - JavascriptConsoleScriptLogger.getLevel(loggerName)
 *
 * loggerName examples:
 *   - 'org.alfresco.repo.jscript.ScriptNode'
 *   - 'org.alfresco.repo.search.impl.lucene.LuceneQueryParser'
 *
 * level examples:
 *   - 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'
 */
function example_logger_dynamicLevel() {
  var targetLogger = 'org.alfresco.repo.jscript.ScriptNode';
  var newLevel = 'DEBUG';

  var oldLevel = logger.getLevel(targetLogger);
  logger.info('Current level for ' + targetLogger + ': ' + oldLevel);

  logger.info('Changing level for ' + targetLogger + ' -> ' + newLevel);
  logger.setLevel(targetLogger, newLevel);

  var effectiveLevel = logger.getLevel(targetLogger);
  logger.info('New effective level for ' + targetLogger + ': ' + effectiveLevel);
}

/**
 * Combined example: use logger for a small "job" with clear structure.
 *
 * This shows:
 *   - banner usage
 *   - info + debug + warn + error usage
 *   - exception handling and logging
 */
function example_logger_jobPattern() {
  function logBanner(title) {
    var line = '============================================================';
    logger.info(line);
    logger.info('== ' + title);
    logger.info(line);
  }

  logBanner('Demo job start');

  try {
    logger.info('Step 1: prepare data');
    // pretend work
    var now = new Date();
    logger.debug('Current timestamp: ' + now.toISOString());

    logger.info('Step 2: check something that might be unusual');
    var somethingSuspicious = false; // flip to true to see warn path
    if (somethingSuspicious) {
      logger.warn('Detected suspicious state, continuing carefully...');
    }

    logger.info('Step 3: maybe fail intentionally');
    var shouldFail = false; // flip to true to see error path
    if (shouldFail) {
      throw new Error('Intentional failure for demo');
    }

    logger.info('Demo job completed successfully.');
  } catch (e) {
    logger.error('Demo job failed: ' + e);
    // optionally rethrow if you want script failure:
    // throw e;
  } finally {
    logBanner('Demo job end');
  }
}
