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

/**
 * MESSAGES ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - messages -> ScriptMessageService (wraps Alfresco MessageService)
 *
 * API:
 *   - messages.get(key) / messages.getMessage(key) : String
 *   - messages.get(key, paramsArray) / messages.getMessage(key, paramsArray) : String
 *       params MUST be a JS Array (converted to java.util.List by ValueConverter)
 *   - messages.getRegisteredBundles() : JS Array<String>
 *
 * Notes:
 *   - messages.get(...) is just an alias for getMessage(...)
 *   - Parameterized messages work like MessageFormat:
 *       e.g. "hello.user=Hello {0}" -> messages.get("hello.user", ["John"])
 */

/**
 * Get a simple message by key.
 */
function example_getMessage_simple() {
  var key = 'alfresco.tutorial.message.key'; // replace with real bundle key
  var msg = messages.get(key);

  logger.log('Key: ' + key);
  logger.log('Message: ' + msg);
}

/**
 * Get a message using getMessage() (same as get()).
 */
function example_getMessage_simple_getMessage() {
  var key = 'cm_contentmodel.type.cm_content.title'; // example key; depends on bundles installed
  var msg = messages.getMessage(key);

  logger.log(key + ' -> ' + msg);
}

/**
 * Get a parameterized message.
 *
 * Your Java wrapper expects the params to be a JS array (Scriptable),
 * which ValueConverter converts into a java.util.List.
 */
function example_getMessage_withParams() {
  // Example bundle entry:
  // my.greeting=Hello {0}, today is {1}
  var key = 'my.greeting';

  // MUST be an array-like object, NOT a plain string / map.
  var params = ['Alice', new Date()];

  try {
    var msg = messages.get(key, params);
    logger.log(key + ' -> ' + msg);
  } catch (e) {
    logger.log('Failed to resolve message with params: ' + e);
  }
}

/**
 * Demonstrate that params must be an array.
 *
 * This will throw because Preconditions.checkArgument expects List<?> after conversion.
 */
function example_getMessage_withWrongParams() {
  var key = 'my.greeting';

  // Not an array -> will fail
  var badParams = { name: 'Alice' };

  try {
    var msg = messages.get(key, badParams);
    logger.log('Message: ' + msg);
  } catch (e) {
    logger.log('Expected failure: params must be an array. Error: ' + e);
  }
}

/**
 * List all registered message bundles.
 *
 * This can help diagnose missing translations / keys.
 */
function example_listRegisteredBundles() {
  var bundles = messages.getRegisteredBundles();
  logger.log('Registered bundles: ' + bundles.length);

  for (var i = 0; i < bundles.length; i++) {
    logger.log('  ' + bundles[i]);
  }
}

/**
 * Quick diagnostics: attempt to resolve a set of keys and report missing ones.
 *
 * MessageService typically returns the key itself or null depending on config;
 * behavior differs by Alfresco version/config.
 */
function example_checkKeysExist() {
  var keys = ['my.greeting', 'my.missing.key', 'cm_contentmodel.type.cm_content.title'];

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = messages.get(k);

    // A common pattern: if missing, some configs return the key unchanged
    var looksMissing = v === null || v === undefined || v === k;

    logger.log((looksMissing ? '[MISSING?] ' : '[OK] ') + k + ' -> ' + v);
  }
}
