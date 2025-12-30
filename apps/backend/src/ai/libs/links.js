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
 * LINKS ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - links -> ScriptLinkService (wraps Alfresco DocumentLinkService)
 *
 * API:
 *   - links.createLink(sourceDoc, targetFolder) : ScriptNode   (the created link node)
 *   - links.deleteLinks(sourceDocOrFolder) : DeleteLinksStatusReport
 *   - links.getSource(linkNode) : ScriptNode | null
 *
 * Notes:
 *   - "link" nodes are created in the target folder and point back to the original source document.
 *   - deleteLinks() removes links *to* a document (and may support folders depending on Alfresco impl).
 *   - getSource() returns null if the passed node is not a link.
 */

/**
 * Create a document link in another folder.
 */
function example_createLink() {
  var source = companyhome.childByNamePath('Shared/some-document.pdf');
  var targetFolder = companyhome.childByNamePath('User Homes');

  if (!source) {
    logger.log('Source document not found.');
    return;
  }
  if (!targetFolder) {
    logger.log('Target folder not found.');
    return;
  }

  try {
    var linkNode = links.createLink(source, targetFolder);
    logger.log('Created link node: ' + linkNode.name + ' (' + linkNode.nodeRef + ')');
    logger.log('Link created in folder: ' + targetFolder.displayPath + '/' + targetFolder.name);
  } catch (e) {
    logger.log('Failed to create link: ' + e);
  }
}

/**
 * Create a link into a specific folder path.
 */
function example_createLink_byPath() {
  var source = companyhome.childByNamePath('Shared/some-document.pdf');
  var targetFolder = companyhome.childByNamePath('Shared/Links');

  if (!source || !targetFolder) {
    logger.log('Source or target folder not found.');
    return;
  }

  var linkNode = links.createLink(source, targetFolder);
  logger.log('Created link: ' + linkNode.nodeRef);
}

/**
 * Given a link node, get the original source document.
 */
function example_getSource_fromLink() {
  var linkNode = companyhome.childByNamePath('Shared/Links/some-document.pdf'); // link name often matches
  if (!linkNode) {
    logger.log('Link node not found.');
    return;
  }

  var source = links.getSource(linkNode);
  if (!source) {
    logger.log('This node is not a document link: ' + linkNode.nodeRef);
    return;
  }

  logger.log('Link node:   ' + linkNode.name + ' (' + linkNode.nodeRef + ')');
  logger.log('Source node: ' + source.name + ' (' + source.nodeRef + ')');
}

/**
 * Defensive helper: "is this node a link?"
 * (Because links.getSource(node) returns null when it isn’t.)
 */
function example_isLinkNode() {
  var node = companyhome.childByNamePath('Shared/Links/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var source = links.getSource(node);
  logger.log('Is link: ' + (source ? 'yes' : 'no'));
}

/**
 * Delete all links pointing to a source document (cleanup).
 *
 * Returns DeleteLinksStatusReport. Fields depend on Alfresco version,
 * so log it first and then inspect methods/properties.
 */
function example_deleteLinks_forDocument() {
  var source = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!source) {
    logger.log('Source document not found.');
    return;
  }

  try {
    var report = links.deleteLinks(source);
    logger.log('Delete links report: ' + report);

    // If your DeleteLinksStatusReport exposes getters, probe them:
    // try { logger.log('Deleted: ' + report.getDeletedLinksCount()); } catch (e1) {}
    // try { logger.log('Failed: ' + report.getFailedLinksCount()); } catch (e2) {}
  } catch (e) {
    logger.log('Failed to delete links: ' + e);
  }
}

/**
 * Round-trip test:
 * - create link
 * - resolve source from link
 * - delete all links for source
 */
function example_roundTrip_linkLifecycle() {
  var source = companyhome.childByNamePath('Shared/some-document.pdf');
  var targetFolder = companyhome.childByNamePath('Shared/Links');

  if (!source || !targetFolder) {
    logger.log('Source or target folder not found.');
    return;
  }

  var linkNode = links.createLink(source, targetFolder);
  logger.log('Created link: ' + linkNode.nodeRef);

  var resolved = links.getSource(linkNode);
  logger.log('Resolved source: ' + (resolved ? resolved.nodeRef : 'null'));

  var report = links.deleteLinks(source);
  logger.log('Deleted links report: ' + report);
}
