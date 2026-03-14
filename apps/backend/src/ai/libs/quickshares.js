/**
 * QUICKSHARES ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - quickshares -> ScriptQuickshareService (wraps Alfresco QuickShareService)
 *
 * API:
 *   - quickshares.shareContent(node: ScriptNode): String (shareId)
 *   - quickshares.unshareContent(shareId: String): void
 *   - quickshares.getMetadata(shareId: String): Map<String,Object>   (map under "item")
 *   - quickshares.getMetadata(node: ScriptNode): Map<String,Object>  (map under "item" or null)
 *
 * Notes:
 *   - QuickShare is intended for *documents*, not folders.
 *   - shareContent() will throw if a folder is passed.
 *   - getMetadata(node) can return null if the node is not shared.
 *   - getMetadata() returns the internal "item" map from the QuickShareService metadata model.
 */

/**
 * Share a document and print the share ID.
 */
function example_shareContent() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var shareId = quickshares.shareContent(doc);
  logger.log('Shared document ' + doc.name + ' with shareId: ' + shareId);
}

/**
 * Unshare a document by shareId.
 *
 * This removes anonymous access.
 */
function example_unshareContent() {
  var shareId = 'abc123xyz'; // replace with a real one

  quickshares.unshareContent(shareId);
  logger.log('Unshared content with shareId: ' + shareId);
}

/**
 * Get metadata for an existing share ID.
 */
function example_getMetadata_byShareId() {
  var shareId = 'abc123xyz'; // replace with a real one

  var meta = quickshares.getMetadata(shareId);
  if (!meta) {
    logger.log('No metadata found (shareId may not exist): ' + shareId);
    return;
  }

  logger.log('Metadata keys for shareId=' + shareId + ':');
  for (var k in meta) {
    logger.log('  ' + k + ' = ' + meta[k]);
  }

  // Common useful fields (depend on Alfresco version)
  logger.log('name: ' + meta.name);
  logger.log('nodeRef: ' + meta.nodeRef);
}

/**
 * Get metadata for a node (works even if node is not shared).
 * Returns null if the node has no active QuickShare.
 */
function example_getMetadata_byNode() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var meta = quickshares.getMetadata(doc);
  if (!meta) {
    logger.log('Document is not quick-shared: ' + doc.nodeRef);
    return;
  }

  logger.log('QuickShare metadata for node: ' + doc.nodeRef);
  for (var k in meta) {
    logger.log('  ' + k + ' = ' + meta[k]);
  }
}

/**
 * Share a document only if it is not already shared.
 *
 * Uses getMetadata(node) to check.
 */
function example_shareOnlyIfNotShared() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var existing = quickshares.getMetadata(doc);
  if (existing && existing.sharedId) {
    logger.log('Already shared: shareId=' + existing.sharedId);
    return;
  }

  var shareId = quickshares.shareContent(doc);
  logger.log('New share created: shareId=' + shareId);
}

/**
 * Re-share a document: unshare if shared, then share again.
 *
 * Useful if you want a new token / invalidate old share links.
 */
function example_rotateShareId() {
  var doc = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!doc) {
    logger.log('Document not found.');
    return;
  }

  var meta = quickshares.getMetadata(doc);
  if (meta && meta.sharedId) {
    quickshares.unshareContent(meta.sharedId);
    logger.log('Unshared old shareId: ' + meta.sharedId);
  }

  var newShareId = quickshares.shareContent(doc);
  logger.log('New shareId: ' + newShareId);
}
