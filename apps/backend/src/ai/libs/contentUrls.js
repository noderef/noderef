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
 * CONTENT URLS ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - contentUrls -> ScriptContentUrlResolver
 *
 * API:
 *   - contentUrls.getContentUrl(nodeRefString) : String
 *
 * Notes:
 *   - node must be a NodeRef string like: "workspace://SpacesStore/...."
 *   - throws if the node has no content (folder, missing node, or no content property)
 */

/**
 * Get content URL from a known nodeRef string.
 */
function example_getContentUrl_fromNodeRefString() {
  var nodeRef = 'workspace://SpacesStore/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

  try {
    var url = contentUrls.getContentUrl(nodeRef);
    logger.log('Content URL for ' + nodeRef + ': ' + url);
  } catch (e) {
    logger.log('Could not get content URL for ' + nodeRef + ': ' + e);
  }
}

/**
 * Get content URL from a ScriptNode.
 *
 * ScriptContentUrlResolver expects a string, so pass node.nodeRef (stringified).
 */
function example_getContentUrl_fromScriptNode() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  try {
    // doc.nodeRef is typically "workspace://SpacesStore/...."
    var url = contentUrls.getContentUrl(String(doc.nodeRef));
    logger.log('Doc: ' + doc.name);
    logger.log('NodeRef: ' + doc.nodeRef);
    logger.log('Content URL: ' + url);
  } catch (e) {
    logger.log('Could not get content URL: ' + e);
  }
}

/**
 * Example: iterate documents in a folder and print their content URLs.
 *
 * Skips folders and catches exceptions per node.
 */
function example_listContentUrls_inFolder() {
  var folder = companyhome.childByNamePath('Shared');
  if (!folder) {
    logger.log('Folder not found: Shared');
    return;
  }

  var children = folder.children;
  logger.log('Children: ' + children.length);

  for (var i = 0; i < children.length; i++) {
    var node = children[i];
    if (!node.isDocument) {
      continue;
    }

    try {
      var url = contentUrls.getContentUrl(String(node.nodeRef));
      logger.log(node.name + ' -> ' + url);
    } catch (e) {
      logger.log(node.name + ' -> cannot resolve content URL: ' + e);
    }
  }
}

/**
 * Example: guard rails before calling getContentUrl().
 *
 * The resolver will throw for folders / missing content.
 * This avoids obvious failures.
 */
function example_safeGetContentUrl() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  if (!node.isDocument) {
    logger.log('Not a document: ' + node.name);
    return;
  }

  // Many docs have cm:content, but not all. This check is cheap in scripts.
  var hasContent = node.properties && node.properties['cm:content'];
  if (!hasContent) {
    logger.log('Document has no cm:content: ' + node.name);
    return;
  }

  try {
    var url = contentUrls.getContentUrl(String(node.nodeRef));
    logger.log('Content URL: ' + url);
  } catch (e) {
    logger.log('Failed to resolve content URL: ' + e);
  }
}
