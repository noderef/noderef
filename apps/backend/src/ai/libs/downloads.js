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
 * DOWNLOADS ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - downloads -> ScriptDownloadService (wraps Alfresco DownloadService)
 *
 * API:
 *   - downloads.create(nodeOrNodes, recursive) : ScriptNode (download request node)
 *       overloads:
 *         create(ScriptNode node, boolean recursive)
 *         create(ScriptNode[] nodes, boolean recursive)
 *   - downloads.createByNodeRef(nodeRefString, recursive) : ScriptNode
 *   - downloads.createByNodeRefs(nodeRefStrings[], recursive) : ScriptNode
 *   - downloads.getStatus(downloadRequestNodeOrNodeRef) : DownloadStatus
 *   - downloads.cancel(downloadRequestNodeOrNodeRef) : void
 *
 * Notes:
 *   - create* returns the "download request" node (a ScriptNode).
 *   - status is a DownloadStatus object from Alfresco DownloadService.
 *   - cancel stops a running / pending download request.
 */

/**
 * Create a download request for a single document (ScriptNode).
 */
function example_createDownload_forSingleNode() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var recursive = false;

  var request = downloads.create(doc, recursive);
  logger.log('Created download request nodeRef: ' + request.nodeRef);
  logger.log('Created download request name: ' + request.name);

  var status = downloads.getStatus(request);
  logger.log('Status: ' + status);
}

/**
 * Create a download request for multiple nodes (ScriptNode[]).
 */
function example_createDownload_forMultipleNodes() {
  var doc1 = companyhome.childByNamePath('Shared/doc1.pdf');
  var doc2 = companyhome.childByNamePath('Shared/doc2.pdf');

  var nodes = [];
  if (doc1) nodes.push(doc1);
  if (doc2) nodes.push(doc2);

  if (nodes.length === 0) {
    logger.log('No documents found.');
    return;
  }

  var recursive = false;

  var request = downloads.create(nodes, recursive);
  logger.log('Created download request: ' + request.nodeRef);

  var status = downloads.getStatus(request);
  logger.log('Status: ' + status);
}

/**
 * Create a download request for a folder, recursively.
 * (This usually means "zip the folder contents".)
 */
function example_createDownload_forFolderRecursive() {
  var folder = companyhome.childByNamePath('Shared');
  if (!folder) {
    logger.log('Folder not found.');
    return;
  }

  var recursive = true;

  var request = downloads.create(folder, recursive);
  logger.log('Created recursive download request for folder: ' + folder.name);
  logger.log('Request nodeRef: ' + request.nodeRef);

  var status = downloads.getStatus(request);
  logger.log('Status: ' + status);
}

/**
 * Create a download request using a NodeRef string.
 */
function example_createDownload_byNodeRefString() {
  var nodeRef = 'workspace://SpacesStore/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  var recursive = false;

  try {
    var request = downloads.createByNodeRef(nodeRef, recursive);
    logger.log('Created download request nodeRef: ' + request.nodeRef);

    var status = downloads.getStatus(String(request.nodeRef));
    logger.log('Status: ' + status);
  } catch (e) {
    logger.log('Failed to create download: ' + e);
  }
}

/**
 * Create a download request using multiple NodeRef strings.
 */
function example_createDownload_byNodeRefStrings() {
  var nodeRefs = [
    'workspace://SpacesStore/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'workspace://SpacesStore/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  ];

  var recursive = false;

  try {
    var request = downloads.createByNodeRefs(nodeRefs, recursive);
    logger.log('Created download request nodeRef: ' + request.nodeRef);

    var status = downloads.getStatus(String(request.nodeRef));
    logger.log('Status: ' + status);
  } catch (e) {
    logger.log('Failed to create download: ' + e);
  }
}

/**
 * Poll download status until it finishes (simple loop).
 *
 * Caution:
 * - In JS Console, tight loops can be annoying. Keep sleeps short / limited.
 * - Some environments don’t have a sleep() helper. If you don’t, just run status checks manually.
 */
function example_pollDownloadStatus() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var request = downloads.create(doc, false);
  var requestRef = String(request.nodeRef);

  logger.log('Request created: ' + requestRef);

  // Try a few times. If your environment has utils.sleep(ms), you can add pauses.
  for (var i = 0; i < 10; i++) {
    var status = downloads.getStatus(requestRef);

    // DownloadStatus typically has useful fields like status, done, total etc (depends on Alfresco version).
    // In scripts you can usually just log the object or probe properties.
    logger.log('Poll #' + (i + 1) + ' -> ' + status);

    // Heuristic: many DownloadStatus implementations have a "getStatus()" or "status" string,
    // but we can't assume exact API here. If yours supports it, adapt this check.
    // If not, stop polling manually when logs show completion.
  }
}

/**
 * Cancel a download request using ScriptNode.
 */
function example_cancelDownload_byNode() {
  var requestNodeRef = 'workspace://SpacesStore/cccccccc-cccc-cccc-cccc-cccccccccccc';

  try {
    // cancel() overload accepts a nodeRef string directly
    downloads.cancel(requestNodeRef);
    logger.log('Cancel requested for download request: ' + requestNodeRef);
  } catch (e) {
    logger.log('Cancel failed: ' + e);
  }
}

/**
 * Cancel a download request using a ScriptNode reference (if you have it).
 */
function example_cancelDownload_byScriptNode() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var request = downloads.create(doc, false);
  logger.log('Created request: ' + request.nodeRef);

  // Cancel immediately
  downloads.cancel(request);
  logger.log('Canceled request: ' + request.nodeRef);

  var status = downloads.getStatus(request);
  logger.log('Status after cancel: ' + status);
}
