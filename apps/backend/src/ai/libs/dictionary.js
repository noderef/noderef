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
 * DICTIONARY ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - dictionary -> ScriptDictionaryService
 *
 * API (from this class):
 *   - dictionary.getAllTypes() : Collection<QName>
 *   - dictionary.isSubType(typeQName, ofTypeQName) : boolean
 *   - dictionary.getType(typeQName) : TypeDefinition
 *   - dictionary.getAspect(aspectQName) : AspectDefinition
 *   - dictionary.getPropertyNames(classQName) : JS Array of prefixed QNames
 *   - dictionary.getPropertyDefinitions(classQName) : Object { "prefix:qname": PropertyDefinition, ... }
 *   - dictionary.getPropertyDefinition(propQName) : PropertyDefinition | null
 *   - dictionary.isMultivalued(propQName) : boolean
 *   - dictionary.hasListConstaint(propQName) : boolean   (method name has a typo: Constaint)
 *
 * QName strings can be like:
 *   - "cm:content"
 *   - "{http://www.alfresco.org/model/content/1.0}content"
 */

/**
 * List a subset of all types in the dictionary.
 */
function example_listAllTypes() {
  var types = dictionary.getAllTypes(); // Collection<QName>
  logger.log('Total types: ' + types.length);

  // Print first N to avoid massive logs
  var max = Math.min(types.length, 50);
  for (var i = 0; i < max; i++) {
    // QName objects usually stringify nicely, but toPrefixString() is safest when available
    var t = types[i];
    logger.log('Type: ' + t);
  }
}

/**
 * Check if one type is a subtype of another.
 */
function example_isSubType() {
  var type = 'cm:content';
  var ofType = 'cm:cmobject';

  var isSub = dictionary.isSubType(type, ofType);
  logger.log(type + ' is subtype of ' + ofType + ': ' + isSub);
}

/**
 * Fetch a type definition and print some basics.
 */
function example_getTypeDefinition() {
  var typeName = 'cm:content';
  var td = dictionary.getType(typeName);

  if (!td) {
    logger.log('No type definition found for: ' + typeName);
    return;
  }

  logger.log('Type: ' + typeName);
  logger.log('Title: ' + td.getTitle());
  logger.log('Description: ' + td.getDescription());
  logger.log('Parent: ' + td.getParentName());
}

/**
 * Fetch an aspect definition and print some basics.
 */
function example_getAspectDefinition() {
  var aspectName = 'cm:auditable';
  var ad = dictionary.getAspect(aspectName);

  if (!ad) {
    logger.log('No aspect definition found for: ' + aspectName);
    return;
  }

  logger.log('Aspect: ' + aspectName);
  logger.log('Title: ' + ad.getTitle());
  logger.log('Description: ' + ad.getDescription());
}

/**
 * Get property names for a class (type), including default aspects.
 *
 * IMPORTANT: getPropertyNames() merges:
 *   - type properties
 *   - properties from default aspects (recursive)
 */
function example_getPropertyNames_forType() {
  var className = 'cm:content';
  var props = dictionary.getPropertyNames(className);

  logger.log('Property count for ' + className + ': ' + props.length);

  // Print a few
  var max = Math.min(props.length, 40);
  for (var i = 0; i < max; i++) {
    logger.log('  ' + props[i]);
  }
}

/**
 * Get property definitions for a class (type), keyed by prefixed QName string.
 */
function example_getPropertyDefinitions_forType() {
  var className = 'cm:content';
  var defs = dictionary.getPropertyDefinitions(className);

  // defs is a ScriptableHashMap, behaves like an object/map in Rhino
  logger.log('Definitions loaded for ' + className);

  // Example: inspect known property
  var propName = 'cm:name';
  var pd = defs[propName];
  if (!pd) {
    logger.log('No definition for ' + propName + ' (maybe not in this class/aspects)');
    return;
  }

  logger.log('Property: ' + propName);
  logger.log('  Title: ' + pd.getTitle());
  logger.log('  DataType: ' + pd.getDataType().getName());
  logger.log('  Mandatory: ' + pd.isMandatory());
  logger.log('  MultiValued: ' + pd.isMultiValued());
}

/**
 * Get a single property definition by QName.
 */
function example_getPropertyDefinition() {
  var propQName = 'cm:creator';
  var pd = dictionary.getPropertyDefinition(propQName);

  if (!pd) {
    logger.log('Property does not exist: ' + propQName);
    return;
  }

  logger.log('Property: ' + propQName);
  logger.log('  DataType: ' + pd.getDataType().getName());
  logger.log('  Mandatory: ' + pd.isMandatory());
  logger.log('  MultiValued: ' + pd.isMultiValued());
}

/**
 * Check whether a property is multivalued using dictionary.isMultivalued().
 *
 * Note: this method uses QName.createQName(propertyName, namespaceService),
 * so pass "cm:taggable" style qnames, not plain strings.
 */
function example_isMultivalued() {
  var propQName = 'cm:taggable'; // not a property; example only
  try {
    var multi = dictionary.isMultivalued(propQName);
    logger.log(propQName + ' multivalued: ' + multi);
  } catch (e) {
    logger.log('Failed multivalue check for ' + propQName + ': ' + e);
  }
}

/**
 * Check whether a property has a LIST constraint.
 *
 * Method name in Java is hasListConstaint (typo), so call that exact name.
 */
function example_hasListConstraint() {
  var propQName = 'cm:country'; // example only (depends on your model)
  try {
    var has = dictionary.hasListConstaint(propQName);
    logger.log(propQName + ' has LIST constraint: ' + has);
  } catch (e) {
    logger.log('Failed constraint check for ' + propQName + ': ' + e);
  }
}

/**
 * Practical helper: print properties of a node's type + its applied aspects.
 *
 * This uses the node itself to pick a class name, then uses dictionary.getPropertyNames().
 */
function example_printProperties_forNodeType() {
  var node = companyhome.childByNamePath('Shared');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var typeQName = String(node.typeShort); // e.g. "cm:folder" in many script environments
  logger.log('Node type: ' + typeQName);

  var props = dictionary.getPropertyNames(typeQName);
  logger.log('Known properties for ' + typeQName + ': ' + props.length);

  var max = Math.min(props.length, 50);
  for (var i = 0; i < max; i++) {
    logger.log('  ' + props[i]);
  }
}
