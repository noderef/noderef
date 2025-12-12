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
 * List all registered action names on the repository.
 *
 * Useful for discovering what you can call with actions.create().
 */
function example_listRegisteredActions() {
  var registered = actions.getRegistered();

  logger.log('Registered actions: ' + registered.length);
  for (var i = 0; i < registered.length; i++) {
    logger.log('  - ' + registered[i]);
  }
}

/**
 * actions.create("actionName") returns a ScriptAction object.
 *
 * A ScriptAction let you:
 *   - set parameter values (action.parameters["paramName"] = value)
 *   - execute it against a ScriptNode (node.executeAction(action))
 *
 * To find which parameters a particular action supports, check Alfresco docs
 * or log the ActionDefinition on the server. Unfortunately the JS API
 * doesn't expose parameter metadata directly.
 */

/**
 * Add an aspect to a node using the "add-aspect" action.
 */
function example_addAspect() {
  var node = companyhome.childByNamePath('Shared/test.txt');
  if (!node) {
    logger.log('File not found');
    return;
  }

  var action = actions.create('add-aspect');
  if (!action) {
    logger.log('Action not available: add-aspect');
    return;
  }

  action.parameters['aspect-name'] = 'cm:versionable';

  node.executeAction(action);

  logger.log('Aspect cm:versionable added to: ' + node.nodeRef);
}

/**
 * Copy a node to another folder using "copy".
 *
 * Parameters:
 *   - destination-folder (nodeRef)
 *   - inherit-permissions (boolean, optional)
 */
function example_copyNode() {
  var source = companyhome.childByNamePath('Shared/test.txt');
  var targetFolder = companyhome.childByNamePath('Shared/Archive');

  if (!source || !targetFolder) {
    logger.log('Missing source or target');
    return;
  }

  var action = actions.create('copy');
  action.parameters['destination-folder'] = targetFolder.nodeRef.toString();

  source.executeAction(action);

  logger.log(
    'Copied ' + source.name + ' into ' + targetFolder.displayPath + '/' + targetFolder.name
  );
}

/**
 * Move a node using the "move" action.
 */
function example_moveNode() {
  var source = companyhome.childByNamePath('Shared/test.txt');
  var dest = companyhome.childByNamePath('Shared/Archive');

  var action = actions.create('move');
  action.parameters['destination-folder'] = dest.nodeRef.toString();

  source.executeAction(action);

  logger.log('Moved ' + source.name + ' to Archive folder');
}

/**
 * Apply a client-side transformation (e.g. transform to PDF).
 *
 * Common action: "transform"
 * Parameters usually include:
 *   - destination-folder
 *   - association-name
 *   - mime-type
 */
function example_transformToPdf() {
  var node = companyhome.childByNamePath('Shared/test.docx');
  var outFolder = companyhome.childByNamePath('Shared/Converted');

  if (!node || !outFolder) {
    logger.log('Unable to locate node or output folder');
    return;
  }

  var action = actions.create('transform');
  action.parameters['destination-folder'] = outFolder.nodeRef.toString();
  action.parameters['mime-type'] = 'application/pdf';

  node.executeAction(action);

  logger.log('Converted ' + node.name + ' to PDF');
}

/**
 * Extract metadata using the "extract-metadata" action.
 */
function example_extractMetadata() {
  var node = companyhome.childByNamePath('Shared/photo.jpg');

  var action = actions.create('extract-metadata');
  if (!action) {
    logger.log('Metadata extract action not available');
    return;
  }

  node.executeAction(action);

  logger.log('Extracted metadata from: ' + node.nodeRef);
}

/**
 * Alfresco supports composite actions and condition-based actions, but the
 * Script API exposes only create/execute primitives. If your repository is
 * configured with custom action definitions, you can call them the same way:
 *
 *   var action = actions.create("my-custom-action");
 *   action.parameters["foo"] = "bar";
 *   node.executeAction(action);
 *
 * These execute on the *repo tier*, not Share-tier client actions.
 */

/**
 * Run a custom action (example name).
 */
function example_runCustomAction() {
  var node = companyhome.childByNamePath('Shared/test.txt');

  var action = actions.create('my-custom-action');
  if (!action) {
    logger.log('Custom action not registered');
    return;
  }

  action.parameters['message'] = 'Hello from script';
  action.parameters['flag'] = true;

  node.executeAction(action);

  logger.log('Custom action executed.');
}
