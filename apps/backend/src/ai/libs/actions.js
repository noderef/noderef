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

/**
 * Export a node structure to an ACP file.
 *
 * Parameters:
 *   - store: Store containing the node (e.g. "workspace://SpacesStore")
 *   - package-name: Name of the ACP file (without extension)
 *   - destination: Folder where the ACP file will be saved
 *   - include-children: boolean
 *   - include-self: boolean
 *   - encoding: Character encoding (e.g. "UTF-8")
 */
function example_exportACP() {
  // Example path - adjust as needed
  var nodeToExport = companyhome.childByNamePath('Sites/swsdp/documentLibrary');
  if (!nodeToExport) {
    logger.log('Node to export not found');
    return;
  }

  var exportAction = actions.create('export');
  if (!exportAction) {
    logger.log('Action not available: export');
    return;
  }

  exportAction.parameters['store'] = 'workspace://SpacesStore';
  exportAction.parameters['package-name'] = 'ACPexport';
  exportAction.parameters['destination'] = companyhome;
  exportAction.parameters['include-children'] = true;
  exportAction.parameters['include-self'] = false;
  exportAction.parameters['encoding'] = 'UTF-8';

  // execute() can be called on the action object passing the node
  exportAction.execute(nodeToExport);

  logger.log('Export action executed for: ' + nodeToExport.name);
}

/**
 * Import an ACP file to a destination folder.
 *
 * Parameters:
 *   - destination: Target folder (nodeRef)
 *   - encoding: Character encoding (e.g. "UTF-8")
 */
function example_importACP() {
  // Example paths - adjust as needed
  var targetNodeForImport = companyhome.childByNamePath('Sites/swsdp/documentLibrary');
  var ACPFile = companyhome.childByNamePath('ACPexport.acp');

  if (!targetNodeForImport || !ACPFile) {
    logger.log('Target node (Sites/swsdp/documentLibrary) or ACP file (ACPexport.acp) not found');
    return;
  }

  var importAction = actions.create('import');
  if (!importAction) {
    logger.log('Action not available: import');
    return;
  }

  importAction.parameters['encoding'] = 'UTF-8';
  importAction.parameters['destination'] = targetNodeForImport;

  // Execute the import action on the ACP file node
  importAction.execute(ACPFile);

  logger.log('Import action executed for: ' + ACPFile.name);
}
