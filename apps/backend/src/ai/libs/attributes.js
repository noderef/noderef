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
 * ATTRIBUTES ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - attributes -> ScriptAttributeService (wraps Alfresco AttributeService)
 *
 * Notes:
 *   - All keys are treated as Serializable, provided as strings in JS
 *   - createAttribute(...) will fail if the attribute already exists
 *   - setAttribute(...) will create or overwrite
 *   - removeAttributes(...) can remove whole branches
 *   - getAttributes(...) returns a NativeObject representing a subtree:
 *       - if it matches exactly: { value: <theValue> }
 *       - if it matches children: { childKey: value, ... }
 *       - can return nested objects for 2-level depth
 */

/**
 * Get an attribute by key path.
 *
 * Returns:
 *   - String/Number/Boolean/object (Serializable) or null
 */
function example_getAttribute() {
  var value = attributes.getAttribute('myApp', 'config', 'maxItems');

  if (value !== null) {
    logger.log('Attribute myApp/config/maxItems = ' + value);
  } else {
    logger.log('Attribute not found');
  }
}

/**
 * Check if an attribute exists.
 */
function example_exists() {
  var exists = attributes.exists('myApp', 'config', 'maxItems');
  logger.log('Exists: ' + exists);
}

/**
 * Create a string attribute (fails if exists).
 */
function example_createAttribute_string() {
  var key1 = 'myApp';
  var key2 = 'config';
  var key3 = 'mode';

  if (attributes.exists(key1, key2, key3)) {
    logger.log('Attribute already exists: ' + key1 + '/' + key2 + '/' + key3);
    return;
  }

  attributes.createAttribute('PROD', key1, key2, key3);
  logger.log('Created string attribute: ' + key1 + '/' + key2 + '/' + key3);
}

/**
 * Create a number attribute (fails if exists).
 */
function example_createAttribute_number() {
  var key1 = 'myApp';
  var key2 = 'config';
  var key3 = 'maxItems';

  if (attributes.exists(key1, key2, key3)) {
    logger.log('Attribute already exists: ' + key1 + '/' + key2 + '/' + key3);
    return;
  }

  attributes.createAttribute(100, key1, key2, key3);
  logger.log('Created number attribute: ' + key1 + '/' + key2 + '/' + key3 + ' = 100');
}

/**
 * Create a boolean attribute (fails if exists).
 */
function example_createAttribute_boolean() {
  var key1 = 'myApp';
  var key2 = 'features';
  var key3 = 'enableX';

  if (attributes.exists(key1, key2, key3)) {
    logger.log('Attribute already exists: ' + key1 + '/' + key2 + '/' + key3);
    return;
  }

  attributes.createAttribute(true, key1, key2, key3);
  logger.log('Created boolean attribute: ' + key1 + '/' + key2 + '/' + key3 + ' = true');
}

/**
 * Set (create or overwrite) a string attribute.
 */
function example_setAttribute_string() {
  attributes.setAttribute('DEV', 'myApp', 'config', 'mode');
  logger.log('Set myApp/config/mode = DEV');
}

/**
 * Set (create or overwrite) a number attribute.
 */
function example_setAttribute_number() {
  attributes.setAttribute(250, 'myApp', 'config', 'maxItems');
  logger.log('Set myApp/config/maxItems = 250');
}

/**
 * Set (create or overwrite) a boolean attribute.
 */
function example_setAttribute_boolean() {
  attributes.setAttribute(false, 'myApp', 'features', 'enableX');
  logger.log('Set myApp/features/enableX = false');
}

/**
 * Remove a single attribute (exact key path).
 */
function example_removeAttribute() {
  attributes.removeAttribute('myApp', 'config', 'mode');
  logger.log('Removed attribute myApp/config/mode');
}

/**
 * Remove a whole subtree of attributes.
 *
 * Example: remove everything under:
 *   myApp/config/*
 *
 * This delegates to AttributeService.removeAttributes(keys)
 */
function example_removeAttributes_subtree() {
  attributes.removeAttributes('myApp', 'config');
  logger.log('Removed attribute subtree: myApp/config/*');
}

/**
 * Special removal: removeAttributes(key1, null, key3)
 *
 * This wrapper supports a special case:
 *   keys.length == 3 && keys[1] == null
 *
 * It removes ALL tuples where:
 *   [0] == key1 AND [2] == key3
 *
 * i.e. delete:
 *   myApp/<any>/mode
 */
function example_removeAttributes_middleWildcard() {
  var root = 'myApp';
  var middle = null; // IMPORTANT: must be null (not empty string)
  var leaf = 'mode';

  attributes.removeAttributes(root, middle, leaf);
  logger.log('Removed all attributes matching: ' + root + '/*/' + leaf);
}

/**
 * Get a subtree of attributes as a JS object.
 *
 * This returns a NativeObject with:
 *   - { value: ... } if the path matches exactly one attribute
 *   - { someKey: value, ... } for children
 *   - { someKey: { otherKey: value } } for 2-level nesting
 */
function example_getAttributes_subtree() {
  var obj = attributes.getAttributes('myApp');

  logger.log('Attributes under "myApp":');
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      logger.log('  ' + k + ' = ' + obj[k]);
    }
  }
}

/**
 * Get attributes for a branch and inspect nested objects.
 *
 * Example structure:
 *   attributes.setAttribute("DEV", "myApp", "config", "mode")
 *   attributes.setAttribute(250, "myApp", "config", "maxItems")
 *
 * getAttributes("myApp", "config") might return:
 *   { mode: "DEV", maxItems: 250 }
 */
function example_getAttributes_branch() {
  // 7. GET ALL ATTRIBUTES UNDER A KEY PATH
  var attrs = attributes.getAttributes('myApp', 'config');
  logger.log('Attributes under myApp/config:');

  for (var key in attrs) {
    // Use the global Object prototype to safely check the property
    if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      logger.log('  ' + key + ' = ' + attrs[key]);
    }
  }
}

/**
 * Get exact attribute via getAttributes() and read obj.value
 *
 * If you call getAttributes() with the full key path:
 *   getAttributes("myApp", "config", "mode")
 *
 * It will return:
 *   { value: "DEV" }
 */
function example_getAttributes_exactValue() {
  var obj = attributes.getAttributes('myApp', 'config', 'mode');

  if (obj && obj.value !== undefined) {
    logger.log('Exact attribute value = ' + obj.value);
  } else {
    logger.log('No exact attribute found.');
  }
}

/**
 * "Upsert" helper: create if missing, otherwise set.
 *
 * This is often what you want for config-like attributes.
 */
function example_upsertAttribute() {
  var key1 = 'myApp';
  var key2 = 'config';
  var key3 = 'maxItems';
  var value = 500;

  if (attributes.exists(key1, key2, key3)) {
    attributes.setAttribute(value, key1, key2, key3);
    logger.log('Updated attribute: ' + key1 + '/' + key2 + '/' + key3 + ' = ' + value);
  } else {
    attributes.createAttribute(value, key1, key2, key3);
    logger.log('Created attribute: ' + key1 + '/' + key2 + '/' + key3 + ' = ' + value);
  }
}
