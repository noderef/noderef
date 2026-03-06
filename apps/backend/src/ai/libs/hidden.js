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
 * HIDDEN ROOT OBJECT EXAMPLES (OOTBee Support Tools)
 *
 * Root object:
 *   - hidden -> ScriptHiddenAspect (wraps Alfresco HiddenAspect)
 *
 * API:
 *   - hidden.hideNodeExplicit(node) : void
 *   - hidden.unhideNode(node) : void
 *   - hidden.hasHiddenAspect(node) : boolean
 *   - hidden.removeHiddenAspect(node) : void
 *   - hidden.onHiddenPath(node) : HiddenFileInfo | null
 *
 * Notes:
 *   - HiddenAspect is used by Alfresco to hide nodes from certain clients / listings.
 *   - Behavior can depend on client and configuration (e.g. CIFS/WebDAV/etc).
 *   - onHiddenPath(node) returns HiddenFileInfo if the node is on a hidden path.
 */

/**
 * Hide a node explicitly.
 */
function example_hideNodeExplicit() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  hidden.hideNodeExplicit(node);
  logger.log('Node explicitly hidden: ' + node.name + ' (' + node.nodeRef + ')');

  var has = hidden.hasHiddenAspect(node);
  logger.log('Has hidden aspect now: ' + has);
}

/**
 * Unhide a node (reverses explicit hiding).
 */
function example_unhideNode() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  hidden.unhideNode(node);
  logger.log('Unhide requested: ' + node.name);

  var has = hidden.hasHiddenAspect(node);
  logger.log('Has hidden aspect now: ' + has);
}

/**
 * Check if a node has the hidden aspect.
 */
function example_hasHiddenAspect() {
  var node = companyhome.childByNamePath('Shared');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var has = hidden.hasHiddenAspect(node);
  logger.log('Has hidden aspect: ' + has + ' for ' + node.name + ' (' + node.nodeRef + ')');
}

/**
 * Remove hidden aspect completely.
 *
 * Difference vs unhideNode():
 *   - unhideNode() calls hiddenAspect.unhideExplicit(...)
 *   - removeHiddenAspect() calls hiddenAspect.removeHiddenAspect(...)
 *
 * Depending on how the hidden state was applied (explicit vs inherited),
 * removeHiddenAspect can be a stronger cleanup.
 */
function example_removeHiddenAspect() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  hidden.removeHiddenAspect(node);
  logger.log('Removed hidden aspect: ' + node.name);

  var has = hidden.hasHiddenAspect(node);
  logger.log('Has hidden aspect now: ' + has);
}

/**
 * Check whether a node is on a hidden path.
 *
 * onHiddenPath() returns HiddenFileInfo (Java object) or null.
 * What you can read from HiddenFileInfo depends on Alfresco version,
 * so safest is to log it and probe.
 */
function example_onHiddenPath() {
  var node = companyhome.childByNamePath('Shared/some-document.pdf');
  if (!node) {
    logger.log('Node not found.');
    return;
  }

  var info = hidden.onHiddenPath(node);
  if (!info) {
    logger.log('Node is NOT on a hidden path: ' + node.name);
    return;
  }

  logger.log('Node IS on a hidden path: ' + node.name);
  logger.log('HiddenFileInfo: ' + info);

  // If your HiddenFileInfo exposes methods, you can probe like:
  // try { logger.log('Hidden: ' + info.isHidden()); } catch (e) {}
  // try { logger.log('Reason: ' + info.getReason()); } catch (e) {}
  // (method names vary by version)
}

/**
 * Convenience: hide a folder and verify hidden state for a child.
 */
function example_hideFolder_thenCheckChild() {
  var folder = companyhome.childByNamePath('Shared');
  if (!folder) {
    logger.log('Folder not found.');
    return;
  }

  hidden.hideNodeExplicit(folder);
  logger.log('Folder hidden: ' + folder.name);

  var child = folder.childByNamePath('some-document.pdf');
  if (!child) {
    logger.log('Child not found under folder.');
    return;
  }

  var info = hidden.onHiddenPath(child);
  logger.log('Child on hidden path? ' + (info ? 'yes' : 'no'));
}
