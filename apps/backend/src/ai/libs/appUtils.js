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
 * Examples for Alfresco ApplicationScriptUtils root object: appUtils
 *
 * The environment is expected to provide:
 *   - appUtils (ApplicationScriptUtils)
 *   - logger   (JavascriptConsoleScriptLogger)
 *
 * These examples mirror how search.js and groups.js are structured.
 */

/**
 * Convert a node to JSON using long-form QNames.
 */
function example_toJSON_longQNames() {
  var nodeRef = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = search.findNode(nodeRef);

  if (!node) {
    logger.log('Cannot convert to JSON. Node not found: ' + nodeRef);
    return;
  }

  var json = appUtils.toJSON(node);
  logger.log('JSON with long-form QNames:');
  logger.log(json);
}

/**
 * Convert a node to JSON using short-form QNames.
 */
function example_toJSON_shortQNames() {
  var nodeRef = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = search.findNode(nodeRef);

  if (!node) {
    logger.log('Cannot convert to JSON. Node not found: ' + nodeRef);
    return;
  }

  var json = appUtils.toJSON(node, true);
  logger.log('JSON with short-form QNames:');
  logger.log(json);
}

/**
 * Build a download URL for a document node.
 */
function example_getDownloadAPIUrl_document() {
  var nodeRef = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = search.findNode(nodeRef);

  if (!node) {
    logger.log('Cannot generate download URL. Node not found: ' + nodeRef);
    return;
  }

  var url = appUtils.getDownloadAPIUrl(node);
  logger.log('Download URL: ' + url);
}

/**
 * Requesting a download URL for a container node returns an empty string.
 */
function example_getDownloadAPIUrl_container() {
  // Use Company Home (always a folder)
  var node = search.selectNodes('/app:company_home')[0];

  if (!node) {
    logger.log('Company Home not found');
    return;
  }

  var url = appUtils.getDownloadAPIUrl(node);

  if (url === '') {
    logger.log('Container node: no download URL available');
  } else {
    logger.log('Unexpected URL for container: ' + url);
  }
}

/**
 * Convert a node to JSON and also show its download URL if it's a document.
 */
function example_toJSON_and_download() {
  var ref = 'workspace://SpacesStore/01234567-89ab-cdef-0123-456789abcdef';
  var node = search.findNode(ref);

  if (!node) {
    logger.log('Node not found: ' + ref);
    return;
  }

  logger.log('JSON (long QNames):');
  logger.log(appUtils.toJSON(node));

  var download = appUtils.getDownloadAPIUrl(node);
  logger.log('Download URL: ' + download);
}
